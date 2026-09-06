# packager

Creates Bedrock `.mcpack` files for staged behavior and resource packs, plus a
combined `.mcaddon` containing those pack files.

The generated format 3 manifests normalize pack versions to Bedrock's semantic
version object format, such as `{ "major": 1, "minor": 0, "patch": 0 }`.

The filter reads `BP` and `RP` from Regolith's `.regolith/tmp` directory. Run it
after filters such as `brarchive` so the packaged files contain their output.

Add this filter only to a production profile. Regolith does not pass the active
profile name to custom filters, so profile selection belongs in `config.json`.
The Passive Totem `dev` profile intentionally does not include this filter.

The default output directory is `build/packages`, and the default artifact name
comes from the project's `config.json` name. Set `outputDir` or `name` in the
filter settings to override them. Both paths are relative to the project root.

