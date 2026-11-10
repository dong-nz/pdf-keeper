# Getting started

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.6, v0.0.7 and v0.0.8** — verified by running the app.

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
Import → organize into [tags](tags.md) → find with [search](searching.md) → open in your system's PDF viewer ([opening-and-deleting.md](opening-and-deleting.md)).

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

> **Amendment (2026-11-09, v0.0.7):** catching this page up with what the application actually does now, verified by running it.
>
> - **Opening a document opens it inside PDF Keeper.** Since v0.0.6 a double-click (or `Enter`) opens the document in the app's own reading window; the right-click menu also offers **Open in external viewer** for your system's PDF viewer ([reading-pdfs.md](reading-pdfs.md), [opening-and-deleting.md](opening-and-deleting.md)). The "Typical flow" above reads: Import → organize → search → **read**.
> - **Your library's location is easier to reach and easier to open.** It's shown in **Settings ▸ Settings**, under a **Data location** heading (no longer under "Library"), and next to it is a button that opens that folder in your system's file manager ([settings-and-appearance.md](settings-and-appearance.md)).
> - **The bottom bar's document count is labeled** — "1,234 documents" — and hover labels across the app are drawn in the app's own readable tooltip style ([status-feedback.md](status-feedback.md), [the-app-window.md](the-app-window.md)).
> - **Importing never blocks the app**: search, browsing and opening documents keep working while an import runs, and its progress is visible from start to finish ([importing-pdfs.md](importing-pdfs.md)).
>
> Installing, system requirements, and the rest of this page are unchanged.

> **Amendment (2026-11-10, v0.0.8):** verified by running the app on a fresh, empty library.
>
> - **The empty screen now offers both import actions** — a primary **Import PDFs** button and a secondary **Import folder** button beside it, each with its key hint drawn as keycaps: *Ctrl+I* and *Ctrl+O*. Importing a whole folder is a first-run choice, not something you have to discover later.
> - **Organizing your library is now called tagging**: the groups described on this page and across the guide are **tags** ([tags.md](tags.md)). What you already organized carried over unchanged.
>
> System requirements, installation, data location, and the rest of this page are unchanged.
