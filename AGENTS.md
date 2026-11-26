# AGENTS.md

Rules for agents working in this repository (the ReBo Regolith filters). Read this file, then `docs/IMPROVEMENT_PLAN.md`.

## What this repository is

Four Regolith filters, one folder each: `bump_manifest`, `obfuscate_pack`, `brarchive`, `packager`. They are released with changesets and used by the projects of the add-ons workspace (`rebo-85/Minecraft-Addons`) as `name@version` (git tags), for example `obfuscate_pack@1.4.1`. A change here reaches players through those projects, so treat output changes as player-facing.

## Machine layout

The owner's machine holds this repository, the add-ons workspace and `MCBE-Utils` side by side under `C:\Users\catal\Documents\GitHub\ReBo\`: `Regolith Filters` (this one), `Minecraft Addons`, `MCBE Utils`. One agent may work in more than one of them: start every terminal call with its own `Set-Location`. The add-ons workspace has the detailed working rules in its `.claude/CLAUDE.md` and `AGENTS.md`; they apply here too (one terminal call per item, exact-set status gates, STOP conditions, commit by explicit path, two `-m` arguments and no commit trailer, print `CO_AUTHORED_BY_LINES=` after every commit). In the add-ons workspace, `npm run filters:check` reports which filter versions and profile settings the projects use.

## Hard rules

- Never push to `main`, never `--force`. Branch (`type/topic`), pull request, merge on GitHub. Pushing a new feature branch is pre-approved when the gates pass; a pull request is opened and squash-merged only through pr-merge.mjs (the open-and-merge-pr skill in the add-ons workspace), for branches the block names and when every check passed; the Changesets release pull request merges with --no-checks-ok and its exact file list.
- Never publish locally. Releases go through changesets and `.github/workflows/release.yml`. Do not run `changeset version`, `changeset tag` or `release:prepare` unless asked.
- Never change `MAP_FORMAT` or any default of `obfuscate_pack` in a patch or minor release. Changed names break the saved worlds of players. Anything that changes built output needs the owner's yes and an in-game test first.
- Never edit version numbers, tags or generated changelog entries, except to fix encoding.
- Everything destructive (history rewrite, deleting files or branches) needs a yes first.

## Releasing

After changing a filter, add a changeset that names only the affected filters and write a summary that tells a consumer whether to upgrade (not "minor fixes"). The steps are in `README.md` ("Release Workflow"). Do them on a branch and merge by pull request; the release workflow runs when `main` changes. `scripts/check-release.js` blocks a release when the tree is dirty, the checkout is not `origin/main`, or a tag and its package metadata disagree.

## Open work

`docs/IMPROVEMENT_PLAN.md` lists the tasks. Tasks 3 and 4 (changelog encoding, `engines`, Upgrading notes) are done. Tasks 1 to 5 are done: node:test tests for all four filters with fixtures generated in temp folders, pull request CI, and bump_manifest failing the build on a bad manifest. Task 6 (packager deterministic zips) changes built output and needs an in-game import test before a project pins it. Task 7 was dropped: no pack has been released yet, so names may still change. The plan's description of the add-ons workspace is from 2026-11-26 and is out of date; run `npm run filters:check` there for the current state.

## Keeping this file useful

Any agent that learns something that makes the work smoother, or finds a rule that is wrong or missing, fixes or adds the note itself (in the same pull request or a small `docs/` one). Correct a wrong note instead of adding a second one. Repeated procedures become skills; see `.claude/skills/` in the add-ons workspace for the format.
