# Cover thumbnails — technical reference

**Since v0.0.1, updated in v0.0.4** · Requirements: FR-16 (MODIFIED in v0.0.4 — render width joins the cache identity, DR-113), UI-04, defects D6 and D7 · User guide: [features/covers.md](../features/covers.md) · Spec: [SPEC-v0.0.1-covers.md](../../specs/SPEC-v0.0.1-covers.md) (v0.0.4 changes: [SPEC-v0.0.4.md](../../specs/SPEC-v0.0.4.md) §3.4 (D6), §3.5 (D7))

## Generation (`src-tauri/src/covers/`)

- `pdfium-render` renders page 1 at target width `RENDER_TARGET_WIDTH = 640` px — raised from 220 in v0.0.4 (D7) so the largest display size (320 px card at 2× device-pixel ratio) is a downscale, never an upscale. PNG output into `<app_data>/covers/`.
- Cache key: `cache_key(path, size, mtime, width)` — content-addressed by source file identity **plus the renderer's current target width** (FR-16 as modified by DR-113). A changed file or a changed render target produces a new key and the old PNG is swept by `sweep_orphans` (startup maintenance) — raising the render width re-keys every entry, so existing libraries re-render in the background with no explicit cache wipe.
- `pdfium_binary_present()` gates rendering: without the bundled pdfium binary the app runs fully, simply without covers (graceful degradation, no errors).
- Packaging (DR-59): `bundle.resources: ["binaries/*pdfium*"]` ships the platform library `fetch-pdfium.mjs` downloaded (`pdfium.dll` / `libpdfium.so` / `libpdfium.dylib`) into `binaries/` beside the installed exe. `bind_candidates()` binds in order: exe directory → `binaries/` beside the exe (packaged) → `cwd/binaries` (dev). Windows layout verified from an administrative MSI extraction; the installed exe runs against it.

## Queue model

- `CoverQueue` (`mpsc`): `import_paths` / `import_folder` enqueue a `CoverJob` after each row commit and return immediately — cover work never blocks import (DR-17).
- `start_worker(dir, sink)` runs one worker thread; progress goes through `EventSink::progress` → `library_job_progress` events, throttled (every 25 completions + final drain) so the UI can show cover progress without event storms.
- Startup backfill: `enqueue_missing_covers(conn, queue)` queues every document without a cache hit (e.g. after a cache directory wipe). `rescan` enqueues jobs for files whose size/mtime changed.
- A failed render skips that document (row shows the placeholder); it never fails the import or the batch.

## UI (`ui/src/`)

- `DocumentRow` / grid card render the cached path returned in `DocumentDto.cover_path` (mapped to a file URL in `query.rs::map_row`); placeholder tile when absent.
- **Display sizes (v0.0.3 design, unchanged geometry in v0.0.4):** the list cover is `ROW_COVER_WIDTH = round(ROW_HEIGHT × 210 / 297)` = **45×64** at the 64 px row (derived from `ROW_HEIGHT` in `lib/virtual.ts`, so the two cannot disagree); a card's cover is the card's inner box exactly — `cardWidth − 2` wide at the shipped 218:309 inner ratio. **Changed in v0.0.4 (D6):** `.cover-wrap` no longer carries 10 px of padding — the cover fills the inner box, so the image can no longer cross the card border at wide card widths, and `cardHeight(cardWidth) = coverHeight(cardWidth) + CARD_TEXT_BLOCK` (the padding term left the formula; `virtual.test.ts`'s card-height and row-block cases were re-derived). **Changed in v0.0.4 (D7):** the rendered asset is 640 px wide (was 220), so the upscale above 220 px — the recorded limitation of v0.0.3 — is gone: every display size up to a 320 px card at 2× device-pixel ratio downscales from a render larger than it needs. `DocumentDto` still carries no size; the layout derives everything from the constants.
- Cover progress merges into the import progress UI (`library_job_progress`).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/covers/` tests | cache key stability/identity change — **v0.0.4 (AC-36): the key changes when the render width changes and is unchanged for unchanged documents; the worker's output measures ≥ 560 px wide** — worker renders to PNG, `enqueue_missing_covers` backfill, `sweep_orphans` removes stale files, missing-binary gate |
| `src-tauri/src/library/` tests | import enqueues jobs without blocking, rescan re-enqueues changed files |
| `scripts/ui-smoke.mjs` | list rows and grid cards render real cover images from the cache; switching back to list keeps covers; the list cover measures 45×64 inside the 64 px row (`flowRowDesign`); grid covers follow the derived card width in the measured card geometry (`flowViewColumns`, AC-24/AC-31); **v0.0.4 (AC-35): every cover edge sits inside the card's inner box — measured at 900 and 1900 px windows, all column modes** |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-covers.md, corrected to the verified code: 220 px target width, throttled progress events, startup backfill + orphan sweep as built. Packaging corrected before freeze (DR-59): resources glob bundles the Pdfium library on every platform, not only Windows.
- 2026-11-04 (v0.0.3 — display metrics only, DR-99) — List covers grew with the taller row (34×48 → 45×64, derived from `ROW_HEIGHT`) and card covers became a function of the derived card width instead of a fixed 220 px box. **No change to generation, cache keys, the queue, the 220 px render target or the placeholder path** — the 49 Rust tests here are the same tests as in v0.0.1. The upscale above 220 px is recorded as a known limitation of this release, not as a fixed defect.
- 2026-11-05 (v0.0.4 — D7 + FR-16 MODIFIED per DR-113, D6) — Render target 220 → 640 px; `cache_key` gains the render width as its fourth part, so the raised target re-keys every existing entry and `sweep_orphans` retires the old PNGs through the machinery that already existed — no cache wipe, no second staleness rule. The v0.0.3 upscale limitation is closed by this. Card geometry (D6): `.cover-wrap` loses its 10 px padding, the cover fills the card's inner box exactly, and `cardHeight` loses the padding term (`coverHeight + CARD_TEXT_BLOCK`); `virtual.test.ts` card-height/row-block cases re-derived; the real-app inset check passes at 140–320 px card widths in 900/1280/1900 px windows (AC-35). Queue, events, backfill, the placeholder path and the missing-binary gate unchanged.
