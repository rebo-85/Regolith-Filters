---
"packager": minor
---

Make the output reproducible and smaller. Every zip entry now carries a fixed timestamp (1980-01-01 UTC, or `SOURCE_DATE_EPOCH` in seconds when set), so the same input gives the same bytes. Entries are deflated when that makes them smaller and stored otherwise, and CRC32 comes from `node:zlib`. File names, folder layout and the `.mcpack` and `.mcaddon` structure are unchanged. Import a built `.mcpack` in game once before releasing a project with this version.
