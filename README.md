# ReBo Regolith Filters

Reusable Regolith filters for ReBo Bedrock addon repositories.

## Filters

- `obfuscate_pack`: obfuscates staged JSON pack files and keeps stable names in the project's `.obfuscation/map.json`.
- `brarchive`: archives staged `BP` and `RP` packs with a native Node.js encoder.

The filters are separate so an addon can use obfuscation without archiving, or archive packs without obfuscating them.

## Versioning

This repository is a pnpm workspace. Each filter is an independently versioned
private package under `filters/`:

- `@rebo/brarchive`
- `@rebo/packager`
- `@rebo/obfuscate-pack`

### Updating filters

After changing one or more filters, use the VS Code Command Palette
(`Tasks: Run Task`) and choose **Create Changeset and Apply Version Bumps**.
This combined task runs the first two steps in order. For a simple release,
follow the GitHub Desktop workflow below.

#### GitHub Desktop workflow

1. Make your filter code changes.
2. In VS Code, run **Create Changeset and Apply Version Bumps**.
3. In the Changeset prompts, select only the filters you changed. For all
   filters, select all three. Choose `minor` for a backward-compatible feature
   or `patch` for a fix. Avoid `major` unless the change breaks existing users.
4. In GitHub Desktop, review the changed files. The package versions and
   matching `filter.json` versions should have been updated.
5. Commit the reviewed changes in GitHub Desktop, for example:
   `Release updated filters`.
6. In VS Code, run **Publish Release**. It creates the release tags and pushes
   the commit and tags. Only run it after reviewing and committing in GitHub
   Desktop. It stops if a pending changeset still exists, which means you need
   to run **Apply Version Bumps** first.

You can also run the individual tasks separately if you want to review the
changeset before applying the version bump:

1. **Create Changeset**: choose each filter that changed and select a bump:
   `patch` for a normal fix or update, `minor` for a backward-compatible new
   feature, and `major` for a breaking change.
2. In GitHub Desktop, commit the generated `.changeset/*.md` file with your
   filter changes.
3. **Apply Version Bumps**: updates the selected package versions and syncs
   those versions into their `filter.json` files.
4. Review and commit the generated version and filter files in GitHub Desktop.
5. **Publish Release**: creates Git tags and pushes the commit and tags.

For a change to one filter, select only that filter in **Create Changeset**.
For changes to all filters, select all three filters in the same changeset.
Unchanged filters will keep their existing versions.

The equivalent command-line release process is:

```text
pnpm install
corepack pnpm changeset
corepack pnpm run version
corepack pnpm run release
git push --follow-tags
```

`pnpm version` updates only packages selected by pending changesets and
synchronizes their versions to `filter.json`. `pnpm release` only creates Git
tags; it does not push commits or tags. To synchronize existing package
versions without applying a changeset, run the **Sync Filter Versions** task.
The resulting tags identify filters independently, for example
`@rebo/brarchive@0.2.0` and `@rebo/obfuscate-pack@0.1.5`.

## Regolith configuration

Reference the repository root and select the filter by its directory name:

```json
"filterDefinitions": {
  "obfuscate_pack": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "v0.1.4"
  },
  "brarchive": {
    "url": "github.com/rebo-85/Regolith-Filters",
    "version": "v0.1.4"
  }
}
```

Use `obfuscate_pack` before `brarchive` in a profile's filter list.

The `brarchive` filter does not require `brarchive.exe`. It creates the
Bedrock-compatible `__brarchive` directories inside the staged packs. With a
`target` of `"local"`, Regolith exports those pack folders to `build`.
