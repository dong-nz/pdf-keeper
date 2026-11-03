# Getting started

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

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
