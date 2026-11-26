# bump_manifest

## 1.1.2

### Patch Changes

- 072d1bc: Fail the build when a manifest cannot be read or parsed, instead of logging the error and carrying on with an unchanged version. In that case nothing is written (neither the manifests nor `version.json`) and every broken manifest is reported with its path. Manifests with comments or a BOM are now accepted, as in `brarchive`; comments are not kept in the rewritten manifest. `version.json` is now written last, so a failed run never leaves a bumped version behind. Upgrade if you rely on a green build meaning the manifests were bumped; a project whose manifests were already invalid will now fail until they are fixed.

## 1.1.1

### Patch Changes

- Keep initial manifest version at 1.0.0

## 1.1.0

### Minor Changes

- Support selecting major, minor, or patch version increments.

## 1.0.3

### Patch Changes

- minor fixes

## 1.0.2

### Patch Changes

- minor fixes

## 1.0.1

### Patch Changes

- minor fixes

## 1.0.0

### Major Changes

- Initial release of bump_manifest
