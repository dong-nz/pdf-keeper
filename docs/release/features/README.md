# PDF Keeper — User Guide

How the application works for you: what it does and how to use it. Written in plain language — no technical terms. For how a feature is built: released features are documented in `docs/release/technical-specs/`; planned (not yet built) features are described technically in the current development spec (`docs/specs/`). For what a specific version changed: `docs/release/notes/`.

## Page status legend

| Marker | Meaning |
|---|---|
| 📝 **Draft** | Planned for a future release, but the application does not do this yet — the text describes planned behavior, not verified behavior |
| ✅ **Shipped in v…** | Implemented and tested; the text describes real behavior |

**Current state: v0.0.1 through v0.0.8 are shipped.** Pages below marked ✅ describe the built application, verified by running it (Windows). v0.0.8 ships for Windows only; macOS and Linux builds come with a later release, and their behavior is described from the same design rather than from a test on that hardware. Pages marked *updated in v…* carry dated Amendment notes describing what changed for the user in those releases; the original text stays so you can see what changed. For what a release changed as a whole, read [the release notes](../notes/).

## Pages

| Page | What it covers | Status |
|---|---|---|
| [getting-started.md](getting-started.md) | Installing, first run, the window | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.6, v0.0.7 and v0.0.8 |
| [the-app-window.md](the-app-window.md) | The top bar as the title bar, window buttons, tooltips, scrollbars | ✅ Shipped in v0.0.2, updated in v0.0.3, v0.0.4, v0.0.7 and v0.0.8 |
| [browsing-and-filtering.md](browsing-and-filtering.md) | The Browse menu, filtering by several tags, counts, rescan | ✅ Shipped in v0.0.2, updated in v0.0.3, v0.0.4, v0.0.7 and v0.0.8 |
| [importing-pdfs.md](importing-pdfs.md) | Adding PDFs to your library | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.7 and v0.0.8 |
| [tags.md](tags.md) | Organizing documents into tags | ✅ Shipped in v0.0.1 (as Categories), renamed in v0.0.8 |
| [searching.md](searching.md) | Finding documents | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3 and v0.0.8 |
| [metadata-editing.md](metadata-editing.md) | Titles, authors, notes | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4 and v0.0.8 |
| [favorites.md](favorites.md) | Starring documents you use often | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4 and v0.0.8 |
| [sorting-and-views.md](sorting-and-views.md) | Ordering, list and grid views, columns | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.7 and v0.0.8 |
| [covers.md](covers.md) | Cover thumbnails in the list | ✅ Shipped in v0.0.1, updated in v0.0.3, v0.0.4, v0.0.5, v0.0.7 and v0.0.8 |
| [opening-and-deleting.md](opening-and-deleting.md) | Opening a PDF, removing documents | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.6 and v0.0.8 |
| [reading-pdfs.md](reading-pdfs.md) | Reading documents inside PDF Keeper: the reading window, view modes, navigation, contents, zoom | ✅ Shipped in v0.0.6, updated in v0.0.7 and v0.0.8 |
| [missing-files-relinking.md](missing-files-relinking.md) | When a file moved or disappeared | ✅ Shipped in v0.0.1, updated in v0.0.3, v0.0.4, v0.0.7 and v0.0.8 |
| [status-feedback.md](status-feedback.md) | Library counts and action results | ✅ Shipped in v0.0.1, updated in v0.0.3, v0.0.4, v0.0.7 and v0.0.8 |
| [keyboard-shortcuts.md](keyboard-shortcuts.md) | Keyboard shortcuts | ✅ Shipped in v0.0.1, updated in v0.0.2, v0.0.3, v0.0.4, v0.0.6, v0.0.7 and v0.0.8 |
| [selecting-documents.md](selecting-documents.md) | Clicking, selecting, and working with a selection | ✅ Shipped in v0.0.3, updated in v0.0.4, v0.0.7 and v0.0.8 |
| [settings-and-appearance.md](settings-and-appearance.md) | Light or dark, the settings window, About | ✅ Shipped in v0.0.3, updated in v0.0.4, v0.0.6 and v0.0.7 |
| [reading-collection.md](reading-collection.md) | Keeping the documents you're reading in one collection | ✅ Shipped in v0.0.8 |
| [password-protected-pdfs.md](password-protected-pdfs.md) | Opening PDFs that need a password | ✅ Shipped in v0.0.8 |
| [renaming-a-documents-file.md](renaming-a-documents-file.md) | Changing a document's file name from inside the app | ✅ Shipped in v0.0.8 |
| [finding-a-documents-file.md](finding-a-documents-file.md) | Opening the folder that contains a document's file | ✅ Shipped in v0.0.8 |

## Maintenance

- Every release updates these pages: new capabilities get a page, changed behavior gets corrected text, removed capabilities stay marked *Removed in v…*.
- Pages never mention internal requirement numbers, technologies, or settings a user never sees.
