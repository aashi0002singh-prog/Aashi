# Mobile R&D Technical Hub V65.2.8

## Base
V65.2.7/current approved base supplied by the user.

## Change
Card structure was aligned to the user's approved screenshot reference.

### All Records
- Preserve compact 5-column card structure.
- Equal compact card height.
- Icon/title/status geometry retained.
- Natural title wrapping; no forced word splitting.
- Status remains a small secondary badge.

### Individual groups
- Card title gets the primary horizontal content lane.
- Titles wrap naturally without splitting words.
- NO DOCUMENT badge is placed at the right side of the card header.
- "No document uploaded yet." is right-aligned and visually secondary.
- Favorite remains available as a compact overlay; group cards remain full-detail views.

## QA
- 60-cycle Chromium/Playwright regression: PASS
- Browser/page errors: 0
- Compact card height: 70px for all 19 All Records cards
- Minimum compact title lane: 122.19px
- Record counts: All 19; Schematics 4; RF & Antenna 5; Process & OPST 3; Defects & SW 2; Specification 5
- JavaScript syntax checks: PASS
- Required-slot restriction strings: 0 occurrences
- Visual screenshots: `../v65_2_8_visual/`
