# Metadata extraction & editing — technical reference

**Since v0.0.1 · design updated in v0.0.2** · Requirements: FR-05, FR-06, UI-02, UI-06 (ADDED in v0.0.2) · User guide: [features/metadata-editing.md](../features/metadata-editing.md) · Specs: [SPEC-v0.0.1-metadata-editing.md](../../specs/SPEC-v0.0.1-metadata-editing.md), [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (UI-06), §3.6

## Extraction (`src-tauri/src/pdfmeta/`)

- `lopdf` reads the PDF Info dictionary: `/Title` → title, `/Author` → author. Encrypted files, compressed object streams, malformed xref/trailer — all handled by fallback, never by error (FR-05).
- Fallback: title = filename minus `.pdf`, author empty. A failed extraction never fails the import batch.
- `documents.title_source` (`auto` at import, `user` on any manual edit) gates relink title re-derivation (missing-files-relinking.md).

## Editing

- `library_get_document(id)` / `library_update_document(id, title, author, notes, favorite, category_ids[])` — single transaction; FTS triggers reindex automatically (searching.md).
- Title required (NOT NULL); empty input rejected at the command layer with a typed `AppError` and shown as an inline field error.
- No length caps on title/author/notes in either layer (FR-06: "no length cap in v1"); SQLite TEXT stores what is given.
- Editing changes only the library entry — the file on disk is never renamed (FR-01).

## Editor modal (`components/DetailsModal.svelte`, 560px; UI-02)

- Opened from the row/card Details action or the context menu; one document at a time; loads via `library_get_document`.
- Fields: Title (inline error on empty, modal stays open; while `title_source = auto` and the title is untouched the field carries a quiet "from filename" provenance hint that disappears on the first edit), Author, Notes (textarea auto-growing from 84px, min-height enforced in CSS), category checkbox list + inline new-category field, favorite toggle; stored path shown in mono under the header.
- Save closes the modal only after the command resolves — no optimistic write (§5.3.4).
- `Esc` with unsaved changes routes through an inline discard-confirm bar (Keep editing / Discard); focus is trapped by the kit and returns to the opener (DR-45, DR-57).
- Footer actions (completed during stage-4 verification to match UI-02): **Delete…** hands the document to the standard delete confirmation dialog — a completed deletion closes the editor, a cancel does not; **Relink…** (rendered only when `missing`) closes the editor and opens the relink dialog, since the editor's snapshot would go stale (missing-files-relinking.md).
- The "from filename" provenance hint described in the spec's UI section was not built; provenance is visible through the title content itself (deviation recorded per Rule 7).

## Display in the library (UI-06, v0.0.2)

- `DocumentRow.svelte` renders, inside the title cell: `.title-line` (single line, `title={doc.title}` tooltip), then `{#if doc.author}` an `.author-line` and `{#if doc.notes}` a `.notes-line` — both ellipsized in CSS and carrying the full text as `title` tooltip. `DocumentCard.svelte` renders the author line under the title and clamps the title to two lines; **notes are not rendered on cards** (the editor remains their full view). Empty fields render no element and reserve no space — the row height is a function of the data, not a fixed slot with empty gaps.
- **Row heights are data-determined (DR-85).** `lib/virtual.ts` keeps the constants `ROW_HEIGHT = 48`, `ROW_LINE = 18`, `CELL_HEIGHT = 401` mirroring the CSS custom properties, and adds `rowHeight(doc)` = `ROW_HEIGHT + lines * ROW_LINE` where `lines` counts the non-empty author/notes fields (0, 1 or 2 → 48 / 66 / 84 px) and `rowOffsets(rows)` builds the prefix-offset array. `window(scrollTop, viewportHeight, offsets, overscan)` and `nearEnd(scrollTop, viewportHeight, offsets, near)` take that array; the grid keeps `uniformOffsets(count, CELL_HEIGHT)`. Windowing stays pure arithmetic with no DOM measurement, and the infinite-scroll prefetch stays correct with mixed heights because the offsets describe the actual layout.
- No truncation happens in Rust: the full strings travel in `DocumentDto` and CSS performs the clamp. Tooltips are the native `title` attribute — no second tooltip system.

## Invariants

- `title_source` transitions only auto → user (a manual edit never reverts to auto).
- Extraction failure is silent per file; only the batch result is reported (importing-pdfs.md).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/pdfmeta/` tests | Info-dict hit, encrypted fallback, malformed fallback, `title_source` transitions |
| `src-tauri/src/library/service.rs` tests | update_document single-transaction behavior, empty-title rejection, relink title re-derivation gated by `title_source` |
| `ui/src/lib/virtual.test.ts` | **v0.0.2 (DR-85):** `rowHeight` = 48 / 66 / 66 / 84 for none / author / notes / both; `rowOffsets` prefix sums over a mixed-height batch (`[0, 48, 114, 180, 264]`) and `[]` → `[0]`; `window()` / `nearEnd()` select the right slice from mixed offsets |
| `scripts/ui-smoke.mjs` | editor opens from the row menu; the auto-title provenance hint shows and disappears on the first edit; title edit saves and updates the row; the edited title is found by search; Delete… hands to the delete flow (cancel keeps the editor; completed delete removes the document and closes the editor); Relink… appears on a missing document and opens the relink dialog. **v0.0.2 (AC-08):** `flowMetadataDisplay` reads the row-height tokens from the live stylesheet, asserts author and notes render as separate lines under the title, every ellipsized line carries its full text as a tooltip, the measured row is exactly `row + lines × line` tall, an empty field renders no element and reserves no space, and a grid card shows the author line and no notes line |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-metadata-editing.md, corrected to the verified code: editor Relink…/Delete… footer actions and the "from filename" provenance hint completed during verification (UI-02); notes field auto-grows from 84px; no field length caps (FR-06); delete confirmation title plural-aware ("Delete 1 document?" / "Delete N documents?").
- 2026-11-04 (v0.0.2 — UI-06 ADDED; DR-85) — **Author and notes became visible in the library itself.** List rows render an author line under the title and a notes line below it; grid cards render the author line and clamp the title to two lines (notes stay in the editor); every ellipsized line carries its full text in the native `title` tooltip; empty fields render no element. Because the shipped list virtualized at a fixed 48px slot, row heights became data-determined: `rowHeight` / `rowOffsets` in `lib/virtual.ts` (48 / 66 / 84 px from the base + per-line tokens) feed the windowing functions, which now take a prefix-offset array instead of a constant. No backend or DTO change — the strings were already shipped. Verified by `virtual.test.ts` (heights, prefix sums, windowing over mixed offsets) and the smoke flow `flowMetadataDisplay` (lines, tooltips, measured row height, empty fields, card behavior).
