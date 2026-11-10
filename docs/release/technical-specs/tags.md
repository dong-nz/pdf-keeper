# Tags — technical reference

**Since v0.0.1 (as *Categories*) · design updated in v0.0.2, v0.0.3, v0.0.4 and v0.0.8** · Requirements: FR-02 (filter semantics MODIFIED in v0.0.2, DR-82), FR-07; v0.0.4: UI-24 (count presentation); v0.0.8: UI-42 (the full rename to the tag vocabulary) · User guide: [features/tags.md](../features/tags.md) · Specs: [SPEC-v0.0.1-categories.md](../../specs/SPEC-v0.0.1-categories.md), [SPEC-v0.0.2.md](../../specs/SPEC-v0.0.2.md) §2 (FR-02), §3.2 (UI-09), §3.3 (UI-10); [SPEC-v0.0.3.md](../../specs/SPEC-v0.0.3.md) §2 (UI-03), §3.4 — decision DR-99; [SPEC-v0.0.4.md](../../specs/SPEC-v0.0.4.md) §3.15 — decision DR-116a; [SPEC-v0.0.8.md](../../specs/SPEC-v0.0.8.md) §3.7 — decisions DR-257 (OQ-50 closed as B: the full rename), DR-273 (clean table create, no RENAME statements)

## Schema (`src-tauri/src/db/mod.rs`)

Since v0.0.8 the schema is one clean baseline at `PRAGMA user_version = 2` (`SCHEMA_BASELINE`, created by a single `execute_batch`):

- `documents(... reading, pdf_password ...)` — the v0.0.8 columns (see [reading-collection.md](reading-collection.md), [password-protected-pdfs.md](password-protected-pdfs.md)).
- `tags(id, name UNIQUE COLLATE NOCASE)` — case-insensitive name uniqueness.
- `document_tags(document_id, tag_id, PRIMARY KEY(document_id, tag_id))` — many-to-many, FKs `ON DELETE CASCADE`.
- `settings`, the FTS table and triggers unchanged in shape.

