# brarchive

Creates Bedrock-compatible `__brarchive` directories in the staged `BP` and
`RP` packs.

The filter includes a native Node.js encoder and does not require an external
executable.

The filter archives the files in each pack directory separately, matching the
structure produced by Bedrock. For example, files in `RP/entity` become
`RP/__brarchive/entity.brarchive`, and files in `RP/models/entity` become
`RP/__brarchive/models/entity.brarchive`. Pack metadata remains unarchived.

Regolith's `target: "local"` export writes the resulting pack folders to the
workspace `build` directory, so no output directory setting is required.
