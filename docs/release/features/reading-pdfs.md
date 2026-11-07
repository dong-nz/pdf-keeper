# Reading PDFs

> **Status: ✅ Shipped in v0.0.6** — verified by running the app.

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
