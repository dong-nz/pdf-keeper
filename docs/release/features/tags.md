# Tags

> **Status: ✅ Shipped in v0.0.1 (as *Categories*), renamed to **Tags** in v0.0.8** — verified by running the app. The feature is the same one that shipped as Categories; since v0.0.8 the app calls these groups **tags** everywhere — in the Browse menu, the tags window, document actions, tooltips, messages, and this guide.

## Managing tags
- Open **Browse ▸ Manage tags**: it lists every tag with its live count, has an always-available *New tag* field, and per-row **Rename** / **Delete** actions. Tag names are unique (case-insensitive); a duplicate name is refused with a clear message.
- Deleting a tag removes it from all documents — it never deletes the documents themselves.

## Assigning documents
- A document can belong to **any number of tags** (or none).
- Single document: choose tags in its Details dialog.
- Many at once: select rows (checkboxes) → bulk bar → **Tags** → add and/or remove in one action.
- Importing while one or more tags are active assigns all of them ([importing-pdfs.md](importing-pdfs.md)).

## Browsing
**Browse ▸ Tags** lists your tags with live counts; its items are checkable and **multi-select** — filtering by several tags shows the documents in *any* of them (a document in two of them is listed once). The tag filter combines with search, Favorites, Reading and Missing. The Browse menu is also the only place that shows which tags you're currently filtering by ([browsing-and-filtering.md](browsing-and-filtering.md)).

## History (how this page got here)

> **Amendment (2026-11-03):** the rename/delete dialogs were broken before this fix — opening them from the sidebar did nothing at all. Both then worked, including in the collapsed icon rail.

> **Amendment (2026-11-04, v0.0.2):** the sidebar — its category list, the new-category field and the collapsed icon rail — was removed. Everything moved into the **Categories** dialog (opened from **Browse ▸ Manage categories…**) and filtering moved to **Browse ▸ Categories** as a multi-select. Importing while several categories are active has assigned all of them since then.

> **Amendment (2026-11-04, v0.0.3):** documents stopped showing their category names in the list and the grid — rows and cards show document content only. Group membership is seen and changed in the document's editor and in the bulk action, and filtering shows the active selection in the Browse menu.

> **Amendment (2026-11-05, v0.0.4):** in the categories window, each count is quiet text in line with the rest of the row — no filled pill behind the number.

> **Amendment (2026-11-10, v0.0.8):** the application now calls these groups **tags** in every surface: *Browse ▸ Tags*, *Browse ▸ Manage tags*, the Tags window, the bulk **Tags** action, the Details field, all tooltips and messages. Nothing about the feature changed — same groups, same counts, same multi-select filtering, same import assignment; only the name. Your existing groups and assignments carried over unchanged when you updated the app.
