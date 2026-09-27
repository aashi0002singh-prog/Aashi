# Mobile R&D Technical Hub — V2 Clean Restructure

This build is a clean restructuring of the supplied `Mobile_RD_V1_CLEAN_REBUILD.zip` baseline.

## UI contracts

- All Cards collapsed state is exactly 65px high.
- Collapsed cards use normal CSS grid flow; expansion increases natural card height and pushes later rows down.
- All Cards uses adaptive columns, targeting 4 columns on normal laptop-width content areas and adding columns on larger displays when space allows.
- Category/Group view is capped at 3 columns on desktop.
- Record titles are single-line ellipsized labels; arbitrary character-by-character wrapping is disabled.
- Full filenames, version history and detailed document metadata are kept in the dedicated Preview workspace rather than the collapsed card.
- Preview remains a dedicated large workspace with file selection, image/PDF/text preview and download-all support.
- Sidebar order remains Active Model → Active Model Details → Portal Modules → Telemetry → Actions → Footer.

## Architecture

The record/card/preview UI is separated into:

- `js/app.js` — application state, storage orchestration, upload/model/admin workflows and event wiring.
- `js/records/record-system.js` — record view rendering, card expansion, record preview workspace and record downloads.
- `css/record-system.css` — single visual/layout contract for record cards, group grid and record preview.

The old record rendering and preview implementation was removed from `app.js` rather than layered with another override renderer.
