# obfuscate_pack

## 1.1.0

### Minor Changes

- Default folder flattening and Unicode string escaping to enabled; both can be disabled with `flattenFolders: false` and `unicode: false`.
- Add independent `obfuscateFileNames` and `obfuscateFileContents` options, both enabled by default. Required asset-path references are still updated when content obfuscation is disabled.
- Add per-category `obfuscate` boolean switches and `exclude` arrays for entity IDs, block IDs, item IDs, tags, components, properties, component groups, events, geometry, animations, animation and render controllers, materials, textures, particles, sounds, animation states, bones, render arrays, script variables, and block states. Keep `blocks` as an alias for `blockIds`.
- Obfuscate custom block component IDs, tags, terrain/item texture identifiers, and resource-pack `blocks.json` block-ID keys, keeping their references consistent across pack JSON, scripts, and language translation keys.
- Rewrite block, entity, and item IDs in `.lang` translation keys without changing translated values.
- Preserve the required `textures/flipbook_textures.json` filename and map each flipbook `atlas_tile` to its matching terrain texture identifier.
- Keep material-instance texture references aligned with terrain atlas identifiers when block IDs and texture IDs share a source name.
- Fall back to copying completed pack staging output when Windows denies a directory rename (`EPERM`/`EACCES`) or the rename crosses devices (`EXDEV`).

## 1.0.2

### Patch Changes

- minor fixes

## 1.0.1

### Patch Changes

- minor fixes

## 1.0.0

### Major Changes

- Initial release of obfuscate_pack
