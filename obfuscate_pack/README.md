# obfuscate_pack

Obfuscates JSON files in the staged `BP` and `RP` packs. It discovers translatable symbols from each file's own definitions: client entities, behavior entities, animation controllers, animations, geometry, and render controllers. It then renames custom materials, textures, geometry, animations, controllers, controller states, render arrays, bones, particles, sounds, identifiers, properties, component groups, events, and script variables without translating arbitrary JSON keys.

Mappings are shared across both packs and stored in the addon project's `packs/data/obfuscate_pack/map.json`, so references remain stable between builds.

Namespace prefixes such as `namespace:`, `property:`, and `component_groups:` are preserved. Texture paths keep the `textures/` root while their child folders and filenames are obfuscated. Loot-table filenames are obfuscated and references are updated automatically.

The generated `textures/textures_list.json` is rewritten to match the obfuscated extensionless texture paths.

Sound assets under `sounds/` are renamed with the same six-letter format. `sounds/sound_definitions.json` and `sounds/music_definitions.json` keep their required filenames, while custom namespaced event keys and referenced sound paths are rewritten. Vanilla music keys remain unchanged.

Generated keys and filenames use the same six-character lowercase letter format, such as `zfaldp`.

Set the filter setting `"unicode": false` to disable encoding JSON string content as `\uXXXX` escapes. The option is enabled by default and does not change JSON structure.

Set `"flattenFolders": false` to retain obfuscated category subfolders instead of placing obfuscated files directly under their pack root folders. With flattening (the default), required lookup roots such as `models/blocks` and `models/entity` are preserved; files below those roots may still be obfuscated.

The filter also rewrites identifiers inside `.lang` translation keys after `name_ninja` runs, while preserving the human-readable translation values.

Client-entity aliases are only obfuscated when their values resolve to definitions or assets present in the staged packs. Vanilla animation, geometry, material, and texture references are left unchanged.

Run this filter before `brarchive` when publishing obfuscated archives.

## Choosing what to obfuscate

Every symbol category is obfuscated by default. Use the `obfuscate` setting to turn categories off, and the `exclude` setting to keep specific names readable:

```json
{
  "obfuscate": { "bones": false, "particles": false },
  "exclude": { "events": ["namespace:my_event"], "tags": ["namespace:my_tag"] }
}
```

`obfuscate` maps a category to a boolean. `exclude` maps a category to an array of original names that are left unchanged. Both must be objects, and invalid types throw an error. Available categories: `entityIds`, `blockIds`, `itemIds`, `tags`, `components`, `properties`, `componentGroups`, `events`, `geometry`, `animations`, `animationControllers`, `renderControllers`, `materials`, `textures`, `particles`, `sounds`, `animationStates`, `bones`, `renderArrays`, `scriptVariables`, and `blockStates`. The legacy category name `blocks` is accepted as an alias for `blockIds`.

Some categories share one symbol table, so settings affect more than the category name suggests:

- `entityIds`, `geometry`, `animations`, `animationControllers`, `renderControllers`, `particles`, and `sounds` share the references table (`refs`). Disabling any one of them stops obfuscation of all of them, and an `exclude` entry in any of them applies to every category using that table.
- `components`, `properties`, `componentGroups`, `events`, `geometry`, `animations`, `renderControllers`, `materials`, `textures`, `renderArrays`, and `blockStates` share the alias table (`aliases`) and behave the same way.
- `blockIds`, `itemIds`, `tags`, `animationStates`, `bones`, and `scriptVariables` each have their own table and can be toggled independently.

Bone names are matched case-insensitively, as Bedrock does. `rightArm`, `rightarm`, and `RIGHTARM` map to the same key, and `exclude.bones` entries are compared case-insensitively.

Changing symbol settings or the symbol format regenerates the affected keys in the map file on the next build.

## Number formatting

Decimal literals keep their decimal point through obfuscation (`0.0` stays `0.0`, `-90.0` stays `-90.0`). Bedrock rejects integer-looking defaults for `float` properties, so this matters for entity properties and `set_property` values.
