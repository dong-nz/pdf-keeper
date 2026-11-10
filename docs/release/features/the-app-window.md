# The app window

> **Status: ✅ Shipped in v0.0.2, updated in v0.0.3, v0.0.4, v0.0.7 and v0.0.8** — verified by running the app on Windows. macOS and Linux follow the same design but have not been tested on real hardware yet.

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

> **Amendment (2026-11-04, v0.0.3):** three changes, all verified by running the app.
>
> - **Dragging works now.** In v0.0.2 the top bar only moved the window when you happened to press on a bare strip of it — the gaps and padding — so in practice the window was hard to drag and double-click-to-maximize was almost unreachable. Now the whole bar drags: any part of it that isn't a control, including the padding around the controls, and a double-click on that empty space maximizes or restores. Pressing a control, the search box or a menu does exactly what it always did and never drags the window.
> - **The app menu is gone.** The info-icon button at the right end of the bar no longer exists; **About PDF Keeper…** moved into the new **Settings** menu, and the window it opens is the same one, showing the same name and version ([settings-and-appearance.md](settings-and-appearance.md)).
> - **Every control in the bar is an icon with no text.** Browse, Select, View, Settings, the import control inside the search box, and the window buttons all show a small label carrying their name when you hover them or reach them with Tab — so nothing in the bar is unlabelled. The one control whose state shows on the control itself is the **Select** button: when selection mode is on, the button looks pressed. Menus never put their state on the icon: what is active is marked inside the menu.
>
> The keyboard paragraph above is corrected in one respect: the menus you can reach today are **Browse, View and Settings** — the Sort menu is inside the View menu and the application menu no longer exists. The window buttons are still ordinary buttons in the same tab order.
>
> Scrollbars follow the same theme you pick in the Settings menu, not only your computer's setting ([settings-and-appearance.md](settings-and-appearance.md)).

> **Amendment (2026-11-05, v0.0.4):** **scrollbars no longer show arrow buttons.** On some systems the themed scrollbar came with little up/down arrow buttons at its ends; those buttons are gone everywhere, leaving the same thin bar in your theme's colors. Dragging the bar and scrolling by wheel work exactly as before. (On systems that never drew the buttons nothing looks different — the change removes the possibility of them, not something visible on every machine.)

> **Amendment (2026-11-09, v0.0.7):** two changes, verified by running the app.
>
> - **Documents no longer sit under the toolbar.** The list and the grid keep a clear 12 px band between the toolbar's bottom edge and the first row or card — the same breathing room the side margins added in v0.0.4 already give on the left and right.
> - **Every hover label is drawn by the app, on a proper ground.** All the small labels that appear when you hover or keyboard-focus a control — toolbar buttons, menu items, row and card buttons, a clipped title in the list or grid, a category's actions, the reader's controls, and the "last known location" label over a missing-file marker — now render in the app's own tooltip style: a floating label on the same solid, theme-colored surface the menus and dialogs use, with its hairline border and soft shadow. Earlier, some of these were plain system tooltips that could be hard to read against what they sat on, and some text that was cut off ("…") had no label at all — a clipped title now shows its full text on hover. The wording of these labels is unchanged (apart from the naming corrections in [missing-files-relinking.md](missing-files-relinking.md)), and the labels follow the appearance you chose. A label never makes the area it annotates suddenly scrollable.
>
> Dragging, the window buttons, the Settings menu, scrollbars and the keyboard paragraph above are unchanged.

> **Amendment (2026-11-10, v0.0.8): right-clicking the app no longer opens a web-browser menu** (verified in the running app). Right-click on the app's own surfaces — the document list or grid, empty space, a document row or card, the toolbar — and nothing opens: earlier, a right-click that didn't land on a document's own menu could bring up the underlying browser's *Back / Refresh / Save / Print / Inspect* menu, which belongs to no part of this application. Right-click **inside a text field** (the search box, a dialog's fields) still gives the ordinary editing menu — Cut / Copy / Paste — where editing is what you're doing. The document context menu itself is unchanged.
