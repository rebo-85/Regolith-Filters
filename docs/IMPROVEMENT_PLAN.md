# Improvement plan

Written 2026-11-26 from a snapshot of this repository and of the add-ons workspace (11 projects). Nothing here has been run. "Verified" means read in the code or config; "not verified" means a guess or a measurement nobody made.

**Status 2026-11-27:** tasks 1 to 6 are done and released (tests and CI in #3 and #4, `bump_manifest` 1.1.2 in #5, `packager` 0.6.0 in #8, in-game load recorded in #11); tasks 3 and 4 were done in #1. Task 7 was dropped because no pack has been released yet. The add-ons section and the questions below are from 2026-11-26 and out of date; run `npm run filters:check` in the add-ons workspace.

## What the add-ons workspace actually does with the filters (verified from its `config.json` files)

- All 11 projects pin `bump_manifest@1.1.1`, `brarchive@0.6.1`, `packager@0.5.4`. `obfuscate_pack` is `1.3.1` in 8 projects and `1.4.1` in 3.
- All 10 committed map files (9 `map.json` plus `release.map.json` in `rb-build-your-vehicle`) have `__format` `letters6-v5`, including the ones from `rb-build-your-vehicle` on 1.4.1, and `MAP_FORMAT` in 1.4.1 is also `letters6-v5`. So upgrading to 1.4.1 does not wipe maps through the format check. Not verified: whether 1.4.1 gives existing entries the same names as 1.3.1 (the 1.3.1 source is not in the snapshot).
- Eight projects use `obfuscate_pack` with no `profile`, so `build_dev`, `build` and `release` share one `map.json`. The README recommends `profile: "release"`. Only `rb-build-your-vehicle` (which has `release.map.json`) follows it with committed maps. `rb-stancebound` and `rb-guidebook` set `profile: "release"` but have no committed map of any kind, so a release from a fresh clone generates new names. That is harmless before the first release and breaks saved worlds after it. Not verified: whether `rb-guidebook` has shipped.
- `rb-connection-plus` and `rb-jeb-items` run `obfuscate_pack` without `scripts` in `build`, but with it in `build_dev` and `release`, so the pack tested with `build` has unobfuscated scripts and the released one does not.
- `unicode: false` is set in `build` but not in `build_dev` or `release` in every project. The README says this changes no structure, so it is low risk. It is still a difference between the tested and the shipped pack.
- The add-ons CI clones this repository through the `MCBE_UTILS_TOKEN` git rewrite and has been green, so private access works.

`scripts/check-filters.mjs` (in `addons-workspace/` next to this file) reports all of the above and exits 0 unless `--strict`.

## Findings in this repository (verified in the code)

1. **No tests and no pull request check.** `release.yml` runs only on pushes to `main`. A broken filter is found by a consumer's build or in game.
2. **`bump_manifest` hides failures.** `updateManifest` is wrapped in a `try/catch` that only logs, so a manifest it cannot parse leaves the version unchanged and the build still exits 0. It also parses with plain `JSON.parse`, while `brarchive` strips comments first, so a commented manifest fails in one filter and not the other.
3. **`packager` is not reproducible and not small.** It stamps every zip entry with the current time, stores entries uncompressed, and computes CRC32 with a per-bit loop in JavaScript. Two builds of the same input give different bytes. Not verified: how much smaller or faster a deflated build would be.
4. **Changelog encoding.** The `0.2.0` entries of `brarchive` and `packager` contain a stray `�` line.
5. **No declared Node version.** Filters run on whatever `node` Regolith finds. `zlib.crc32` needs Node 20.15 or 22.2 and later.
6. **Changeset summaries** such as "minor fixes" (many entries) tell a consumer nothing about whether to upgrade.

## Tasks, in order

Items 1 to 4 change no built output and can proceed. Items 5 to 7 change output or release behavior and need the owner's yes.

1. Add `node:test` tests and a `test` script, run them in a new `ci.yml` on pull requests and in `release.yml` before publish. Cover: `bump_manifest` increments and `format_version` handling; `brarchive` `writeArchive` round trip and the 247-byte name limit; `packager` zip read back with a zip reader, version mismatch error; `obfuscate_pack` determinism (same input and map twice gives identical output), the map `__format` check, and the reserved bone names from the 1.4.1 changelog.
2. Add a fixture pack under `test/fixtures/` and a smoke test that runs each filter's `src/main.js` with `ROOT_DIR` set to a temp copy.
3. Fix the `�` lines in the two changelogs; add `"engines": {"node": ">=20.15"}` to each `package.json` and a README line.
4. Add a short "Upgrading" section to the `obfuscate_pack` README: commit the map, use `profile: "release"` for the release profile, check `git diff` of the map after the first build on a new version.
5. (Owner OK) `bump_manifest`: exit non-zero when a manifest cannot be read, parsed or written; parse manifests with comments removed. Patch release; changes only the failure path.
6. (Owner OK, test in game) `packager`: fixed entry timestamps (or `SOURCE_DATE_EPOCH`), deflate through `node:zlib`, `zlib.crc32`. Import the resulting `.mcpack` in game before releasing.
7. (Owner OK) `obfuscate_pack`: a cross-version test. Build one project with 1.3.1 and with 1.4.1 from the same `map.json` and diff the maps. Zero renamed existing entries means upgrading is safe for names; anything else must be fixed or called out as breaking.

## Questions for the owner

- Has `rb-guidebook` shipped? If yes, its release map must be committed now.
- Is the `unicode` difference between profiles deliberate (readable content log in `build`)?
- Should `rb-connection-plus` and `rb-jeb-items` `build` run the script obfuscation like `release`?
- Which add-ons projects have shipped to players? That decides how urgent the map policy is.
