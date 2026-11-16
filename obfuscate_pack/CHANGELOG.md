# obfuscate_pack

## 1.4.1

### Patch Changes

- Fix render controller array keys. Bedrock writes them as `Array.<name>` with a capital `A`, but only the lowercase `array.` prefix was recognised, so the whole key was replaced and the controller failed to load. The prefix is now matched case-insensitively and its casing is kept.
- With `unicode` on, `Array.<name>` keys are no longer escaped, because Bedrock matches them by their literal text (like `format_version`).
- Rewrite translation keys that appear as values in pack JSON, such as `minecraft:display_name` (`tile.ns:id.name`, `item.ns:id.name`, `entity.ns:id.name`), so they follow the renamed block, item and entity ids exactly like the matching `.lang` keys. This covers blocks, items and spawn eggs.
- Stop client-only alias names (geometry, material, texture, animation and render array names such as `wheel`, `door` or `hide`) from being rewritten inside scripts, `.lang` keys and translation-key strings. Only plain words that no script or language file ever refers to were affected, for example `"wheel"` becoming a hash while the object key `wheel:` stayed unchanged. Namespaced aliases (containing `:`) are unaffected.
- Rewrite `item_catalog/crafting_item_catalog.json`. The file keeps its required name and location, but its item ids and icons now follow the renamed ids, so creative groups and item catalogs keep working.
- Keep the bones named in a block's `minecraft:geometry` `bone_visibility` readable. Bedrock ignored `bone_visibility` when those bones were renamed, so every bone of the block showed at once.
- Rename `part_visibility` keys in render controllers together with the geometry bones. Before, a controller such as `{"*": false}, {"lever_base": true}` pointed at bones that no longer existed and hid the whole entity. A `part_visibility` key that shared its text with a client alias (such as `torch`) could also be rewritten to the alias instead of the bone.
- Keep the bones named in render controller `part_visibility` readable as well, for the same reason as `bone_visibility`.
- Never rename the bone names that Bedrock looks up itself: `rightItem`, `leftItem`, `rightArm` and `leftArm`. Renaming `rightItem` and `leftItem` stopped entities that show blocks as held items from rendering them. These reserved names apply whatever the `obfuscate` and `exclude` settings say.

## 1.4.0

### Minor Changes

- Add `minify` (default `true`): all JSON is written on one line, including `blocks.json`, `textures/textures_list.json`, `manifest.json` and `texts/languages.json`. Set `minify: false` for indented output.
- Add `shuffleKeys` and `shuffleSeed` to shuffle JSON object key order deterministically. Arrays, `format_version`, numeric-key objects, event bodies, `variables`, `ui/` files and fixed-name files keep their order.

## 1.3.1

### Patch Changes

- Handle sounds.json and resolve texture aliases

## 1.3.0

### Minor Changes

- Removed blocks legacy and add more filter categories

## 1.2.1

### Patch Changes

- Resolve `javascript-obfuscator` from the configured consumer requirements directory so Regolith cache installs do not need filter-local npm dependencies.

## 1.2.0

### Minor Changes

- Add optional JavaScript obfuscation through `scripts.include` glob patterns and a project-root-relative `scripts.config` path.

## 1.1.2

### Patch Changes

- update readme

## 1.1.1

### Patch Changes

- fix issue with float entity property

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
