# Cover thumbnails — technical reference

**Since v0.0.1** · Requirements: FR-16, UI-04 · User guide: [features/covers.md](../features/covers.md) · Spec: [SPEC-v0.0.1-covers.md](../../specs/SPEC-v0.0.1-covers.md)

## Generation (`src-tauri/src/covers/`)

- `pdfium-render` renders page 1 at target width 220 px (grid-card display size 220×311, A4 aspect; list rows scale it down in CSS). PNG output into `<app_data>/covers/`.
- Cache key: `cache_key(path, size, mtime)` — content-addressed by source file identity; a changed file produces a new key and the old PNG is swept by `sweep_orphans` (startup maintenance).
- `pdfium_binary_present()` gates rendering: without the bundled pdfium binary the app runs fully, simply without covers (graceful degradation, no errors).
- Packaging (DR-59): `bundle.resources: ["binaries/*pdfium*"]` ships the platform library `fetch-pdfium.mjs` downloaded (`pdfium.dll` / `libpdfium.so` / `libpdfium.dylib`) into `binaries/` beside the installed exe. `bind_candidates()` binds in order: exe directory → `binaries/` beside the exe (packaged) → `cwd/binaries` (dev). Windows layout verified from an administrative MSI extraction; the installed exe runs against it.

## Queue model

- `CoverQueue` (`mpsc`): `import_paths` / `import_folder` enqueue a `CoverJob` after each row commit and return immediately — cover work never blocks import (DR-17).
- `start_worker(dir, sink)` runs one worker thread; progress goes through `EventSink::progress` → `library_job_progress` events, throttled (every 25 completions + final drain) so the UI can show cover progress without event storms.
- Startup backfill: `enqueue_missing_covers(conn, queue)` queues every document without a cache hit (e.g. after a cache directory wipe). `rescan` enqueues jobs for files whose size/mtime changed.
- A failed render skips that document (row shows the placeholder); it never fails the import or the batch.

## UI (`ui/src/`)

- `DocumentRow` / grid card render the cached path returned in `DocumentDto.cover_path` (mapped to a file URL in `query.rs::map_row`); placeholder tile when absent.
- **Display sizes changed in v0.0.3** (UI-03, §5.3.5): the list cover is `ROW_COVER_WIDTH = round(ROW_HEIGHT × 210 / 297)` = **45×64** at the new 64 px row (derived from `ROW_HEIGHT` in `lib/virtual.ts`, so the two cannot disagree), and a card's cover is `cardWidth − 2` wide at the shipped 218:309 inner ratio, its height feeding `cardHeight(cardWidth)` (sorting-and-views.md). The **rendered asset is unchanged**: `covers/mod.rs` still calls `.set_target_width(220)`, and `DocumentDto` carries no size. Consequence, stated rather than hidden: at card widths above 220 px the cached image is **upscaled** by the layout — a 320 px card shows a 220 px render enlarged. Removing that softness means raising the backend render target and re-rendering the cache, which is not part of this release and is not a defect the user was promised a fix for.
- Cover progress merges into the import progress UI (`library_job_progress`).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/covers/` tests | cache key stability/identity change, worker renders to PNG, `enqueue_missing_covers` backfill, `sweep_orphans` removes stale files, missing-binary gate |
| `src-tauri/src/library/` tests | import enqueues jobs without blocking, rescan re-enqueues changed files |
| `scripts/ui-smoke.mjs` | list rows and grid cards render real cover images from the cache; switching back to list keeps covers; **v0.0.3:** the list cover measures 45×64 inside the 64 px row (`flowRowDesign`), and grid covers follow the derived card width in the measured card geometry (`flowViewColumns`, AC-24/AC-31) |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-covers.md, corrected to the verified code: 220 px target width, throttled progress events, startup backfill + orphan sweep as built. Packaging corrected before freeze (DR-59): resources glob bundles the Pdfium library on every platform, not only Windows.
- 2026-11-04 (v0.0.3 — display metrics only, DR-99) — List covers grew with the taller row (34×48 → 45×64, derived from `ROW_HEIGHT`) and card covers became a function of the derived card width instead of a fixed 220 px box. **No change to generation, cache keys, the queue, the 220 px render target or the placeholder path** — the 49 Rust tests here are the same tests as in v0.0.1. The upscale above 220 px is recorded as a known limitation of this release, not as a fixed defect.
