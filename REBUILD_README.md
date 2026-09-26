# Mobile R&D Technical Hub — V65 Clean Rebuild

This rebuild uses the V64.2 dashboard as the functional reference. The UI/workflows are retained while the implementation is reorganized around stable IDs, isolated storage services, and one authoritative card layout system.

## Core rules
- Model identity is an immutable `modelId`; `modelCode` is editable.
- Engineering records use stable `recordId` values and independent display ordering.
- Document slots use stable `slotId` values.
- Every uploaded file version uses a permanent `versionId`; no upload-count ceiling.
- Required-slot completion and version count are separate metrics.
- Binary chunks are addressed only by `versionId`.
- UI code never owns binary storage keys.
- ALL view uses compact cards; expansion uses normal document flow.
- Category/group views render full-detail cards without fixed-height clipping.
- Excel comparison remains worker-isolated.
