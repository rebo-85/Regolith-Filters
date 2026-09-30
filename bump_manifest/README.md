# Bump Manifest

A utility filter/script for Regolith and Minecraft Bedrock Edition development that automatically increments pack versions in `manifest.json` files and normalizes version formats based on schema specifications.

---

## 📌 Features

- **Automatic Version Incrementing**: Bumps the patch number (`X.Y.Z + 1`) every time the script runs.
- **Format Version Aware**:
  - **`format_version: 3`**: Writes versions as semantic strings (e.g., `"1.0.1"`).
  - **`format_version: 1` or `2`**: Writes versions as integer arrays (e.g., `[1, 0, 1]`).
- **Targeted Updating**: Updates `header.version`, relevant data/resource `modules`, and dependent pack modules using UUIDs without altering script dependency versions (e.g., `@minecraft/server`).
- **Persistent Version Tracking**: Manages state using a local `data/bump_manifest/version.json` file.

---

## 🚀 Usage

### 1. Standalone Execution

Ensure Node.js is installed, then execute:

```bash
node bump_manifest.js
```

### 2. Regolith Pipeline Integration

Add the script as a filter in your Regolith `config.json`:

```json
{
  "filterDefinitions": {
    "bump_manifest": {
      "runWith": "nodejs",
      "script": "bump_manifest.js"
    }
  },
  "profiles": {
    "default": {
      "filters": [
        {
          "filter": "bump_manifest"
        }
      ]
    }
  }
}
```

---

## ⚙️ How It Works

1. **Reads or Creates State**: Looks for `data/bump_manifest/version.json`. If missing, initializes it at `[1, 0, 0]`.
2. **Increments Patch Version**: Adds `1` to the third digit (`patch`).
3. **Inspects `manifest.json`**:
   - Reads `format_version` in both `BP/manifest.json` and `RP/manifest.json`.
   - Converts the integer array `[major, minor, patch]` to `"major.minor.patch"` if `format_version >= 3`.
4. **Applies Versioning**:
   - `manifest.header.version`
   - `manifest.modules` where `type` is `"data"` or `"resources"`
   - `manifest.dependencies` containing a `uuid` property

---

## 📄 File Structure Created

```text
data/
└── bump_manifest/
    └── version.json   # Stores persistent state: { "version": [1, 0, 1] }
```

---

## ⚠️ Notes

- **Script Modules**: JavaScript/TypeScript script module versions (e.g., `"type": "script"`) and engine dependencies are preserved and will **not** be overwritten by the version bump.
