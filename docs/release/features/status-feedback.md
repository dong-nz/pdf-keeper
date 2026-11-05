# Status and feedback

> **Status: ✅ Shipped in v0.0.1, updated in v0.0.3 and v0.0.4** — verified by running the app.

## The status bar

The bar along the bottom of the window always shows three numbers about your library: total documents, how many are favorited, and how many are missing (their files no longer exist where the app expects them — see [missing-files-relinking.md](missing-files-relinking.md)). Clicking a number filters the list to it. While a large operation runs, the bar shows its progress; **Rescan** is unavailable until the current work is finished, so two heavy actions can never fight over your library.

## Messages about what you did

Actions that process many documents report their result as a brief message:

- **Import** — how many documents were added and how many were skipped as already in the library.
- **Rescan** — how many files were found missing or restored.
- **Opening a missing document** — an error message that offers *Relink…* so you can point the entry at the file's new location.

These messages appear near your work and disappear on their own; the status bar numbers always stay current. A failed action's message keeps an action button where retrying makes sense (for example, after a file deletion failed).

> **Amendment (2026-11-04, v0.0.3):** the bottom bar only says something when there is something to say. Normally it shows one quiet number: how many documents your library holds. It adds a **result count** only while you have a filter or a search active, a **progress bar** only while a job is running, and a **warning about missing files** only when files are actually missing. The three clickable numbers and the **Rescan** button are no longer there: the counts for all documents, favorites and missing files now sit next to those items in the **Browse** menu, and *Rescan files* is an item in the same menu, greyed out while a job runs ([browsing-and-filtering.md](browsing-and-filtering.md)). The numbers are still library-wide — they describe your whole library, never just what's on screen — and every message described above works exactly as before.

> **Amendment (2026-11-05, v0.0.4):** two corrections, verified by running the app during real import jobs.
>
> - **The progress bar moves smoothly.** Its fill used to jump from one step to the next with no motion between; it now slides as a job advances. Same position, same size, same meaning — only the motion is real now.
> - **The loading placeholders look like the real list.** While your library is loading at startup, the placeholder rows now have the exact shape of the rows that will replace them — cover space, title space, the right-hand space — instead of generic grey bars. Nothing loads faster or slower; the wait just tells the truth about what's coming.
>
> The bottom bar's conditional content, the counts, the result messages and their action buttons are unchanged.
