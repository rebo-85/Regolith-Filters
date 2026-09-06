# obfuscate_pack

Obfuscates JSON files in the staged `BP` and `RP` packs. It discovers translatable symbols from each file's own definitions: client entities, behavior entities, animation controllers, animations, geometry, and render controllers. It then renames custom materials, textures, geometry, animations, controllers, controller states, render arrays, bones, particles, sounds, identifiers, properties, component groups, events, and script variables without translating arbitrary JSON keys.

Mappings are shared across both packs and stored in the addon project's `packs/data/obfuscate_pack/map.json`, so references remain stable between builds.

Namespace prefixes such as `rebo_ht:`, `p:`, and `cg:` are preserved. Texture paths keep the `textures/` root while their child folders and filenames are obfuscated. Loot-table filenames are obfuscated and references are updated automatically.

The generated `textures/textures_list.json` is rewritten to match the obfuscated extensionless texture paths.

Sound assets under `sounds/` are renamed with the same six-letter format. `sounds/sound_definitions.json` and `sounds/music_definitions.json` keep their required filenames, while custom namespaced event keys and referenced sound paths are rewritten. Vanilla music keys remain unchanged.

Generated keys and filenames use the same six-character lowercase letter format, such as `zfaldp`.

The filter also rewrites identifiers inside `.lang` translation keys after `name_ninja` runs, while preserving the human-readable translation values.

Client-entity aliases are only obfuscated when their values resolve to definitions or assets present in the staged packs. Vanilla animation, geometry, material, and texture references are left unchanged.

Run this filter before `brarchive` when publishing obfuscated archives.
