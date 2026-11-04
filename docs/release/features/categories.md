# Categories

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## Managing categories
- Create: type a name in the sidebar field (names are unique, case-insensitive).
- Rename / delete: via the category context menu (right-click) or its hover actions.
- Deleting a category removes it from all documents — it never deletes the documents themselves.

> **Amendment (2026-11-03):** these dialogs were broken before this fix — opening rename or delete from the sidebar did nothing at all. Both now work, including in the collapsed icon rail: right-click a category icon there and the same menu and dialogs open.

## Assigning documents
- A document can belong to **any number of categories** (or none).
- Single document: check categories in its editor modal ([metadata-editing.md](metadata-editing.md)).
- Many at once: select rows (checkboxes) → bulk bar → **Categories** → add and/or remove in one action.
- Importing while a category is selected auto-assigns it ([importing-pdfs.md](importing-pdfs.md)).

## Browsing
Click a category in the sidebar to filter the library to it; counts update live. Category filter combines with search and Favorites.

> **Amendment (2026-11-04, v0.0.2):** the sidebar — its category list, the new-category field and the collapsed icon rail — no longer exists. Everything described above now lives in the **Categories** dialog, opened from **Browse ▸ Manage categories…**: it lists every category with its live count, has an always-available *New category* field, and per-row **Rename** / **Delete** actions. The dialogs, the duplicate-name error and the delete confirmation are the same ones as before.
>
> Filtering has moved to **Browse ▸ Categories**, whose items are checkable and **multi-select**: you can now filter by several categories at once, and the result is the documents in *any* of them (a document in two of them is listed once). See [browsing-and-filtering.md](browsing-and-filtering.md). Importing while several categories are active assigns all of them ([importing-pdfs.md](importing-pdfs.md)).
