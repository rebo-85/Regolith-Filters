# packager

## 0.6.0

### Minor Changes

- 9350119: Make the output reproducible and smaller. Every zip entry now carries a fixed timestamp (1980-01-01 UTC, or `SOURCE_DATE_EPOCH` in seconds when set), so the same input gives the same bytes. Entries are deflated when that makes them smaller and stored otherwise, and CRC32 comes from `node:zlib`. File names, folder layout and the `.mcpack` and `.mcaddon` structure are unchanged. Import a built `.mcpack` in game once before releasing a project with this version.

## 0.5.4

### Patch Changes

- add version to output name

## 0.5.3

### Patch Changes

- minor fixes

## 0.5.2

### Patch Changes

- fix bump_manifest incompatibility

## 0.5.1

### Patch Changes

- change log messages

## 0.5.0

### Minor Changes

- update

## 0.4.0

### Minor Changes

- update

## 0.3.0

### Minor Changes

- update

## 0.2.1

### Patch Changes

- Publish standalone root-level filter directories for Regolith 1.8.0 compatibility.

## 0.2.0

### Minor Changes

- update
