# Mobile R&D Technical Hub — V65 Clean Rebuild

## What this build is

This is a clean visual/structural rebuild of the supplied V64.2 dashboard. The data model, IndexedDB file system, audit/versioning behavior, Excel comparison worker, Lab Knowledge module, Parameter 360 module, and File Command Center were intentionally retained.

The core dashboard presentation was rebuilt so that layout rules have one authoritative source instead of a long chain of historical patches.

## Layout contract

### Engineering Records
- Laptop/desktop: **maximum 3 cards per row**.
- Medium desktop/tablet: 2 cards per row.
- Mobile: 1 card per row.
- Rows use natural/max-content height.
- Expanded/group cards do not use fixed heights.
- Long filenames can wrap.
- Grid/flex children use `min-width: 0` where intrinsic content could otherwise force overflow.
- No JS card-height synchronization is used.

### Sidebar
The structural order is:

1. Active Model
2. Portal Modules
3. Telemetry
4. Sidebar Actions
5. Footer

### Core visual source
- `css/dashboard.css` is the single core dashboard layout contract.
- `css/modular-features.css` is structural only.
- Module-specific CSS remains isolated in:
  - `css/model-comparison.css`
  - `css/lab-knowledge.css`

## Feature contract retained

- Model selection and model metadata.
- Add/Edit/Delete custom model administration.
- Model-code rename with stored-file key migration.
- Engineering records and category filtering.
- Search, sorting and favorites.
- Recently Viewed.
- Inline document previews.
- File Command Center.
- IndexedDB chunked large-file storage.
- Versioned uploads and audit logging.
- Metadata backup and local reset.
- Presentation/fullscreen behavior.
- Portal settings:
  - Light / Dark / System theme
  - Accent color
  - Comfortable / Compact density
  - Motion toggle
- Excel base/upcoming comparison.
- R&D Lab Testing Setup.
- Parameter 360°.
- Responsive desktop/tablet/mobile behavior.

## Important interpretation

"Clean rebuild" means the UI/layout history has been removed from the core stylesheet. It does **not** delete user document versions or audit records from IndexedDB. Those are application features and remain intentionally available.

## Validation

See `V65_VALIDATION_REPORT.txt` for the static validation results and browser-test limitation.
