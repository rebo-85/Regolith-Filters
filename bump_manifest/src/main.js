const fs = require("fs");
const path = require("path");

const VERSION_DIR = path.join(".", "data", "bump_manifest");
const VERSION_FILE = path.join(VERSION_DIR, "version.json");

function createVersionFile() {
  fs.mkdirSync(VERSION_DIR, { recursive: true });
  fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: [1, 0, 0] }, null, 4));
}

function getVersion() {
  // Create version file if it doesn't exist
  if (!fs.existsSync(VERSION_FILE)) {
    createVersionFile();
  }

  // Read version file
  const fileContent = fs.readFileSync(VERSION_FILE, "utf8");
  const data = JSON.parse(fileContent);

  // Increment last number in array (patch version)
  data.version[data.version.length - 1] += 1;

  // Write updated version back to file
  fs.writeFileSync(VERSION_FILE, JSON.stringify(data, null, 4) + "\n");

  return data.version;
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
  const version = getVersion();
  console.log("Current pack version:", version.join("."));

  const targetPacks = ["RP", "BP"];
  for (const pack of targetPacks) {
    const manifestPath = path.join(".", pack, "manifest.json");

    if (fs.existsSync(manifestPath)) {
      try {
        const content = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(content);
        const updatedManifest = updateManifest(manifest, version);

        fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 4) + "\n");
      } catch (err) {
        console.error(`Failed to update ${pack}/manifest.json:`, err);
      }
    }
  }
}

main();
