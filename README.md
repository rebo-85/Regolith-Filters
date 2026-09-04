# ReBo Regolith Filters

Reusable Regolith filters for ReBo Bedrock addon repositories.

## Filters

- `obfuscate_pack`: obfuscates staged JSON pack files and keeps stable names in the project's `.obfuscation/map.json`.
- `brarchive`: archives staged `BP` and `RP` packs with a native Node.js encoder.

The filters are separate so an addon can use obfuscation without archiving, or archive packs without obfuscating them.

## Regolith configuration

Reference the repository root and select the filter by its directory name:

```json
"filterDefinitions": {
  "obfuscate_pack": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "v0.1.0"
  },
  "brarchive": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "v0.1.0"
  }
}
```

Use `obfuscate_pack` before `brarchive` in a profile's filter list.

The `brarchive` filter does not require `brarchive.exe`. It creates the
Bedrock-compatible `__brarchive` directories inside the staged packs. With a
`target` of `"local"`, Regolith exports those pack folders to `build`.
