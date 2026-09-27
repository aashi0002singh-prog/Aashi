# Mobile R&D module map

- `js/modules/model-document/module.js` — Model Documents entry point; opens the File Command Center repository.
- `js/modules/model-comparison/module.js` — Parameter / Spec Comparison implementation.
- `js/modules/model-comparison/comparison-worker.js` — comparison worker.
- `js/modules/lab-knowledge/module.js` — R&D Lab Testing Setup.
- `js/modules/parameter-360/module.js` — Parameter 360 search.
- `js/modules/module-manager.js` — single module registry and visibility controller.

The legacy top-level `js/model-comparison/` implementation is intentionally removed so there is one active owner for the comparison feature.
