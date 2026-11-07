# Reading PDFs — technical reference

**Since v0.0.6** · Requirements: FR-17 (ADDED), UI-30 (ADDED), UI-31 (ADDED), FR-08 (MODIFIED), NFR-08 (ADDED) · User guide: [features/reading-pdfs.md](../features/reading-pdfs.md) · Spec: [SPEC-v0.0.6.md](../../specs/SPEC-v0.0.6.md) §2 (FR-17, UI-30/UI-31, NFR-08), §3.2–§3.4 (design) — decisions DR-139 (one window per document), DR-140 (frameless replication), DR-147…DR-156 (build-time corrections), DR-168…DR-170 (verification discipline)

## Rendering (`src-tauri/src/pdf/mod.rs`)

- `RenderService` — a **single dedicated OS thread owns every pdfium call** (the DR-134 single-owner rule: the bundled pdfium's C API is not thread-safe, pdfium-render #262). One process-wide instance (`RenderService::shared()`), a request queue with a wake channel; every pdfium user in the app goes through it.
- `document_dto(render, path) -> PdfDocDto` — page count plus per-page geometry in points (the `app_pdf_document` payload). `render_page` honours the scale bounds and the 1-based page range; out-of-range requests are typed errors, not clamps.
- **The cover pipeline was rewired through the same service** (AC-63): `covers` no longer holds its own pdfium binding — a cover is the service's page-1 render. One pdfium owner for the whole app.
- Typed errors (FR-08/AC-69): an unopenable document reports `AppError::…` variants end to end — the reader helpers never panic and never open silently.

## Commands (thin wrappers, R1.2)

- `app_pdf_document(id) -> PdfDocDto` and `app_pdf_page(id, page, width) -> rendered page data` (`commands.rs`): resolve the document path (`resolve_open_target` — a `missing` document yields the typed error first), then hand the request to the service.
- `app_open_reader_window(id)`: **create-or-focus.** Missing file → typed error before any window exists (the toast's Relink path). Otherwise ensure the window labeled `reader-<id>`; an existing window is focused instead of a second being built (FR-17's one-window-per-document rule, enforced at the command).
- `app_open_document` (the v0.0.1 OS path) is unchanged — it is now reached only from the context menu's *Open in external viewer* item (UI-31).
- All three sit in the `ui/src/api.ts` whitelist; `tests::command_router_matches_the_ui_command_client` (AC-41) holds router and client in step.

## Windows (`src-tauri/src/lib.rs`, capabilities)

- `WebviewWindowBuilder` with label **`reader-<id>`** — the document id *is* the window key, mirroring the cache directory name. Default 1000 × 700 CSS px, OS cascade placement, resizable, minimizable, titled with the document's filename.
- **Frameless replication** (UI-30, OQ-40 → DR-140): the reader window carries the same frameless chrome as the library window (its own window-controls strip), not an OS title bar.
- `src-tauri/capabilities/reader-windows.json` grants the window-operation capabilities to `reader-*` windows only — the library window's capability set is untouched.
- `on_window_event(Destroyed)` for a reader window calls `pdf::remove_document_cache` (AC-67): the cache is session-scoped, keyed by the document id, written by `app_pdf_page` under `<data_dir>/reader/<id>/`; the asset-protocol scope entries serve exactly those directories.

## Reader UI (`ui/src/ReaderApp.svelte`, `components/ReaderView.svelte`, `components/ReaderControls.svelte`, `lib/state/reader.svelte.ts`)

- `ReaderApp.svelte` is the reader window's entry (a second window URL; `main.ts` mounts the reader app when the window label is `reader-*`). The surface shows no library chrome: no toolbar, no menus, no status bar (UI-30).
- **One state source** (DR-155): scroll position lives in the reader store; the `n / N` label and the mount window derive from the same observed position — the label is never relayed through parent state.
- **Request order** (DR-150): the current page is requested first; the mount window is requested only after the current page arrives. Page state is gated on the measured CSS width (DR-154): a zero-width startup layout cannot satisfy first-page readiness, and `pageAt` never reports a phantom last page.
- **Two-stage rendering** (DR-151, re-specified DR-153): the preview request is `min(display width in CSS px, 1400 px)` — a fast render that lands inside the NFR-08 budgets — then the full target replaces it. The 75 % row stays single-stage fast.
- `overflow-anchor: none` on the reader scroller (DR-152): scroll position is exactly what the app sets; browser scroll-anchoring compensation (measured drifts of one page pitch / one viewport) cannot move it. The released list/grid scroller carries the same rule by the user's decision.
- Controls (UI-30): prev/next, a page field accepting a number, `PgUp`/`PgDn`/`Home`/`End`, zoom = fit-width default + fixed 50/75/100/125/150/200/300 % + −/+ between them; zoom re-derives on window resize while keeping the viewed page.
- Error surface (AC-69): an unrenderable file shows a reader error state with an **Open in external viewer** action that performs `app_open_document` exactly once.

## Open paths (UI-31)

- Context menu order: **Open** (reader; in-app reading glyph) directly above **Open in external viewer** (external-link glyph); then the unchanged items. The row/card hover actions line is unchanged — no Open button (verified negative case, AC-68).
- Activation (double-click, `Enter`), the Details modal's Open, and the menu's Open all route to `app_open_reader_window` through the same store path (FR-08 MODIFIED).

## Invariants

- One reader window per document: the window label, the cache directory and the create-or-focus rule all key on the document id.
- Every pdfium call in the app runs on the `RenderService` thread — covers and reader included.
- The reader window shows no library surface and holds no library state; closing it changes nothing in the library.
- First-page readiness and page state derive from measured layout (CSS width), never from a pre-layout estimate.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/pdf/` tests (9) | page rendering honours scale bounds + 1-based range; rendered pages distinguishable; document info reports fixture page counts and sizes; typed errors for unopenable documents; cache write/remove lifecycle incl. absent-directory success (AC-61, AC-62, AC-69) |
| `src-tauri/src/covers/` tests | the rewired client stage renders valid PDFs and keeps the glyph fallback (AC-63) |
| `scripts/ui-smoke.mjs` · `flowReaderOpen` | double-click and `Enter` open on page 1 with the true page count; a single click opens nothing; re-activation focuses the existing window; a second document gets its own window; the library stays interactive; AC-72 activation row |
| `scripts/ui-smoke.mjs` · `flowReaderNavigation` | page-field jump, prev/next, `PgUp`/`PgDn`, `Home`/`End`, page 1 000 of the scale fixture, mount bounds at 192 and 1 000 pages (AC-65) |
| `scripts/ui-smoke.mjs` · `flowReaderZoom` | fit-width default, fixed levels within 2 px, Fit-width return, re-derivation on resize and restore (AC-66); AC-72 zoom-change row |
| `scripts/ui-smoke.mjs` · `flowReaderClose` | `Esc` and the Close control close; the cache directory is gone on disk; another document's window stays open; delete closes the reader window (AC-67) |
| `scripts/ui-smoke.mjs` · `flowReaderErrors` | missing file → toast with Relink, no window; unrenderable → error state with the external-open action performing the open exactly once (AC-69) |
| `scripts/ui-verify.mjs` lanes | each reader flow is its own measured lane (one at a time); AC-72 rows: activation ≤ 800 ms, page jump ≤ 300 ms, zoom change ≤ 300 ms — measured through the shared timing helper |
| fixtures (`scripts/make-fixtures.mjs`) | multi-page documents: the 192-page core fixture and the 1 000-page scale document the navigation and timing claims run against |

## Change history

- 2026-11-07 (v0.0.6 — FR-17, UI-30, UI-31 ADDED; FR-08 MODIFIED; NFR-08 ADDED) — **First shipped.** Migrated from SPEC-v0.0.6 §3.2–§3.4, corrected to the verified code as released. Build-time corrections recorded in the spec and reflected above: driverless CDP driving of both windows (DR-147), current-page-first request order (DR-150), two-stage rendering with the 1 400 px preview cap, re-specified to `min(display width, cap)` (DR-151, DR-153), `overflow-anchor: none` (DR-152), measured-width gating of page state (DR-154), one state source for label and mount (DR-155), poll-consistent observation in the harness (DR-156). Verified timings (final full-mode run 2026-11-07): activation 270–376 ms against the 800 ms line, page jumps ~214 ms, zoom changes ~121 ms against the 300 ms line. Known issue (DR-170): the activation row can exceed 800 ms by a few tens of ms in rare runs under first-open load; the app's verified typical is ~370 ms; thresholds unchanged.
