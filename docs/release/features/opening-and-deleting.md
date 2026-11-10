# Opening and deleting

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.6 and v0.0.8** — verified by running the app.

## Opening
Double-click a document (or press Enter on a focused selection, or use **Open** in its context menu) — it opens in your system's default application for PDF files. If the file is missing, an error toast offers **Relink…** instead ([missing-files-relinking.md](missing-files-relinking.md)).

> **Amendment (2026-11-03):** in the shipped v0.0.1 build a **single click** on a row or card already opens the document — the double-click behavior described above is not in the code yet and arrives with the next release. Until then: select with the row's checkbox, or move with the arrow keys, select with Space, and open with Enter.

> **Amendment (2026-11-04, v0.0.2):** that difference is fixed. A **single click now only focuses or selects** a row or card; the document opens on **double-click**, on **Enter** with the row focused, or through its **Open** action — exactly as described above. Selecting with Shift/Ctrl-click and with checkboxes is unchanged.

> **Amendment (2026-11-04, v0.0.3):** what a plain click does depends on a switch in the toolbar. By default (browsing mode) a click on a row or card **only puts the keyboard focus there** — it changes nothing about your selection, so browsing the list can't accidentally build one up. Turn on **Select** in the toolbar and a click selects instead, a second click unselects; a double-click still opens. `Shift`-click and `Ctrl`-click ranges and `Space` on the focused row work in both modes, and the row's selection checkbox is gone ([selecting-documents.md](selecting-documents.md)). Opening and deleting themselves are unchanged: double-click, `Enter`, the **Open** action, and the same delete confirmation with **Delete from library** / **Delete with files**.

## Deleting
Deleting (the Delete key, the row's delete action, or **Delete** in the bulk bar) asks first: a confirmation dialog shows how many documents you're about to remove and gives two choices:

- **Delete from library** — the entries are removed; your files on disk are untouched.
- **Delete with files** — removes the files themselves too (the dialog's tooltip spells this out).

Pressing Esc cancels — your selection stays, so you can retry the same action. Bulk delete works the same way for a multi-selection.

> **Amendment (2026-11-05, v0.0.4):** one correction, verified by running the app. The *Relink…* action offered in the error toast when you open a missing document is now named **Relink**, without the dots (see the label rule in [browsing-and-filtering.md](browsing-and-filtering.md)); missing documents also carry a **Relink** action directly on their row and card ([missing-files-relinking.md](missing-files-relinking.md)). Opening (double-click, `Enter`, the **Open** action) and deleting (the confirmation with **Delete from library** / **Delete with files**, Esc keeping your selection) are unchanged.

> **Amendment (2026-11-07, v0.0.6):** opening has a new destination. Double-click, `Enter` on the focused row, and the **Open** action now open the document in PDF Keeper's **built-in reader** — its own window per document, with page navigation and zoom ([reading-pdfs.md](reading-pdfs.md)). Opening with the application your computer would otherwise use hasn't gone away: it is now the **Open in external viewer** item in the right-click menu, directly below **Open**. The row and card hover actions are unchanged (star, details, delete, relink — no Open button there). Deleting is unchanged.

> **Amendment (2026-11-10, v0.0.8):** two additions around opening, verified in the running app.
>
> - **Open containing folder** — in the right-click menu and in Details — opens the document's folder in your system's file manager with the file selected ([finding-a-documents-file.md](finding-a-documents-file.md)). It is offered only when the file is present; a missing document keeps **Relink**.
> - **A password-protected document** opened with the built-in reader shows a password prompt in the reading window instead of an error ([password-protected-pdfs.md](password-protected-pdfs.md)). *Open in external viewer* hands such a document to your system's application, which asks for the password its own way.
>
> Opening (double-click, `Enter`, **Open**), external viewing, and the delete flow are unchanged.
