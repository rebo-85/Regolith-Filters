# ReBo Regolith Filters

Reusable Regolith filters for ReBo Bedrock addon repositories.

## Filters

- `obfuscate_pack`: obfuscates staged JSON pack files and keeps stable names in the project's `.obfuscation/map.json`.
- `brarchive`: archives staged `BP` and `RP` packs with a native Node.js encoder.
- `packager`: packages staged behavior and resource packs as `.mcpack` and `.mcaddon` files.

## Release Workflow

After changing one or more filters, use the VS Code Command Palette
(`Tasks: Run Task`) and run these three steps:

1. Run **Create Changeset and Apply Version Bumps**.
2. Review the changed files and commit them in GitHub Desktop.
3. Run **Publish Release**. It creates the tags and pushes the commit and tags.

During the Changeset prompts:

- Use `Up` / `Down` to navigate, `Space` to select, and `Enter` to confirm.
- Select only the filters you changed. Select all three for an all-filter release.
- For a patch release, select nothing on the major and minor screens, then select
  the changed filters on the patch screen.
- For a minor release, select the changed filters on the minor screen.
- Use a major release only for breaking changes.
- Enter a summary when prompted. If Notepad opens, save the summary and close it.

The tasks call these package scripts:

```text
corepack pnpm run release:prepare
corepack pnpm run release:publish
```

## Regolith configuration

Each release tag includes the standalone `obfuscate_pack`, `brarchive`, and
`packager` directories at the repository root. Reference the repository root
and select the filter by its directory name:

```json
"filterDefinitions": {
  "obfuscate_pack": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "obfuscate-pack@0.3.0"
  },
  "brarchive": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "brarchive@0.3.0"
  },
  "packager": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "packager@0.3.0"
  }
}
```

Do not append a filter subdirectory to the repository URL. Regolith 1.8.0
tries to clone that URL as a repository instead of selecting a directory.
