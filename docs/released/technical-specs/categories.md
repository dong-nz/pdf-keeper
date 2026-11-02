# Categories — technical spec

**Status: Planned v0.0.1** (SPEC-v0.0.1.md FR-02, FR-07; AC-03). Not implemented.
**Feature spec:** none — cross-cutting page (requirements in parent SPEC-v0.0.1.md)

## Schema (spec §6)

- `categories(id, name UNIQUE COLLATE NOCASE)` — name uniqueness is case-insensitive.
- `document_categories(document_id, category_id, PRIMARY KEY(document_id, category_id))` — many-to-many; FKs ON DELETE CASCADE.

## Commands

- `categories_list()` — categories with live counts: `LEFT JOIN document_categories` + `GROUP BY` (counts computed in SQL, never cached client-side).
- `categories_create(name)`, `categories_rename(id, name)`, `categories_delete(id)` — delete cascades the join table only; documents are never touched (FR-02).
- `library_set_document_categories(document_id, category_ids[])` — full replace from the editor modal.
- `library_bulk_categories(document_ids[], add[], remove[])` — one transaction; add and remove in a single action (FR-07).

## Invariants

- A document may belong to zero or more categories (FR-02).
- Category selection composes with search and favorites as AND (FR-03).
- Renaming a category never changes membership.

## Tests / acceptance

- AC-03: ≥2 categories on one document; bulk add/remove over a multi-selection, single call.

## Change history
- v0.0.1 (planned): introduced.
