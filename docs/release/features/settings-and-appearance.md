# Settings and appearance

> **Status: ✅ Shipped in v0.0.3, updated in v0.0.4** — verified by running the app, including what survives a restart.

At the right end of the top bar, just left of the window buttons, is the **Settings** button. It opens a small menu with everything that changes how the application looks and where to find out what it is.

## Light or dark

The menu's first item shows the appearance you are currently using. Opening it gives you three choices:

- **System** (the starting point) — the application follows your computer's light/dark setting, including while you change it.
- **Light** — the application turns light, whatever your computer is set to.
- **Dark** — the application turns dark, whatever your computer is set to.

The change happens immediately, in every part of the window. Whichever you pick is remembered and is there again the next time you open PDF Keeper. Choose *System* to hand the decision back to your computer.

## The Settings dialog

The menu's second item, **Settings…**, opens a window with two sections:

- **Appearance** — the same light/dark choice, plus the list/grid switch and the number of columns in the grid view. These are the very same settings the View menu changes: change them in either place and the other one shows it at once.
- **Library** — how many documents you have, how many are starred, how many files are missing, and the application's name and version.

The window closes with `Esc` or its close button.

## About PDF Keeper

The menu's last item, **About PDF Keeper…**, opens the window that shows the application's name and the exact version you are running — useful when reporting a problem. It closes with `Esc` or its close button.

> **What this release's settings do not include.** The theme choice is the only new setting; the Settings dialog holds no language choice (the app is English-only today) and the Library section shows counts, the name and the version — not the folder where your index is stored. The list/grid choice and the number of columns are in the dialog because they are the same settings the View menu changes, not new ones.
>
> Choosing Light or Dark also changes the parts of the window the operating system draws — scrollbars, form fields and scroll areas follow the choice you made, not your computer's setting.

> **Amendment (2026-11-05, v0.0.4):** five corrections, all verified by running the app, including after a restart.
>
> - **The Settings menu and dialog items are named without "…"** — *Settings* and *About PDF Keeper* (see the label rule in [browsing-and-filtering.md](browsing-and-filtering.md)).
> - **The Library section now shows where your library is kept.** A *Location* row gives the exact folder holding your index and cover thumbnails. It's shown, not changed: the text is selectable so you can copy it, there's no button to open that folder, and moving the library to a different folder is not a setting. The earlier note above said the folder was not shown — that has changed.
> - **The dialog's section headings look like ordinary text.** *Appearance* and *Library* were set in all-caps with wide letter spacing; they now read as normal sentence-case headings, separated from their content by a thin line.
> - **Some text colors were made easier to read.** In light mode, warning, error and accent text — the missing-file marker, failed-action messages, active menu items, the starred star, the selection count — sat below a comfortable reading contrast. Those colors were replaced with darker variants that meet 4.5:1 against every surface they appear on. Which elements are colored did not change; the colors themselves did. Dark mode was already comfortable and is unchanged.
> - **The dialog's internal spacing is even.** Sections and rows inside the Settings and About windows now sit on one consistent spacing rhythm; nothing you could do before has moved to a different place.
>
> The theme choices, the View settings shared with the View menu, the Library counts, the About window and everything closing with `Esc` are unchanged.

> **Amendment (2026-11-07, v0.0.6):** the **dark appearance has been re-drawn with a new palette** — the well-known Dracula color scheme. What you'll notice: the backgrounds are deeper and more even (one calm dark purple-grey family instead of the old blue-blacks), text is a brighter warm off-white, and the accent colors — active menu items, the starred star, warnings and other status colors — take the palette's pink, purple, green, yellow and cyan. Selected rows and hovered items now sit on grounds that are clearly distinct from the surface they're on. Scrollbars follow the same family. The choices themselves (System / Light / Dark), how they're remembered, and everything else on this page are unchanged — and **Light mode is exactly as it was**. Every text color was re-checked in the running app against the exact surface it appears on, so nothing became harder to read.
