# Feature spec: Categories — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `categories` (user guide page: docs/released/features/) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-02 | **Categories.** Create, rename, delete categories. A document may belong to **zero or more** categories (many-to-many). Sidebar lists categories with live document counts; selecting a category filters the library. Deleting a category detaches it from documents but never deletes the documents. | **AGREED** (DR-03) |
| FR-07 | **Bulk category operations.** Multi-select documents → add and/or remove categories in one action. | **AGREED** (DR-08) |

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-03 | A document can hold ≥2 categories; bulk add/remove applies to a multi-selection | Automated test |

## Technical design
### Schema (spec §6)

- `categories(id, name UNIQUE COLLATE NOCASE)` — name uniqueness is case-insensitive.
- `document_categories(document_id, category_id, PRIMARY KEY(document_id, category_id))` — many-to-many; FKs ON DELETE CASCADE.

### Commands

- `categories_list()` — categories with live counts: `LEFT JOIN document_categories` + `GROUP BY` (counts computed in SQL, never cached client-side).
- `categories_create(name)`, `categories_rename(id, name)`, `categories_delete(id)` — delete cascades the join table only; documents are never touched (FR-02).
- `library_set_document_categories(document_id, category_ids[])` — full replace from the editor modal.
- `library_bulk_categories(document_ids[], add[], remove[])` — one transaction; add and remove in a single action (FR-07).

### Invariants

- A document may belong to zero or more categories (FR-02).
- Category selection composes with search and favorites as AND (FR-03).
- Renaming a category never changes membership.

### UI (parent §5.3)

- **Sidebar** (`Sidebar.svelte` → `CategoryList.svelte` → `CategoryRow.svelte`): "All documents" and "Favorites" filter rows, then categories in name order; each row 32px with the name and a live count chip sourced from `categories_list` — counts are never computed or cached client-side. Selecting a row sets `category_id` in the query state (AND with search and favorites).
- **NewCategoryField.svelte**: an inline row at the end of the list ("+ New category"); Enter creates via `categories_create`, Esc closes. A duplicate-name `AppError` reopens the field with an inline error and the typed text preserved — a fixable input error is handled in place, not as a toast.
- **Rename**: context menu or `F2` on the focused row turns the row into an inline input (same validation); Enter commits through `categories_rename`, Esc discards. Membership is untouched (FR-02 invariant).
- **Delete**: context menu → `DeleteDialog` stating "Delete category «X»? N documents keep their files and stay in the library" (FR-02); Cancel is the focused default.
- **Bulk bar** (`BulkBar.svelte`, visible whenever the selection is non-empty): "Categories…" opens `CategoryPickerModal.svelte` — two-pane checkbox list (Add / Remove) over `categories_list` plus the inline new-category field; one confirm calls `library_bulk_categories(ids, add, remove)` in a single request (FR-07) and the bar then reports the applied counts.
- **CategoryChips.svelte**: at most 3 chips plus a `+N` overflow in rows and cards; the complete set is only in the editor modal (UI-02).

### Tests / acceptance

- AC-03: ≥2 categories on one document; bulk add/remove over a multi-selection, single call.

## Cross-references

User guide: `docs/released/features/categories.md` · Data model: parent §6 (`categories`, `document_categories`).
