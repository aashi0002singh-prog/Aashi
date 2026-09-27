# Mobile R&D Technical Hub — V8 Running Fix

## Critical fix
V7 could display the model metadata while showing `0 records` when an older/incomplete `MOBILE_RND_DB_DATA_V1` object was already present in localStorage. V8 normalizes stored model data against the default record schema on startup, preserving saved metadata/documents while restoring any missing default records.

## Windows launch
Do not double-click `index.html` for normal use. Double-click `START_DASHBOARD.bat` or run:

```bat
py -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## Deployment
The same normalized data logic runs on GitHub Pages. Existing incomplete localStorage is repaired automatically on startup.
