# Cover thumbnails — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-16; AC-06; pipeline per DR-17). Not implemented.
**Feature spec:** none — cross-cutting page (requirements in parent SPEC-v0.0.1.md)

## Generation (`src-tauri/src/covers/`)

- **pdfium-render** rasterizes page 1 to a PNG thumbnail (DR-17).
- A background worker queue consumes cover jobs enqueued by import and rescan; the queue survives app restart (unfinished jobs re-enqueued from DB state). Import never waits on covers (NFR-02).
- Failure to render → the document gets the generic PDF glyph; the document itself is imported normally (FR-16).

## Cache

- Path: `<user-data>/covers/` (RULES R8.4). Filename keyed by `hash(path + size + mtime)` — the key IS the staleness check (FR-16).
- Rescan regenerates a cover when the key changed (file modified) or the cached file is absent.
- Removing a library entry deletes its cached cover (single-document cleanup; no orphan sweep needed beyond a startup sweep of files with no matching row).
- Thumbnails are display-only; activation still opens the external viewer (DR-04).

## Delivery to UI

- Covers are served to the frontend via a Tauri custom protocol (`asset:` scope limited to the covers directory), so list/grid rows load thumbnails asynchronously without base64 in command payloads.

## Tests / acceptance

- AC-06: covers present after import in both views; regeneration after fixture file change + rescan; unrenderable fixture → glyph fallback. Visual proof in the real app run.

## Change history
- v0.0.1 (planned): introduced.
