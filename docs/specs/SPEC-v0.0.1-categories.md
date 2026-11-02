# Feature spec: Categories — v0.0.1

**Parent:** [SPEC-v0.0.1.md](SPEC-v0.0.1.md) · **Slug:** `categories` (docs/released pair) · **Lifecycle:** inherits the parent's registry status; frozen with the parent.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-02 | **Categories.** Create, rename, delete categories. A document may belong to **zero or more** categories (many-to-many). Sidebar lists categories with live document counts; selecting a category filters the library. Deleting a category detaches it from documents but never deletes the documents. | **AGREED** (DR-03) |
| FR-07 | **Bulk category operations.** Multi-select documents → add and/or remove categories in one action. | **AGREED** (DR-08) |

## Acceptance criteria

| ID | Criterion | Verification method |
|---|---|---|
| AC-03 | A document can hold ≥2 categories; bulk add/remove applies to a multi-selection | Automated test |

## Cross-references

Implementation design: `docs/released/technical-specs/categories.md` · User guide: `docs/released/features/categories.md` · Data model: parent §6 (`categories`, `document_categories`).
