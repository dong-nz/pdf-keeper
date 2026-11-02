# Getting started

> **Status: 📝 Draft** — agreed in SPEC-v0.0.1; not implemented yet.

## System requirements (NFR-04)
Windows 10+, macOS 12+, or Linux (AppImage or .deb). Fully offline — no account, no network needed (NFR-03).

## First run
1. Install the package for your platform and launch PDF Manager.
2. The library starts empty. Use **Import PDFs** (toolbar) to add documents — see [importing-pdfs.md](importing-pdfs.md).
3. Your PDFs stay where they are; the app only keeps an index of them.

## The window (UI-01)
- **Sidebar (left):** *All Documents*, *Favorites*, and your categories with live counts; a field to create a new category.
- **Toolbar (top):** search box, Import, sort selector, list/grid view switch, Rescan.
- **Document area:** your library as a list or grid, with cover thumbnails.
- **Status bar (bottom):** total documents, favorites, missing-file counts.

## Typical flow
Import → organize into [categories](categories.md) → find with [search](searching.md) → open in your system's PDF viewer ([opening-and-deleting.md](opening-and-deleting.md)).

## Data location
The index is stored per user in the OS user-data directory. Removing a document from the app never touches your file unless you choose "Delete file" (FR-09).
