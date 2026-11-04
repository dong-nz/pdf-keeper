# PDF Keeper — User Guide

How the application works for you: what it does and how to use it. Written in plain language — no technical terms. For how a feature is built: released features are documented in `docs/release/technical-specs/`; planned (not yet built) features are described technically in the current development spec (`docs/specs/`). For what a specific version changed: `docs/release/notes/`.

## Page status legend

| Marker | Meaning |
|---|---|
| 📝 **Draft** | Planned for a future release, but the application does not do this yet — the text describes planned behavior, not verified behavior |
| ✅ **Shipped in v…** | Implemented and tested; the text describes real behavior |

**Current state: v0.0.2 is shipped.** Every page below describes the built application, verified by running it (Windows). The v0.0.2 installer exists for Windows only; macOS and Linux builds come with a later release. Pages marked *updated in v0.0.2* carry an Amendment note describing what changed for that release.

## Pages

| Page | What it covers | Status |
|---|---|---|
| [getting-started.md](getting-started.md) | Installing, first run, the window | ✅ Shipped in v0.0.1, updated in v0.0.2 |
| [the-app-window.md](the-app-window.md) | The title bar, window buttons, the app menu, scrollbars | ✅ Shipped in v0.0.2 |
| [browsing-and-filtering.md](browsing-and-filtering.md) | The Browse menu, filter chips, filtering by several categories | ✅ Shipped in v0.0.2 |
| [importing-pdfs.md](importing-pdfs.md) | Adding PDFs to your library | ✅ Shipped in v0.0.1, updated in v0.0.2 |
| [categories.md](categories.md) | Organizing documents into categories | ✅ Shipped in v0.0.1, updated in v0.0.2 |
| [searching.md](searching.md) | Finding documents | ✅ Shipped in v0.0.1 |
| [metadata-editing.md](metadata-editing.md) | Titles, authors, notes | ✅ Shipped in v0.0.1, updated in v0.0.2 |
| [favorites.md](favorites.md) | Starring documents you use often | ✅ Shipped in v0.0.1 |
| [sorting-and-views.md](sorting-and-views.md) | Ordering and switching views | ✅ Shipped in v0.0.1, updated in v0.0.2 |
| [covers.md](covers.md) | Cover thumbnails in the list | ✅ Shipped in v0.0.1 |
| [opening-and-deleting.md](opening-and-deleting.md) | Opening a PDF, removing documents | ✅ Shipped in v0.0.1, updated in v0.0.2 |
| [missing-files-relinking.md](missing-files-relinking.md) | When a file moved or disappeared | ✅ Shipped in v0.0.1 |
| [status-feedback.md](status-feedback.md) | Library counts and action results | ✅ Shipped in v0.0.1 |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | Keyboard shortcuts | ✅ Shipped in v0.0.1, updated in v0.0.2 |

## Maintenance

- Every release updates these pages: new capabilities get a page, changed behavior gets corrected text, removed capabilities stay marked *Removed in v…*.
- Pages never mention internal requirement numbers, technologies, or settings a user never sees.
