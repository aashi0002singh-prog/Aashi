# Mobile R&D Technical Hub — V1 Clean Restructured Baseline

This package is a fresh V1 UI/component structure. It does not apply a runtime patch layer over the previous card implementation.

## Locked V1 behavior

- All Cards uses a **65 px collapsed card height**.
- All Cards uses **4 columns on laptop-sized desktop layouts** and adaptive columns on larger screens.
- Clicking a card expands it in normal CSS grid flow, so the following row is pushed down and cannot be overlapped.
- Group/category views use a **maximum of 3 cards per row** on desktop.
- Card content is a compact summary only; raw version history and large file previews are not rendered inside cards.
- File preview is a dedicated **Preview Workspace** with tabs for Preview, File Information, All Files, and Version History.
- Uploading a file does not change the fundamental card geometry.
- Sidebar order is Active Model → Active Model Details → Feature List / Portal Modules → Actions/Footer.
- Card rendering and preview rendering are separated into dedicated components.
- Historical layout migration code is not part of this V1 UI runtime.

## Structure

- `index.html` — application shell
- `css/dashboard.css` — core dashboard visual/layout contract
- `js/app.js` — application state and feature orchestration
- `js/components/record-card.js` — card rendering contract
- `js/components/preview-workspace.js` — dedicated preview workspace
- `js/database.js` — IndexedDB/local file repository
- `js/file-command-center.js` — file command center integration
- `js/model-comparison/` — comparison feature
- `js/modules/` — portal modules
- `data/models.js` — default model/record data

## Important

No patch script or post-load DOM patch is required for the new card behavior. The layout is defined directly by the V1 component and CSS contracts.
