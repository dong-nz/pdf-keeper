# Categories

> **Status: 📝 Draft** — agreed in SPEC-v1.0.0 (FR-02, FR-07); not implemented yet.

## Managing categories (FR-02)
- Create: type a name in the sidebar field (names are unique, case-insensitive).
- Rename / delete: via the category context menu (right-click) or its hover actions.
- Deleting a category removes it from all documents — it never deletes the documents themselves.

## Assigning documents
- A document can belong to **any number of categories** (or none).
- Single document: check categories in its editor modal ([metadata-editing.md](metadata-editing.md)).
- Many at once: select rows (checkboxes) → bulk bar → **Categories** → add and/or remove in one action (FR-07).
- Importing while a category is selected auto-assigns it ([importing-pdfs.md](importing-pdfs.md)).

## Browsing
Click a category in the sidebar to filter the library to it; counts update live. Category filter combines with search and Favorites.
