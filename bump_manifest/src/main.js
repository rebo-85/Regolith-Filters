const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.env.ROOT_DIR || process.cwd();
const VERSION_FILE = path.join(ROOT_DIR, "packs", "data", "bump_manifest", "version.json");

function getAndIncrementVersion() {
  let version = [1, 0, 0];

  if (fs.existsSync(VERSION_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
      if (Array.isArray(data.version) && data.version.length === 3) {
        version = data.version;
      }
    } catch (e) {
      console.warn("Failed to read version.json, resetting to [1, 0, 0]");
    }
  } else {
    fs.mkdirSync(path.dirname(VERSION_FILE), { recursive: true });
  }

  // Increment patch version
  version[2] += 1;

  fs.writeFileSync(VERSION_FILE, JSON.stringify({ version }, null, 4));
  return version;
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

function updateManifest(manifestPath, versionArray) {
  if (!fs.existsSync(manifestPath)) return;

  const content = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(content);
  const formatVer = manifest.format_version || 1;
  const targetVersion = formatVersion(versionArray, formatVer);

  // Update header
  if (manifest.header) {
    manifest.header.version = targetVersion;
  }

  // Update data & resources modules
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

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Updated ${path.relative(ROOT_DIR, manifestPath)} to version:`, targetVersion);
}

function main() {
  const version = getAndIncrementVersion();
  console.log("Current pack version:", version.join("."));

  const targetPacks = ["RP", "BP"];
  for (const pack of targetPacks) {
    const manifestPath = path.join(ROOT_DIR, pack, "manifest.json");
    updateManifest(manifestPath, version);
  }
}

main();
