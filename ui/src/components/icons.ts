// ~22 inline SVG path sets (§5.3.7). Stroke-based 24×24 geometry rendered by
// Icon.svelte at 16/20px with stroke-width 1.6 and currentColor — no icon
// font, no sprite file, no network (NFR-03, R8.2).

export const ICONS = {
  search: ["M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14", "M21 21l-4.35-4.35"],
  import: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  folder: ["M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"],
  star: ["M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"],
  "star-fill": ["M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"],
  list: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  sort: ["M4 7h13", "M4 12h9", "M4 17h5", "M18 8l3 3-3 3"],
  "dots-vertical": ["M12 5h.01", "M12 12h.01", "M12 19h.01"],
  close: ["M18 6L6 18", "M6 6l12 12"],
  check: ["M20 6L9 17l-5-5"],
  trash: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M10 11v6", "M14 11v6"],
  "external-link": ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14L21 3"],
  relink: ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10", "M1 14l4.64 4.36A9 9 0 0 0 20.49 15"],
  tag: ["M20.59 13.41L12 22 2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82", "M7 7h.01"],
  "alert-triangle": ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0", "M12 9v4", "M12 17h.01"],
  rescan: ["M23 4v6h-6", "M1 20v-6h6", "M20.49 9A9 9 0 0 0 5.64 5.64L1 10", "M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"],
  "chevron-left": ["M15 18l-6-6 6-6"],
  "chevron-right": ["M9 18l6-6-6-6"],
  plus: ["M12 5v14", "M5 12h14"],
  filter: ["M22 3H2l8 9.46V19l4 2v-8.54z"],
  "pdf-glyph": ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  // v0.0.6 (UI-31): the in-app reading glyph for the context menu's Open —
  // the external-link glyph stays with "Open in external viewer".
  "book-open": ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"],
  keyboard: ["M2 4h20v16H2z", "M6 8h.01", "M10 8h.01", "M14 8h.01", "M18 8h.01", "M6 12h.01", "M10 12h.01", "M14 12h.01", "M18 12h.01", "M7 16h10"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M12 16v-4", "M12 8h.01"],
  // Window controls (UI-07) and the View menu's column stepper share these.
  minus: ["M5 12h14"],
  maximize: ["M5 5h14v14H5z"],
  restore: ["M8 8h12v12H8z", "M4 16V4h12"],
  // v0.0.3 controls (DR-102c): the Select-mode toggle (UI-18), the Settings
  // menu (UI-17) and the theme states its trigger displays.
  select: ["M4 4h16v16H4z", "M8.5 12.5l2.5 2.5 5-5.5"],
  settings: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 1v2", "M12 21v2", "M4.22 4.22l1.42 1.42", "M18.36 18.36l1.42 1.42", "M1 12h2", "M21 12h2", "M4.22 19.78l1.42-1.42", "M18.36 5.64l1.42-1.42"],
  moon: ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"],
  monitor: ["M2 4h20v12H2z", "M8 20h8", "M12 16v4"],
} as const;

export type IconName = keyof typeof ICONS;

/** Icons filled (not stroked) in their active state. */
export const FILLED: IconName[] = ["star-fill"];
