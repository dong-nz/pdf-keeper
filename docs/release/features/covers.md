# Cover thumbnails

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.3 and v0.0.4** — verified by running the app.

Every document shows a cover: a thumbnail of its first page, in list rows and grid cards.

- Covers are generated when you import, in a background queue — the app stays responsive while working.
- They are regenerated when Rescan detects the file changed, or when a cover is missing.
- If a page can't be rendered, a generic PDF symbol is shown instead; the import still succeeds.
- Covers are stored in the app's own data folder and cleaned up automatically when you remove a document from the library.

Covers are display-only: opening a document still uses your system's PDF viewer ([opening-and-deleting.md](opening-and-deleting.md)).

> **Amendment (2026-11-04, v0.0.3):** covers got bigger along with the rows and cards. A list row's cover is now 45×64 (it grew with the taller 64 px row rather than keeping its old 34×48 size), and a grid card's cover scales with its card — cards are as wide as your window and column count allow, up to 320 px, so the cover grows with them ([sorting-and-views.md](sorting-and-views.md)). Nothing else changed: covers are still made in the background when you import, still regenerated when a file changes or a cover is missing, still replaced by a generic PDF symbol when a page can't be rendered, and still cleaned up when you remove the document.

> **Amendment (2026-11-05, v0.0.4):** two corrections, verified by running the app.
>
> - **Covers are sharper.** They were always stored at a fixed modest resolution, so a large card cover (or a cover on a high-resolution display) was an enlarged, soft image. Covers are now produced at a higher resolution — display sizes are unchanged, and covers stored by earlier versions are quietly replaced in the background, with nothing for you to do.
> - **Card covers stay inside their card.** With wide cards (a low column count in a wide window) the cover image could run past the card's right border. The cover now fills exactly the space the card gives it.
>
> Everything else on this page is unchanged — background generation, regeneration on change, the fallback symbol, and cleanup on removal.
