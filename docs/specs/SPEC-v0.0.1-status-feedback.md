# Feature spec: Status feedback — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `status-feedback` (surfaces in the docs/released getting-started + importing pages) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-15 | **Status feedback.** Status bar shows total documents, favorites count, missing count; import/rescan results reported via toasts. | **AGREED** (DR-18) |

Depends on: parent UI-01 (status bar region). Data sources: counts computed from the same queries as SPEC-v0.0.1-favorites.md (favorites count), SPEC-v0.0.1-missing-files-relinking.md (missing count), library totals.

## Cross-references

Implementation design: `docs/released/technical-specs/getting-started.md` (status aggregates) · User guide: `docs/released/features/getting-started.md`.
