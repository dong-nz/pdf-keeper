# Getting started

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3 and v0.0.4** — verified by running the app.

## System requirements
Windows 10+ (the v0.0.1 installer). macOS 12+ and Linux (AppImage or .deb) are target platforms; their builds arrive with a later release. Fully offline — no account, no network needed.

## First run
1. Install the package for your platform and launch PDF Keeper.
2. The library starts empty. Use **Import PDFs** (toolbar) to add documents — see [importing-pdfs.md](importing-pdfs.md).
3. Your PDFs stay where they are; the app only keeps an index of them.

## The window
- **Sidebar (left):** *All Documents*, *Favorites*, and your categories with live counts; a field to create a new category.
- **Toolbar (top):** search box, Import, sort selector, list/grid view switch.
- **Document area:** your library as a list or grid, with cover thumbnails.
- **Status bar (bottom):** total documents, favorites, and missing-file counts; progress while a large operation runs; and **Rescan**, which re-checks files that may have moved or disappeared ([missing-files-relinking.md](missing-files-relinking.md)).

## Typical flow
Import → organize into [categories](categories.md) → find with [search](searching.md) → open in your system's PDF viewer ([opening-and-deleting.md](opening-and-deleting.md)).

## Data location
The index is stored per user in the OS user-data directory. Removing a document from the app never touches your file unless you choose "Delete file".

> **Amendment (2026-11-04, v0.0.2):** the window layout above has changed. There is **no sidebar**: browsing and category filtering moved into the **Browse** menu at the left end of the toolbar, with your active filters shown as chips next to it ([browsing-and-filtering.md](browsing-and-filtering.md)). The toolbar row is now: **Browse · search · Import · Sort · View · your filter chips · app menu · window buttons** — the app has no system title bar any more, and its own top bar carries the minimize / maximize / close controls ([the-app-window.md](the-app-window.md)). The document area and the status bar with its counts are unchanged.

> **Amendment (2026-11-04, v0.0.3):** the toolbar is quieter. It is now **Browse · search (the import button sits inside the search box, at its right end) · Select · View · Settings · window buttons** — the separate Import button, the Sort control, the filter chips and the app menu are gone, and every control is an icon with no text: hovering it or tabbing to it shows a small label with its name ([the-app-window.md](the-app-window.md), [importing-pdfs.md](importing-pdfs.md), [sorting-and-views.md](sorting-and-views.md), [settings-and-appearance.md](settings-and-appearance.md)). The bottom bar no longer shows three numbers: it shows a quiet document count and only tells you about a job, a filter or missing files when there is something to say, and *Rescan* lives in the Browse menu ([status-feedback.md](status-feedback.md)). What the window looks like and how you import, search and organize is otherwise the same.

> **Amendment (2026-11-05, v0.0.4):** two small corrections, verified by running the app.
>
> - **The empty library's keyboard hint is drawn as keys.** The "or press Ctrl+I" under the Import button now shows the combination as a keycap — it reads as something to press, not as a sentence.
> - **You can now see where your library lives.** The *Data location* described above is shown in the settings window, under **Settings ▸ Settings ▸ Library** — the exact folder holding your index and cover thumbnails, as selectable text ([settings-and-appearance.md](settings-and-appearance.md)).
>
> Installing, importing, and everything else on this page are unchanged.
