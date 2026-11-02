# Feature spec: Missing files & relink — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `missing-files-relinking` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-12 | **Missing-file handling.** The app checks indexed paths on **startup and on manual "Rescan"** only (no background scanning). Vanished files are marked **missing** in the UI and never auto-removed. A **relink** action points the entry at a new path. | **AGREED** (DR-13b) |

Interacts with: SPEC-v0.0.1-opening-and-deleting.md (open-missing toast), SPEC-v0.0.1-metadata-editing.md (title re-derivation on relink when auto-titled), SPEC-v0.0.1-covers.md (cover regeneration on rescan).

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-05 | Moving a file outside the app → Rescan marks it missing → relink restores it; missing activation shows toast with Relink… | Automated test |

## Cross-references

Implementation design: `docs/released/technical-specs/missing-files-relinking.md` · User guide: `docs/released/features/missing-files-relinking.md`.
