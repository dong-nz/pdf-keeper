# Opening and deleting

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## Opening
Double-click a document (or press Enter on a focused selection, or use **Open** in its context menu) — it opens in your system's default application for PDF files. If the file is missing, an error toast offers **Relink…** instead ([missing-files-relinking.md](missing-files-relinking.md)).

> **Amendment (2026-11-03):** in the shipped v0.0.1 build a **single click** on a row or card already opens the document — the double-click behavior described above is not in the code yet and arrives with the next release. Until then: select with the row's checkbox, or move with the arrow keys, select with Space, and open with Enter.

> **Amendment (2026-11-04, v0.0.2):** that difference is fixed. A **single click now only focuses or selects** a row or card; the document opens on **double-click**, on **Enter** with the row focused, or through its **Open** action — exactly as described above. Selecting with Shift/Ctrl-click and with checkboxes is unchanged.

## Deleting
Deleting (the Delete key, the row's delete action, or **Delete** in the bulk bar) asks first: a confirmation dialog shows how many documents you're about to remove and gives two choices:

- **Delete from library** — the entries are removed; your files on disk are untouched.
- **Delete with files** — removes the files themselves too (the dialog's tooltip spells this out).

Pressing Esc cancels — your selection stays, so you can retry the same action. Bulk delete works the same way for a multi-selection.
