# Feature spec: Sorting & views — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `sorting-and-views` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-13 | **Sorting.** Sort library by title, date added, file size (asc/desc); default title A→Z; favorites always pinned first. | **AGREED** (DR-16) |
| FR-14 | **Views.** Table (list) view and card (grid) view, switchable by the user; both virtualized (NFR-01). | **AGREED** (DR-16) |

## Interface items

| ID | Requirement | Status |
|---|---|---|
| UI-03 | Row content: selection checkbox, favorite star, cover thumbnail, title, category badges, filename, size, date added, missing badge, action buttons. Grid cards show the cover as the card image. | **AGREED** (DR-16) |
| UI-04 | Default sort: title A→Z (favorites always first). | **AGREED** (DR-16) |

Depends on: parent NFR-01 (virtualization, bounded DOM), FR-04 (pinning), SPEC-v0.0.1-covers.md (thumbnails in rows/cards).

## Technical design
### Sorting

- Allowed keys: `title`, `date_added`, `size`; directions asc/desc. The command layer maps sort parameters through a **whitelist** — no free-form SQL, so no injection surface.
- Default: title A→Z (UI-04); favorites always first (see favorites.md).
- Choice persisted in app settings (user-data directory), restored at startup.

### Views (virtualization, NFR-01)

- **List:** table rows — checkbox, star, cover thumbnail, title, category badges, filename, size, date added, missing badge, actions (UI-03).
- **Grid:** cards, cover as card image.
- Both views render only the visible window plus a small overscan buffer; row height fixed per mode so the scroll window is computable. DOM node count stays bounded at tens of thousands of documents.
- Row data arrives as slices from `library_search` (offset/limit) — the client never loads the whole library.
- View choice persisted in app settings.

### UI (parent §5.3)

**List row anatomy** (`DocumentRow.svelte`, 48px, metrics from §5.3.7): checkbox 18 · `StarButton` 20 · `Cover` 34×48 · title 14px ellipsis · `CategoryChips` (3 + `+N`) · `MissingBadge` · filename 12px mono · size and date-added 12px tabular-nums right-aligned · `RowActions` (Open · Edit · Delete). Below 1100px container width the filename column is dropped; below 900px size and date are dropped — title and cover never give way (container queries, §5.3.7). Row actions appear on hover and are **always** visible once the row holds keyboard focus (R4.4).

**Grid card anatomy** (`DocumentCard.svelte`, 220×389): cover 220×311 as the card image with the missing badge overlaid on it, 10px padding, title 13px two-line clamp, chips row, meta line. Selected card: `--accent` outline + `--accent-quiet` fill; star and actions sit on the card's hover/focus overlay.

**SortMenu.svelte**: a menu, not a raw `<select>` — Title / Date added / File size, with an asc↔desc toggle on the active key; default Title A→Z (UI-04). Favorites-first pinning needs no visual device: favorites simply lead the list (FR-04).

**ViewToggle.svelte**: two-button segmented control (list / grid). Switching view preserves the query, the selection, and the scroll position at the same document index. Sort and view choices are written to `state/settings.svelte.ts` and restored at startup through `app_get_settings` / `app_set_setting` (DR-44).

**Keyboard** (parent §5.2 via `lib/focus.ts`): `↑ ↓ Home End PageUp PageDown` roving focus, `Space` select, `Shift+Space` range select, `Enter` open, `Delete` delete flow, `Ctrl+A` select the loaded rows (the bulk bar then offers "Select all N matching" through `library_ids`), `Shift+F10` opens the row/card context menu — which exposes exactly the `RowActions` set (R4.7).

### Tests / acceptance

- Query-builder unit tests: whitelist mapping, ordering composition, slice correctness.
- Virtualization is proven in the UI smoke script (frame budget at fixture scale), not unit-tested.

## Cross-references

User guide: `docs/released/features/sorting-and-views.md`.

---

## Build ledger

Retrofitted 2026-11-03 per DR-71 (one-time exception to the frozen-spec rule; recorded in `SPEC-v0.0.2.md`). Status reflects the verified state at the implementation/Ship commit `af70f77`.

| ID | Stage | Status | Commit | Test |
|---|---|---|---|---|
| FR-13 | Rust core | ✅ | af70f77 | `library` tests (whitelist mapping incl. unknown-value fallback, ordering composition, stable tiebreak) — superseded in v0.0.2 by the FR-13 MODIFIED (secondary key) |
| FR-14 | Rust core + commands + UI | ✅ | af70f77 | `library` tests (slice correctness); settings round-trip via `app_get_settings`/`app_set_setting`; smoke flowStartup (view/sort restore) |
| UI-03 | UI | ✅ | af70f77 | smoke flowVirtualization (list), flowStartup; real-app run |
| UI-04 | UI | ✅ | af70f77 | `ui/src/lib/virtual.test.ts` (window, gridColumns, nearEnd); smoke flowVirtualization (grid) |
