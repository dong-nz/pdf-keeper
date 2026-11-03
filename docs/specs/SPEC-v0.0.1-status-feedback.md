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

### UI (parent §5.3)

**StatusBar.svelte** (28px, `contentinfo` landmark):

- **Left**: three count chips — All documents · Favorites · Missing — each one a filter control. Values come only from the `status_updated` payload; the frontend never computes, caches, or filters them (FR-15 invariant).
- **Center**: `ProgressBar` with a kind label ("Importing 3 200 / 10 000", "Rescanning…", "Generating covers…"), rendered only while a job is active and driven by `library_job_progress`.
- **Right**: the **Rescan** button (see missing-files-relinking.md).

**ToastStack.svelte** (bottom-right, at most 4 visible, `aria-live="polite"`): plain notices auto-dismiss after 6 s; a toast that carries an action (**Relink…**, retry after a failed file delete) stays until the action is used or it is dismissed by hand (R4.6). All text comes from the i18n catalog with counts interpolated; import and rescan toasts include an expandable detail list (skipped paths, newly missing paths) so a count is never just a number.

### Tests / acceptance

- Aggregate query unit tests (counts match fixture state after each mutation type); event-emission coverage in the library service tests.

## Cross-references

User guide: `docs/released/features/status-feedback.md`.
