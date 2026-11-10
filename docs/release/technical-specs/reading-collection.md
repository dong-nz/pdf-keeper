# The Reading collection — technical reference

**Since v0.0.8** · Requirements: FR-19 (ADDED), UI-43 (ADDED) · User guide: [features/reading-collection.md](../features/reading-collection.md) · Spec: [SPEC-v0.0.8.md](../../specs/SPEC-v0.0.8.md) §2 (FR-19, UI-43), §3.2 (design) — decisions DR-257 (OQ-47 closed as A: flag + special view; OQ-48 closed as B: manual-only membership), DR-265 (the live-count extension of the counts mechanism)

## Model (`src-tauri/src/`)

- **Schema**: `documents.reading INTEGER NOT NULL DEFAULT 0`. Fresh databases get the column in the clean `SCHEMA_BASELINE` (created together with the v0.0.8 tag re-baseline, `db/mod.rs`, `user_version` 2); a database at `user_version = 1` gets `ALTER TABLE documents ADD COLUMN reading INTEGER NOT NULL DEFAULT 0` in the `UPGRADE_V1_TO_V2` rebuild. No new table.
- **Service** (`library/service.rs`): `set_reading(conn, ids, on)` — single and batch, in one transaction for batches. `list_documents` gains the `reading_only` predicate beside the existing `favorites_only` / `missing_only` arms (`query.rs`); `DocumentDto` carries `reading: bool`. The *Reading* view composes with search and tag filters exactly like the other modes and is exclusive of the other filter modes (the released filter-mode rule unchanged).
- **Manual-only invariant (AC-102)**: the `reading` column is written **only** by `set_reading`. `app_open_reader_window` and `app_open_document` perform no membership write — opening, relinking and rescanning never change membership. Enforced by `opening_relinking_and_rescan_never_change_reading_membership`.
- **Counts**: the Reading count rides the existing status-counts mechanism (`get_counts` → `CountsDto` → `status_updated` → Browse menu), extended by this release (DR-265) — no second counting path.

## Commands (thin wrappers, R1.2)

- `library_set_reading(ids, on)` (`commands.rs`) → whitelist + typed client (`ui/src/api.ts`); the `command_router_matches_the_ui_command_client` test keeps router and client in step.

## UI (`ui/src/`)

- `library.filter.reading_only` flag; `BrowseMenu.MODES` carries the fourth entry `{ mode: "reading", icon: "bookmark" }` with the live count and checked-item behavior (the Favorites pattern).
- The toggle is one `documentActions` entry (`ui/src/lib/actions.ts`, id `reading`) rendered in the row's action line, the card's hover line and the context menu — state-following label/icon (`row.reading` / `row.unreading`, `bookmark` / `bookmark-fill`), following the released favorite-toggle mechanism. `icons.ts` gained the `bookmark` glyph pair (24×24 grid, 2 px stroke, the released icon rules).
- The search-scope placeholder names the view ("Search in Reading", `searchScope.ts`).
- The empty Reading view reuses the released `EmptyState` with its own copy (`empty.reading.*`).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library` | `reading_membership_single_and_bulk_with_view_and_counts`, `reading_view_combines_with_search_favorites_tags_and_missing`, `opening_relinking_and_rescan_never_change_reading_membership` (AC-102), `query::tests::reading_view_selects_exactly_the_members` |
| `src-tauri/src/db` | `v2_upgrade_rebuilds_the_tag_tables_and_preserves_rows` (the `reading` column in the upgrade) |
| `ui/src/lib` | `searchScope.test.ts` (the Reading placeholder) |
| `scripts/ui-smoke.mjs` | `flowReading` (17 checks: toggle through row action and context menu, membership across restart, the view shows exactly the members, the Browse count and checked item, composition with search, external open leaves membership untouched); `flowBrowseIcons` (the Reading item's 16 px glyph) |

## Change history

- 2026-11-10 (v0.0.8 — FR-19, UI-43) — First shipped. Migrated from SPEC-v0.0.8.md §3.2, corrected to the code as verified: the flag/view design as drafted (OQ-47 A, OQ-48 B); the live count rides the extended `get_counts` mechanism (DR-265). Verified by the Rust tests above and `flowReading` (AC-121, AC-102, AC-103).
