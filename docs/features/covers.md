# Cover thumbnails

> **Status: 📝 Draft** — agreed in SPEC-v0.0.1 (FR-16); not implemented yet.

Every document shows a cover: a thumbnail of its first page, in list rows and grid cards.

- Covers are generated when you import, in a background queue — the app stays responsive while working.
- They are regenerated when Rescan detects the file changed, or when a cover is missing.
- If a page can't be rendered, a generic PDF symbol is shown instead; the import still succeeds.
- Covers are stored in the app's own data folder and cleaned up automatically when you remove a document from the library.

Covers are display-only: opening a document still uses your system's PDF viewer ([opening-and-deleting.md](opening-and-deleting.md)).
