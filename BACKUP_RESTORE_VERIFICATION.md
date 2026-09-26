# V65 Full Backup/Restore Verification

## Backup package
- Extension: `.mrdbackup`
- Contains repository metadata and raw binary chunks.
- Includes models, records, slots, versions, lab slots, refs, audit, and legacy compatibility stores.
- Includes application state and stable model/record/slot ID maps.
- Binary chunks are stored without base64 conversion.
- CRC32 is stored and verified for every binary archive entry.

## Restore behavior
1. Validate archive magic and manifest.
2. Validate every binary chunk checksum.
3. Clear existing repository stores.
4. Restore metadata records.
5. Restore version and legacy file chunks.
6. Restore dashboard state and stable ID maps.
7. Reload dashboard.

## Safety boundary
Restore is explicit and asks for confirmation because it replaces local repository data.
