# Feature spec: Status feedback — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `status-feedback` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-15 | **Status feedback.** Status bar shows total documents, favorites count, missing count; import/rescan results reported via toasts. | **AGREED** (DR-18) |

Depends on: parent UI-01 (status bar region). Data sources: counts computed from the same queries as SPEC-v0.0.1-favorites.md (favorites count), SPEC-v0.0.1-missing-files-relinking.md (missing count), library totals.

## Technical design
### Counts (status bar)

- Single aggregate query on the library service: `total`, `favorites`, `missing` — computed from `documents` in one pass (`COUNT(*)`, `SUM(favorite)`, `SUM(missing)`); no cached counters, no drift possible.
- Re-run after every mutation batch (import, delete, rescan, relink, favorite toggle) and at startup; the frontend subscribes to one `status_updated` event payload rather than polling.
- Numbers reflect the whole library regardless of the current filter/selection.

### Toasts

- Command results carry structured notices: import `{imported, skipped[]}`, rescan `{missing_found, restored}`, open-missing `{document_id}` (drives the Relink… action, see opening-and-deleting.md).
- Toast rendering is a Svelte store in `ui/src/lib/`; auto-dismiss, no action required for plain notices; the open-missing toast carries the relink action button.

### Invariants

- Status counts NEVER filter-dependent (FR-15 defines them library-wide).
- No mutation path may update the DB without emitting `status_updated`.

### Tests / acceptance

- Aggregate query unit tests (counts match fixture state after each mutation type); event-emission coverage in the library service tests.

## Cross-references

User guide: `docs/released/features/status-feedback.md`.
