# The app window

> **Status: ✅ Shipped in v0.0.2** — verified by running the app on Windows. macOS and Linux follow the same design but have not been tested on real hardware yet.

## No separate title bar
The system title bar is gone. The app's own top bar *is* the title bar:

- **Move the window:** drag any empty part of the top bar (not a button, not the search box, not a menu).
- **Minimize / Maximize / Restore / Close:** the three buttons at the right end of that bar. The middle button says *Maximize* in a normal window and *Restore* when the window is maximized.

Everything else about the window is unchanged: keyboard shortcuts, dialogs, and the rest of the app behave exactly as before.

## The app menu
At the right end of the toolbar, just left of the window buttons, is a small info-icon button — the **application menu**. Its one item is **About PDF Keeper…**, which opens a dialog showing the application's name and the exact version you are running. Useful when reporting a problem. It closes with Esc or its close button.

## Scrollbars follow your theme
Every scrollable area in the app — the document list, the grid, menus, dialogs, the notes field — now draws the same thin scrollbar in your theme's colors: light grey on a light background, dark grey on a dark one. Nothing shows the plain white system bar any more, and the app's controls (form fields, scroll areas) follow your system's light/dark setting.

## Keyboard
The menus (Browse, Sort, View, application menu) are reachable with Tab and open with Enter; Esc closes them. The window buttons are ordinary buttons in the toolbar, so Tab reaches them like any other control.
