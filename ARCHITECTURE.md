# V65 Clean Architecture

```text
UI
 ↓
Feature Module
 ↓
Central Repository/Data Service
 ↓
modelId → recordId → slotId → versionId
 ↓
IndexedDB
 ↓
version metadata + 4 MB binary chunks
```

## Stores
- `models`
- `records`
- `slots`
- `versions`
- `version_chunks`
- `lab_slots`
- `audit`
- legacy compatibility stores: `files`, `file_chunks`, `heavy_files`, `refs`

Legacy stores exist only for migration/backward compatibility. New feature code writes modern stores.

## Upload lifecycle
1. User selects model, record and document entry.
2. UI resolves the slot through model/record/slot identity.
3. Version service creates a new `versionId`.
4. File is split into 4 MB chunks.
5. Metadata is stored in `versions`.
6. Binary chunks are stored in `version_chunks`.
7. Previous versions remain unchanged.
8. UI displays required-slot status separately from version count.
