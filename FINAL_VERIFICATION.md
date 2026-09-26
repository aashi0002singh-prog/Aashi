# Mobile R&D Technical Hub — V65 Final Migration Verification

## Baseline
Functional reference: Mobile RD V64.2 multi-slot/versioned engineering workspace.

## Architecture verification
- Model identity: immutable `modelId`; editable `modelCode`.
- Record identity: immutable `recordId`.
- Document identity: immutable `slotId`.
- Uploaded revision identity: immutable `versionId`.
- Binary identity: `versionId + chunkIndex`.
- UI modules do not construct IndexedDB storage keys.
- Only `js/database.js` owns IndexedDB access.
- Legacy V64 key storage is read/migrated through a compatibility layer.

## Engineering documents
- Unlimited versions per document slot.
- Required-slot count is independent from version count.
- Multiple required sub-slots are supported.
- Every uploaded version remains independently addressable.
- Latest version is deterministic by `createdAt` then `versionId`.
- 4 MB chunking retained.
- 500 MB individual file limit retained.

## Model editing
Changing a model code updates the existing `modelId`. It does not recreate the model or rename document storage identities.

## Views
- ALL view: compact cards.
- Expanded card: normal grid flow; no overlay/fixed expanded height.
- Category view: full-detail cards automatically.
- Dynamic record ordering: A, B ... Z, AA, AB ...; no artificial A-V ceiling.

## Modules migrated
- Engineering Records: permanent-ID document lookup/upload/versioning.
- File Command Center: reads version metadata directly and retrieves by `versionId`.
- Parameter 360: resolves records/slots through repository context and retrieves by `versionId`.
- R&D Lab: versioned Lab slots and unlimited Lab revisions.
- Excel comparison: remains isolated from document storage and keeps its worker architecture.
- Preview/download: uses version IDs.
- Favorites/recent: remain UI-local preferences.

## Legacy migration
On startup, repository identities are registered first. Existing V64 `files`/`file_chunks` records are then migrated into modern version records so old uploads remain visible through the new repository.

## Static checks
- JavaScript syntax: PASS for all JS files.
- Duplicate HTML IDs: 0.
- Missing local HTML references: 0.
- Direct IndexedDB access outside `database.js`: 0.
- Legacy storage-key construction in active modules: 0.

## Important storage distinction
Project source files live in the project/GitHub repository. User-uploaded engineering binaries live in browser IndexedDB at runtime and are not committed into the project source tree.