**No category-named object is ever created** (AC-113): a fresh database runs only the baseline. A database at `user_version = 1` (the v0.0.1–v0.0.7 shape, `categories` / `document_categories`) is upgraded by `UPGRADE_V1_TO_V2`: the two new `documents` columns are added, the clean `tags` / `document_tags` tables are created, rows are copied (`INSERT … SELECT`, ids preserved), the old tables are dropped. No `RENAME` statement exists in the codebase (DR-273 — the user's decision: "clean table create, not altered"; there was no installed user base to preserve through renames).

## Commands

| Command | Behavior |
|---|---|
| `tags_list` | tags with live counts — `LEFT JOIN document_tags` + `GROUP BY`; counts computed in SQL, never cached client-side |
| `tags_create(name)` / `tags_rename(id, name)` / `tags_delete(id)` | delete cascades the join table only; documents are never touched (FR-02) |
| `library_set_document_tags(document_id, tag_ids[])` | full replace from the Details dialog |
| `library_bulk_tags(document_ids[], add[], remove[])` | add and remove in one transaction (FR-07) |

The v0.0.1–v0.0.7 command names (`categories_*`, `library_set_document_categories`, `library_bulk_categories`, `DocumentDto.categories`) were renamed together with the service/query/db identifiers, error messages, the R1.3 whitelist and the typed client (`api.ts`) — one codebase, no external command consumers (UI-42, AC-113).

## Invariants

- A document may belong to zero or more tags (FR-02).
- **Any number of tag ids may be active as a filter; the SQL is `EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = d.id AND dt.tag_id IN (?, ?, …))` — the union, each document selected once** (FR-02 as modified in v0.0.2). With one id the statement is the single-id path; with an empty list the clause is absent entirely, so the unfiltered query is byte-identical to the no-filter statement.
- The tag set composes with the filter modes (favorites / missing / reading) and with search terms as `(A OR B) AND mode AND terms` — the mode and text clauses are the ones searching.md and reading-collection.md document, never a third path.
- Renaming a tag never changes membership. (Renaming a document's *file* is a different feature — [renaming-a-documents-file.md](renaming-a-documents-file.md) — and preserves tag membership.)
- `last_filter` grammar (settings): `all | favorites | missing | reading` optionally followed by `&tags=<id>(,<id>)*`. The decoder still accepts the legacy forms — `&cats=<id>` (v0.0.2+) and `cat:<id>` (v0.0.1) — so a filter saved before the rename restores with the same groups; new values are written as `&tags=` (`is_valid_filter` / `is_valid_id_list` in `library/service.rs`).

## UI (`ui/src/`)

- Manager: `components/TagsDialog.svelte`, opened from Browse ▸ *Manage tags* (mounted through the shared `Modal` open-binding, DR-63; empty state "No tags yet — create one with Manage tags"). It reuses the released `TagList` / `TagRow` / `NewTagField` components (renamed from their `Category*` names in v0.0.8 — same components, new identifiers) and the renamed `RenameTagDialog` / `DeleteTagDialog`, all following the `DeleteDialog` open-binding pattern (DR-63).
- Filtering: `BrowseMenu.svelte`'s checkable multi-select **Tags** submenu with live counts; the submenu's checked items are the filter display (the chips were removed in v0.0.3).
- `NewTagField`: Enter creates; a duplicate-name `AppError` reopens the field with an inline error and the typed text preserved.
- Bulk: `BulkBar.svelte` → `TagPickerModal.svelte`: two-pane Add/Remove checkbox list pre-ticked from current membership; confirm calls `library_bulk_tags` once.
- The editor's tag picker is the Details dialog's `details.fieldTags` checkbox field. `DocumentDto.tags` ships per document (the v0.0.1 `DocumentDto.categories`, renamed) — what keeps the Details dialog and the picker free of a second query path (R1.6).
- The manager's live count is quiet secondary text with tabular figures (v0.0.4, UI-24 unchanged); `chip-cutover.test.ts` still guards the removed pill classes.
- The i18n catalog carries the tag vocabulary in both values and keys (`browse.tags`, `browse.manage`, `tagsDialog.*`, `bulk.tags`, `tag.renameAction`, …); `i18n/coverage.test.ts` and `i18n/terminology.test.ts` assert that no user-facing string contains *category/categories* (AC-113).

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/service.rs` tests | `tags_membership_bulk_edit_and_delete_cascade` (≥2 tags on one document, bulk add/remove in one call, delete detaches but keeps documents, case-insensitive uniqueness, counts in SQL), `import_assigns_every_active_tag`, `import_skips_duplicates_and_auto_assigns_the_selected_tag`, `last_filter_grammar_accepts_the_new_form_and_the_legacy_one` (incl. `&cats=` and `cat:` upgrade paths) |
| `src-tauri/src/library/query.rs` tests | `several_active_tags_select_the_union` — each single id equals its own result set, two ids equal the union with the shared document counted once, union ∧ modes, union ∧ terms, empty list byte-equal to the unfiltered query |
| `src-tauri/src/db` tests | `v2_upgrade_rebuilds_the_tag_tables_and_preserves_rows` — a version-1 database keeps its groups and assignments through the rebuild; the baseline creates the tag tables clean |
| `ui/src/lib/i18n` | `coverage.test.ts` (no orphan keys; the category-word scan), `terminology.test.ts` (the audit set asserts the tag wording) |
| `scripts/ui-smoke.mjs` | `flowTags` (create through Browse ▸ *Manage tags*; the bulk picker pre-ticks reflect current membership and the assignment is asserted through picker state + live counts), `flowTagCrud` (rename with the duplicate-name inline error, delete confirmation), `flowTagsMulti` (union result sets, checked items in the Browse submenu), `flowQuietCounts` (the count's computed style equals the `tags_list` response) |

## Change history

- 2026-11-03 (v0.0.1) — First shipped as *Categories*. Migrated from SPEC-v0.0.1-categories.md, corrected to the verified code (see the earlier entries for the sidebar/rail and dialog details — the sidebar and its icon rail were deleted in v0.0.2).
- 2026-11-04 (v0.0.2 — FR-02 MODIFIED, UI-09, UI-10; DR-82, DR-68) — Filter semantics became a multi-select union (`EXISTS … IN (?, …)`, no clause for an empty list); `last_filter` gained `&cats=` while still accepting the v0.0.1 `cat:` form. The sidebar was deleted; CRUD moved into the manager dialog.
- 2026-11-04 (v0.0.3 — presentation only, UI-03 MODIFIED; DR-99) — `CategoryChips.svelte` deleted: rows and cards no longer show membership; the union filter, the grammar, the manager dialog, the picker and the bulk call are unchanged.
- 2026-11-05 (v0.0.4 — UI-24 §3.15, DR-116a) — Presentation only: the manager's live count became quiet text with tabular figures; the `.chip` / `.chip-accent` rules were deleted, guarded by `chip-cutover.test.ts`.
- 2026-11-10 (v0.0.8 — UI-42, AC-113; DR-257 OQ-50 B, DR-273) — **The full rename to *tags*, behavior unchanged.** Schema: `categories`/`document_categories` replaced by the clean `tags`/`document_tags` baseline (`user_version` 2); version-1 databases rebuilt by copy-and-drop, no `RENAME` statement (DR-273). Commands `categories_*` → `tags_*`, `library_bulk_categories` → `library_bulk_tags`, `library_set_document_categories` → `library_set_document_tags`; `DocumentDto.categories` → `tags`; service/query/db identifiers, error variants and messages renamed. Frontend: `filter.category_ids` → `tag_ids`, component files and identifiers renamed (`TagsDialog`, `TagRow`, `TagPickerModal`, `RenameTagDialog`, `DeleteTagDialog`, …), the catalog's values **and** keys renamed, `actions.ts` ids renamed. `last_filter` writes `&tags=`, decodes the legacy `&cats=` / `cat:`. Test names and harness label assertions moved with the code (`flowTags*`); `terminology.test.ts` added the user-facing-wording audit. Verified by the Rust tests above, the unit audits and the renamed lanes.
