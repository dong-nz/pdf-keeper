# Status feedback — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-15, DR-18). Not implemented.

**Requirements:** FR-15 · **Feature spec:** SPEC-v0.0.1-status-feedback.md · **User guide:** status-feedback.md

## Counts (status bar)

- Single aggregate query on the library service: `total`, `favorites`, `missing` — computed from `documents` in one pass (`COUNT(*)`, `SUM(favorite)`, `SUM(missing)`); no cached counters, no drift possible.
- Re-run after every mutation batch (import, delete, rescan, relink, favorite toggle) and at startup; the frontend subscribes to one `status_updated` event payload rather than polling.
- Numbers reflect the whole library regardless of the current filter/selection.

## Toasts

- Command results carry structured notices: import `{imported, skipped[]}`, rescan `{missing_found, restored}`, open-missing `{document_id}` (drives the Relink… action, see opening-and-deleting.md).
- Toast rendering is a Svelte store in `ui/src/lib/`; auto-dismiss, no action required for plain notices; the open-missing toast carries the relink action button.

## Invariants

- Status counts NEVER filter-dependent (FR-15 defines them library-wide).
- No mutation path may update the DB without emitting `status_updated`.

## Tests / acceptance

- Aggregate query unit tests (counts match fixture state after each mutation type); event-emission coverage in the library service tests.

## Change history
- v0.0.1 (planned): introduced.
