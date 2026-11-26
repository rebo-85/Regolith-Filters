const fs = require("fs");
const path = require("path");

const VERSION_DIR = path.join(".", "data", "bump_manifest");
const VERSION_FILE = path.join(VERSION_DIR, "version.json");
const VERSION_BUMP_ENV = "BUMP_MANIFEST_VERSION_BUMP";
const VERSION_BUMP_TYPES = new Set(["major", "minor", "patch"]);

function incrementVersion(version, bumpType) {
  if (!Array.isArray(version) || version.length !== 3 || !version.every((part) => Number.isInteger(part) && part >= 0)) {
    throw new Error(`${VERSION_FILE} must contain a version array of three non-negative integers.`);
  }

  const [major, minor, patch] = version;
  switch (bumpType) {
    case "major":
      return [major + 1, 0, 0];
    case "minor":
      return [major, minor + 1, 0];
    case "patch":
      return [major, minor, patch + 1];
    default:
      throw new Error(`${VERSION_BUMP_ENV} must be one of: ${[...VERSION_BUMP_TYPES].join(", ")}.`);
  }
}

// Works out the version this run writes, without touching any file. `text` is what version.json will contain.
function getVersion() {
  // First release: keep the initial 1.0.0 without bumping
  if (!fs.existsSync(VERSION_FILE)) {
    const data = { version: [1, 0, 0] };
    return { version: data.version, text: JSON.stringify(data, null, 4) };
  }

  const data = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));

  const bumpType = process.env[VERSION_BUMP_ENV] || "patch";
  if (!VERSION_BUMP_TYPES.has(bumpType)) {
    throw new Error(`${VERSION_BUMP_ENV} must be one of: ${[...VERSION_BUMP_TYPES].join(", ")}.`);
  }
  data.version = incrementVersion(data.version, bumpType);

  return { version: data.version, text: JSON.stringify(data, null, 4) + "\n" };
}

// Manifests may contain comments and a BOM; blank them out like brarchive does before parsing.
function stripComments(text) {
  return text.replace(/("(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)/g, (match) => {
    return match.startsWith('"') ? match : match.replace(/[^\r\n]/g, " ");
  });
}

function readManifest(manifestPath) {
  return JSON.parse(stripComments(fs.readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, "")));
}

/**
 * Formats a [major, minor, patch] version according to manifest format_version.
 * format_version >= 3 expects strings ("1.0.0"), earlier versions expect arrays ([1, 0, 0]).
 */
function formatVersion(versionArray, formatVersionNum) {
  if (formatVersionNum >= 3) {
    return versionArray.join(".");
  }
  return versionArray;
}

function updateManifest(manifest, versionArray) {
  const formatVer = manifest.format_version || 1;
  const targetVersion = formatVersion(versionArray, formatVer);

  // Update header
  if (manifest.header) {
    manifest.header.version = targetVersion;
  }

  // Update selected modules
  const allowedTypes = new Set(["resources", "data"]);
  if (Array.isArray(manifest.modules)) {
    for (const module of manifest.modules) {
      if (allowedTypes.has(module.type)) {
        module.version = targetVersion;
      }
    }
  }

  // Update dependencies with UUID
  if (Array.isArray(manifest.dependencies)) {
    for (const dep of manifest.dependencies) {
      if (dep.uuid !== undefined) {
        dep.version = targetVersion;
      }
    }
  }

  return manifest;
}

function main() {
  const { version, text: versionText } = getVersion();
  console.log("Current pack version:", version.join("."));

  // Prepare every manifest first. If any of them cannot be read or parsed, nothing is written
  // (neither a manifest nor version.json) and the filter fails, so the build cannot ship a mismatched version.
  const updates = [];
  const failures = [];
  for (const pack of ["RP", "BP"]) {
    const manifestPath = path.join(".", pack, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const updated = updateManifest(readManifest(manifestPath), version);
      updates.push({ manifestPath, text: JSON.stringify(updated, null, 4) + "\n" });
    } catch (err) {
      failures.push(`${pack}/manifest.json: ${err.message}`);
    }
  }
  if (failures.length > 0) {
    console.error(`Could not update ${failures.length} manifest(s); nothing was changed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`);
    process.exit(1);
  }

  for (const { manifestPath, text } of updates) fs.writeFileSync(manifestPath, text);

  // version.json is written last, so a failed run never leaves a bumped version behind.
  fs.mkdirSync(VERSION_DIR, { recursive: true });
  fs.writeFileSync(VERSION_FILE, versionText);
}

main();
