# Changelog

## 1.0.0 — 2026-11-03

- Fork Manual Sorting 3.2.4 under the distinct `manual-sorting-fixed` plugin ID.
- Prevent native drop and plugin dragend from enqueuing duplicate folder moves.
- Skip same-path renames and ignore cancelled internal drags.
- Preserve intentional cross-folder moves, multi-selection and external drop handling.
- Import legacy sorting settings only on the first load.
- Register vault listeners for cleanup when the plugin is disabled.
- Include reproducible build scripts and settings / drag regression checks.
