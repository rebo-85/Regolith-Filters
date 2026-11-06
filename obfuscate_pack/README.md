# obfuscate_pack

Obfuscates the staged `BP` and `RP` packs. It discovers renamable symbols from each file's own definitions (client entities, behavior entities, blocks, items, animation controllers, animations, geometry, render controllers, texture and sound definitions) and renames them consistently across every file and script that references them. It renames custom entity, block, and item identifiers, custom components, properties, block states, component groups, events, tags, materials, textures, geometry, animations, controllers, controller states, render arrays, bones, particles, sounds, and script variables. It does not translate arbitrary JSON keys.

## Map file

Mappings are shared across both packs and stored in the addon project, by default at `packs/data/obfuscate_pack/map.json`, so references remain stable between builds. The map is the key to your obfuscation: keep it out of the packs you publish.

- `mapDir` changes the directory (default `packs/data/obfuscate_pack`).
- `mapFile` changes the file name.
- `profile` stores the map as `<profile>.map.json`, which keeps separate mappings for separate build profiles. `mapFile` takes precedence over `profile`.

Each build prunes symbols that no longer appear in either pack, and symbols you turn off with `obfuscate` or `exclude` are not stored.

## What gets renamed

Namespace prefixes such as `namespace:`, `property:`, and `component_groups:` are preserved. Texture paths keep the `textures/` root while their child folders and filenames are obfuscated. Loot-table filenames are obfuscated and references are updated automatically.

The generated `textures/textures_list.json` is rewritten to match the obfuscated extensionless texture paths.

Sound assets under `sounds/` are renamed with the same six-letter format. `sounds/sound_definitions.json` and `sounds/music_definitions.json` keep their required filenames, while custom namespaced event keys and referenced sound paths are rewritten. Vanilla music keys remain unchanged.

Generated keys and filenames use the same six-character lowercase letter format, such as `zfaldp`.

Client-entity aliases are only obfuscated when their values resolve to definitions or assets present in the staged packs. Vanilla animation, geometry, material, and texture references are left unchanged.

The filter also rewrites identifiers inside `.lang` translation keys after `name_ninja` runs, while preserving the human-readable translation values.

## Settings

| Setting                        | Default           | Effect                                                                                                                                                                                                                                                                      |
| ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unicode`                      | `true`            | Encodes JSON string content as `\uXXXX` escapes. Does not change JSON structure; `format_version` keys are left readable. Set to `false` to disable.                                                                                                                        |
| `flattenFolders`               | `true`            | Places obfuscated files directly under their pack root folders. Set to `false` to retain obfuscated category subfolders. When flattening, required lookup roots such as `models/blocks` and `models/entity` are preserved; files below those roots may still be obfuscated. |
| `obfuscateFileNames`           | `true`            | Set to `false` to keep original file and folder names. Folders are still flattened if `flattenFolders` is on.                                                                                                                                                               |
| `obfuscateFileContents`        | `true`            | Set to `false` to leave JSON and `.lang` contents alone apart from updating file path references. Does not apply to JavaScript files.                                                                                                                                       |
| `obfuscate`                    | all categories on | Turns symbol categories off. See [Choosing what to obfuscate](#choosing-what-to-obfuscate).                                                                                                                                                                                 |
| `exclude`                      | none              | Keeps specific names readable. See [Choosing what to obfuscate](#choosing-what-to-obfuscate).                                                                                                                                                                               |
| `scripts`                      | off               | Obfuscates JavaScript files. See [Scripts](#scripts).                                                                                                                                                                                                                       |
| `strict`                       | `false`           | Fails the build if any file could not be obfuscated. See [Errors](#errors).                                                                                                                                                                                                 |
| `mapDir`, `mapFile`, `profile` | see above         | Where the map file is stored.                                                                                                                                                                                                                                               |

## Scripts

JavaScript files can be obfuscated by setting `scripts` in the filter arguments. `include` accepts pack-qualified glob patterns, `config` is a path to a `javascript-obfuscator` options JSON file, and `requirements` is the package directory where `javascript-obfuscator` is installed. Relative paths are resolved from the project root, and all three fields are required:

```json
{
  "scripts": {
    "include": ["BP/scripts/**/*.js"],
    "config": "packs/data/gametests/obfuscator.config.json",
    "requirements": "packs/data/gametests"
  }
}
```

Script string references are rewritten before the JavaScript obfuscator runs. Script files that do not match `include` still have their string references rewritten; they are just not run through the JavaScript obfuscator. Omitting `scripts` skips the JavaScript obfuscator entirely.

Run this filter before `brarchive` when publishing obfuscated archives.

## Choosing what to obfuscate

Every category is obfuscated by default. Use `obfuscate` to turn categories off and `exclude` to keep specific names readable:

```json
{
  "obfuscate": { "components": false, "itemComponents": true, "bones": false },
  "exclude": { "events": ["namespace:my_event"], "identifiers": ["namespace:boss"] }
}
```

`obfuscate` maps a category to a boolean. `exclude` maps a category to an array of original names that are left unchanged. Both must be objects, values must have the right type, and an unknown category name throws an error that lists the valid ones.

### Categories

Categories are grouped under parent categories. A parent is a shortcut for all of its children.

| Parent        | Children                                                                         |
| ------------- | -------------------------------------------------------------------------------- |
| `identifiers` | `entityIds`, `blockIds`, `itemIds`                                               |
| `components`  | `entityComponents`, `blockComponents` (including permutations), `itemComponents` |
| `properties`  | `entityProperties`, `blockStates`                                                |

These categories have no parent: `tags`, `componentGroups`, `events`, `geometry`, `animations`, `animationControllers`, `renderControllers`, `materials`, `textures`, `particles`, `sounds`, `animationStates`, `bones`, `renderArrays`, and `scriptVariables`.

Only custom names are renamed; anything starting with `minecraft:` is left alone.

### How settings combine

- The most specific `obfuscate` setting wins. A category uses its own value if set, otherwise its parent's, otherwise `true`. With `{ "components": false, "itemComponents": true }`, entity and block components stay readable while item components are still renamed.
- `exclude` lists add up. A child excludes the names listed under its own key and under its parent's key. Names listed under a child never affect the parent or its siblings.
- The same custom name can appear in more than one category, for example an identifier that is used as both an event and a component. A name is renamed everywhere or nowhere, so if any category it appears in is turned off or excludes it, the name stays readable.
- Categories no longer share state through the old reference and alias tables. Turning off one category does not affect others that happen to use the same internal table.
- Bone names are matched case-insensitively, as Bedrock does. `rightArm`, `rightarm`, and `RIGHTARM` map to the same key, and `exclude.bones` entries are compared case-insensitively.

The old `blocks` category name is no longer accepted. Use `blockIds`.

## Errors

If a file cannot be transformed, the original file is copied into the output so the build can finish. That file keeps its original names and references, so each one is reported on stderr, with a summary at the end of the build. Set `"strict": true` to fail the build instead. Invalid JSON in a pack file already fails the build while symbols are being collected, regardless of `strict`.

## Number formatting

Decimal literals keep their decimal point through obfuscation (`0.0` stays `0.0`, `-90.0` stays `-90.0`). Bedrock rejects integer-looking defaults for `float` properties, so this matters for entity properties and `set_property` values.
