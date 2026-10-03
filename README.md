# ReBo Regolith Filters

Reusable Regolith filters for ReBo Bedrock addon repositories.

## Filters

- `bump_manifest`: Bumps addon manifest version numbers automatically during build
- `obfuscate_pack`: Obfuscates JSON pack filenames and contents while preserving stable mappings.
- `brarchive`: Archives staged behavior and resource packs with brarchive.
- `packager`: Packages staged behavior and resource packs as mcpack and mcaddon files.

## Release Workflow

After changing one or more filters, use the VS Code Command Palette
(`Tasks: Run Task`) and run these steps:

1. Run **Create Changeset and Apply Version Bumps**.
2. Review the changed files, then commit and push them to `main`.

The GitHub Actions release workflow publishes the packages after the push. Do not
publish locally; the release command checks that the working tree is clean, the
checkout matches `origin/main`, and existing version tags contain matching package
metadata.

During the Changeset prompts:

- Use `Up` / `Down` to navigate, `Space` to select, and `Enter` to confirm.
- Select only the filters you changed. Select all four for an all-filter release.
- For a patch release, select nothing on the major and minor screens, then select
  the changed filters on the patch screen.
- For a minor release, select the changed filters on the minor screen.
- Use a major release only for breaking changes.
- Enter a summary when prompted. If Notepad opens, save the summary and close it.
  This text only becomes changelog content; it does not affect which commit is tagged.

The task calls this package script:

```text
corepack pnpm run release:prepare
```

## Regolith configuration

Each release tag includes the standalone filter directories at the repository
root. Reference the repository root and select the filter by its directory name:

```json
"filterDefinitions": {
  "bump_manifest": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "bump_manifest@1.0.3"
  },
  "obfuscate_pack": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "obfuscate_pack@1.1.0"
  },
  "brarchive": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "brarchive@0.5.5"
  },
  "packager": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "packager@0.5.3"
  }
}
```

Do not append a filter subdirectory to the repository URL. Regolith 1.8.0
tries to clone that URL as a repository instead of selecting a directory.
