// D20 (AC-116): WebView2's default context menu is on and Tauri exposes no
// switch for it, so the suppression lives here, at each window's root. The
// guard prevents only events nothing has already prevented: the app's own
// context menus (the rows', the cards' — the kit's triggers prevent their
// event) keep working, and everywhere else — toolbar, status bar, bulk bar,
// reader chrome, the document area, text fields included (OQ-51 closed as B)
// — no browser menu appears. The consequence accepted with that decision: the
// native edit menu is gone in text fields; editing keeps the keyboard
// shortcuts and the app's own controls.

export function guardContextMenu(event: MouseEvent): void {
  if (!event.defaultPrevented) event.preventDefault();
}
