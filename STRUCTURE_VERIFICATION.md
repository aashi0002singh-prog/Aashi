# V65 Structure Verification

## Active application files
- `index.html` — single application shell and modal/workspace markup.
- `data/models.js` — engineering record definitions, categories, model defaults, dynamic record-code ordering helpers.
- `js/app.js` — dashboard controller, rendering, model administration, upload workflow, preferences, navigation and exports.
- `js/database.js` — isolated IndexedDB repository with stable model/record/slot/version IDs and chunked binaries.
- `js/ui.js` — reusable UI helpers.
- `js/file-command-center.js` — isolated file search/preview/download UI.
- `js/model-comparison/comparison.js` + worker — isolated Excel comparison engine.
- `js/modules/parameter-360/module.js` — metadata/document search module.
- `js/modules/lab-knowledge/module.js` + `data.js` — lab knowledge module.
- `js/modules/module-manager.js` — module visibility registry.
- `js/modules/model-document/module.js` — document module descriptor.
- `js/modules/model-comparison/module.js` — comparison module descriptor.

## Storage separation
`models → engineering_records → document_slots → document_versions → file_chunks` is the logical ownership chain. Binary chunks never use filenames, model codes, or UI labels as identity.

## Versioning
A slot can contain any number of versions. Required-slot completion is independent from total version count. Duplicate revision labels do not replace existing versions because every upload gets a unique `versionId`.

## Model-code editing
Model code is a mutable display/business field. Stable model IDs and slot/version IDs are preserved. Rename logic migrates reference aliases from the old code to the new code rather than recreating documents.

## Layout safety
The active `dashboard.css` is a clean stylesheet. The previous 1,164-rule stylesheet is retained only as `dashboard-legacy-reference.css` and is not loaded. Expanded cards use normal grid flow; there is no group-card height synchronization or fixed expanded-card height.

## Compatibility
Existing V64 legacy file stores remain readable. A legacy direct file is surfaced as a legacy version when present, and newly uploaded versions are stored in the new version/chunk stores.
