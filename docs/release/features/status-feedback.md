# Status and feedback

> **Status: ✅ Shipped in v0.0.1** — verified by running the app.

## The status bar

The bar along the bottom of the window always shows three numbers about your library: total documents, how many are favorited, and how many are missing (their files no longer exist where the app expects them — see [missing-files-relinking.md](missing-files-relinking.md)). Clicking a number filters the list to it. While a large operation runs, the bar shows its progress; **Rescan** is unavailable until the current work is finished, so two heavy actions can never fight over your library.

## Messages about what you did

Actions that process many documents report their result as a brief message:

- **Import** — how many documents were added and how many were skipped as already in the library.
- **Rescan** — how many files were found missing or restored.
- **Opening a missing document** — an error message that offers *Relink…* so you can point the entry at the file's new location.

These messages appear near your work and disappear on their own; the status bar numbers always stay current. A failed action's message keeps an action button where retrying makes sense (for example, after a file deletion failed).
