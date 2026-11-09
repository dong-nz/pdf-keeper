# Reading PDFs

> **Status: ✅ Shipped in v0.0.6, updated in v0.0.7** — verified by running the app.

PDF Keeper now opens documents **inside itself**. Double-click a document (or press `Enter` on a focused row, or choose **Open** in its right-click menu) and the document opens in its own reading window — no other application needs to start.

## The reading window

Each document you open gets its own window, named after the document. It opens at a comfortable default size and you can resize it, minimize it, or move it like any other window. Opening the same document again brings its existing window to the front instead of opening a second copy.

The reading window holds nothing but the document: no top bar, no menus, no status bar. Your library window stays fully usable while you read — you can keep browsing, searching, or organizing with the document open.

Across the top of the window is a slim control strip:

- **Page navigation** — previous / next buttons, and a `current / total` page field: type a page number there and press Enter to jump straight to it.
- **Zoom** — *Fit width* (the default: the page fills the window's width), fixed levels **50 / 75 / 100 / 125 / 150 / 200 / 300 %**, and **− / +** buttons that step between them.

The keyboard works too: `PgUp` / `PgDn` move a page, `Home` and `End` jump to the first and last page.

Pages form one continuous vertical column — scroll to read. When you change zoom, the page you were looking at stays where it was.

Closing the reading window (its window button, or `Esc`) leaves your library exactly as it was; the document's temporary preview data is cleaned up, and other open reading windows are untouched.

## Opening with another application

Opening a document with your system's PDF application is still there — it just moved to the menu: right-click a document and choose **Open in external viewer**. The first menu item, **Open**, is the built-in reader.

## When a document can't be read

- If the file is missing, nothing opens silently: a message appears offering **Relink** ([missing-files-relinking.md](missing-files-relinking.md)).
- If the file exists but can't be displayed as a PDF, the reading window says so and offers **Open in external viewer** anyway, so another application can try.

> **What reading does not include yet.** You can view, zoom and navigate — but not select or search text inside a document, and the reader does not remember where you stopped: every document opens at the first page. There are no tabs inside one window: each document gets its own window. These are candidates for later releases.

> **Verified behavior.** Opening a document shows its first page within well under a second, and page jumps and zoom changes are shown within a few tenths of a second — including in documents with 1 000 pages. Everything above was tested by running the application.

> **Amendment (2026-11-09, v0.0.7): the reading window was reworked.** All of this was verified by running the app; everything not mentioned below works exactly as described above.
>
> - **The control strip moved to the bottom of the window.** The top of the window now shows only the document's name — in full, shortened with "…" only when it genuinely doesn't fit. When a document can't be displayed as a PDF, the reading window shows its message and no control strip at all.
> - **View modes.** The strip carries a new view control with three modes: **Single page** — one page at a time, centered in the window; scrolling past the top or bottom edge turns exactly one page; **Continuous** — the vertical column described above (this is the default); **Facing** — two consecutive pages side by side, moving pair by pair. The choice applies to that reading window only and is not remembered: every newly opened window starts in Continuous.
> - **Pages are centered horizontally** in all three modes.
> - **Zoom now works against the page's real size.** The zoom control is one select offering **Fit width** (still the default), **Fit page**, **Actual size**, and fixed levels **50 / 75 / 100 / 125 / 150 / 200 / 300 %** — those percentages now mean the page's own size, so *Actual size* really is 100 %. `Ctrl` + `+` / `Ctrl` + `−` step through the levels; `Ctrl+0` / `Ctrl+1` / `Ctrl+2` jump to Fit width / Fit page / Actual size. Changing zoom keeps the page you were looking at in place, as before.
> - **Table of contents.** If a PDF has an outline (bookmarks), the strip shows a **Table of contents** control — the first control in the strip. It opens a panel: a fixed bar across its top carries one expand/collapse-all toggle (an icon button; hovering it names the action it's about to perform), and the contents scroll independently below it — the bar stays visible while you scroll. The panel opens collapsed to the outline's top level; expand it section by section with the little arrows, or all at once with the toggle. Clicking an entry jumps to that place in the document. `Esc` closes the panel first, and only then the window. Documents without an outline show no such control.
> - **More keys.** In a reading window: `←` / `→` navigate exactly like the strip's buttons (in Facing mode they move by a pair); `↑` / `↓` scroll like one notch of the wheel — at an edge in Single-page mode, one press turns exactly one page. `PgUp` / `PgDn`, `Home` / `End`, the page field and `Esc` are unchanged. While you're typing in the page field, or while the contents panel or a menu is open, these keys belong to that thing and don't move the document.
> - **A theme change reaches open reading windows.** Pick Light, Dark or Auto in the Settings menu and already-open reading windows change with it, immediately ([settings-and-appearance.md](settings-and-appearance.md)).
> - **Pages arrive faster.** The image-writing step for reading pages was retuned — measured on the test machine, the work the app spends on a large page nearly halved (332 ms → 207 ms for a full-size page), and the whole cold-scroll path now runs under a budget the verification suite enforces: no more than 0.35 s of app work per page served when scrolling a 192-page document from its very first (cold) page; a warm, already-drawn scroll does no serving work at all. Nothing about the documents changes — only how quickly they arrive.
>
> The "What reading does not include yet" note above still stands: text selection and search inside a document, and remembering where you stopped, are not in this version either.
