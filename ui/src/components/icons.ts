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
  keyboard: ["M2 4h20v16H2z", "M6 8h.01", "M10 8h.01", "M14 8h.01", "M18 8h.01", "M6 12h.01", "M10 12h.01", "M14 12h.01", "M18 12h.01", "M7 16h10"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M12 16v-4", "M12 8h.01"],
  // Window controls (UI-07) and the View menu's column stepper share these.
  minus: ["M5 12h14"],
  maximize: ["M5 5h14v14H5z"],
  restore: ["M8 8h12v12H8z", "M4 16V4h12"],
} as const;

export type IconName = keyof typeof ICONS;

/** Icons filled (not stroked) in their active state. */
export const FILLED: IconName[] = ["star-fill"];
