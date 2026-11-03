# Categories — technical reference

**Since v0.0.1** · Requirements: FR-02, FR-07 · User guide: [features/categories.md](../features/categories.md) · Spec: [SPEC-v0.0.1-categories.md](../../specs/SPEC-v0.0.1-categories.md)

## Schema

- `categories(id, name UNIQUE COLLATE NOCASE)` — case-insensitive name uniqueness.
- `document_categories(document_id, category_id, PRIMARY KEY(document_id, category_id))` — many-to-many, FKs `ON DELETE CASCADE`.

## Commands

| Command | Behavior |
|---|---|
| `categories_list` | categories with live counts — `LEFT JOIN document_categories` + `GROUP BY`; counts computed in SQL, never cached client-side |
| `categories_create(name)` / `categories_rename(id, name)` / `categories_delete(id)` | delete cascades the join table only; documents are never touched (FR-02) |
| `library_set_document_categories(document_id, category_ids[])` | full replace from the editor modal |
| `library_bulk_categories(document_ids[], add[], remove[])` | add and remove in one transaction (FR-07) |

## Invariants

- A document may belong to zero or more categories (FR-02).
- Category selection composes with search/favorites as AND (FR-03).
- Renaming never changes membership.

## UI (`ui/src/`)

- `Sidebar.svelte` → `CategoryList.svelte` → `CategoryRow.svelte`: saved-search rows (All / Favorites / Missing), then categories in name order with live count chips from `categories_list`. Selecting sets `category_id` in query state. The sidebar is fixed-width (`--side-width` 264px; global `border-box` makes the declared width exact) and collapsible via its chevron to a 56px icon rail (`--side-rail`): all labels, counts, the section label, the new-category field, category row names and chips are hidden in the rail — category rows are icon-only and the nav has zero horizontal overflow (DR-61). Collapse state is component-local; not persisted (settings persistence covers view/sort only, DR-44).
- `NewCategoryField.svelte`: inline "+ New category" row; Enter creates; a duplicate-name `AppError` reopens the field with an inline error and the typed text preserved (fixable input errors never surface as toasts).
- Rename: context menu or hover action → `RenameCategoryDialog.svelte` — prefilled field, duplicate name → inline error in the open dialog, commit through `categories_rename`, Discard closes. (The spec's original inline-input/`F2` design was superseded by the dialog — deviation recorded in DR-64.)
- Delete: context menu or hover action → `DeleteCategoryDialog.svelte` — confirmation stating documents keep their files; Discard / Delete category. Both dialogs follow the `DeleteDialog` open-binding pattern (`open = $state(true)` + `bind:open` + `$effect → ondone`) — a bare `<Modal>` mounted from `{#if}` renders closed (DR-63).
- `BulkBar.svelte` (visible when the selection is non-empty) → `CategoryPickerModal.svelte`: two-pane Add/Remove checkbox list pre-ticked from current membership; confirm calls `library_bulk_categories` once. Verified: the applied result is shown by the row chips and live counts updating — the spec's "bar reports applied counts" toast was not built (deviation recorded here per Rule 7; no requirement demands it).
- `CategoryChips.svelte` in rows/cards: at most 3 chips + `+N` overflow; full set only in the editor.

## Test mapping

| Layer | Coverage |
|---|---|
| `src-tauri/src/library/service.rs` tests | ≥2 categories on one document (AC-03), bulk add/remove in one call, delete detaches but keeps documents, case-insensitive uniqueness, counts in SQL |
| `scripts/ui-smoke.mjs` | category creation via keyboard; picker pre-ticks reflect current membership; checkbox toggle changes the assignment; bulk assignment shows chips on all assigned rows; sidebar filter shows exactly the assigned documents; sidebar rail: 56px/264px widths, zero horizontal overflow incl. hover, rename from the rail (menu → prefilled dialog → commit → name updated), delete confirmation reachable and cancellable from the rail |

## Change history

- 2026-11-03 (v0.0.1) — First shipped. Migrated from SPEC-v0.0.1-categories.md, corrected to the verified code: no post-bulk applied-count toast (chips/counts are the feedback); sidebar also carries a Missing saved-search row (missing-files-relinking.md).
- 2026-11-03 (v0.0.1, pre-Ship fix DR-61) — Sidebar rail corrected to the §5.3 design after a user-reported horizontal scrollbar: exact 264px / 56px-rail widths (tokens were defined but never applied — the grid sized to content), and rail hiding extended to child-component DOM via `:global()` (category row names + count chips). Smoke flow `flowSidebarRail` asserts both widths and zero horizontal overflow.
- 2026-11-03 (v0.0.1, pre-Ship fixes DR-62/DR-63/DR-64) — Rail hover no longer reveals the hidden actions or the scrollbar (hiding rules cover the `:hover`/`:focus-within` variants that out-ranked the plain rule). Category rename/delete dialogs — previously mounted closed and unreachable in every sidebar state — became real components (`RenameCategoryDialog`, `DeleteCategoryDialog`) following the `DeleteDialog` open-binding; verified end-to-end from the rail. The rename/delete design deviation (dialog instead of the spec's inline input/`F2`) was raised and adopted by the user (DR-64); the feature spec carries MODIFIED markers.
