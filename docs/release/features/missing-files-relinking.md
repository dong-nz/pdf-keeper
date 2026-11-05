# Missing files and relinking

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.3 and v0.0.4** — verified by running the app.

## When files move or disappear outside the app
The app checks all indexed paths at startup and when you press **Rescan** — never continuously in the background.

A file that no longer exists is marked **missing** in the list and counted in the status bar. Missing entries are never removed automatically — they stay until you act.

## Relinking
- From the error toast when you try to open a missing document, or
- from the document editor's **Relink…** button.

Pick the file's new location: the entry points at the new path, the missing marker clears, and (for auto-titled entries) the title follows the new filename.

> **Amendment (2026-11-04, v0.0.3):** **Rescan** moved. It is no longer a button in the bottom bar — it's **Browse ▸ Rescan files**, next to *Manage categories…*, greyed out while an import or another job is running just as before. The missing-file count is in the Browse menu next to *Missing files*; the bottom bar mentions missing files only while there are missing ones. Checking files still happens at startup and when you ask for it, never continuously; a missing entry is still marked, never removed on its own, and relinking from the error toast or from the document's **Relink…** button works exactly as described above.

> **Amendment (2026-11-05, v0.0.4):** three corrections, verified by running the app.
>
> - **Reaching a missing document is quicker.** A missing document's row or card now shows **Relink** right in its hover actions — you no longer have to open the editor or trigger an error first. (The right-click menu already had it; the row action line now matches it.) The editor's button is named **Relink**, without the dots.
> - **The missing marker on a row is plain text.** On list rows, "Missing" no longer sits on a filled background — it's plain warning-colored text, and hovering it shows the file's last known location. On cards it stays a small tinted badge on the cover. What it marks is unchanged.
> - **The warning colors are easier to read** — darker, higher-contrast text everywhere missing files are reported ([settings-and-appearance.md](settings-and-appearance.md)).
>
> Detection (startup and Rescan, never continuous), the counts, "never removed on its own", and the relink flow itself — pick the new location, the entry follows it, auto-titles follow the new filename — are all unchanged.
