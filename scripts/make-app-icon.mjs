#!/usr/bin/env node
// Generates src-tauri/app-icon.png (1024×1024) — the source `tauri icon`
// consumes for all platform icons. Pure Node (zlib PNG writer), supersampled
// shapes; the glyph is the app's own: a document page with a folded corner
// on the accent color. Run once: `node scripts/make-app-icon.mjs`.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const SUPER = 4; // samples per axis → 4×4 supersampling for clean edges

// Colors (accent and paper per §5.3.7 ramps).
const ACCENT = [59, 124, 255];
const ACCENT_DEEP = [47, 106, 224];
const PAGE = [255, 255, 255];
const FOLD = [216, 230, 255];

const roundedRectAlpha = (x, y, x0, y0, x1, y1, r) => {
  // Signed-distance coverage of a rounded rectangle: distance to the
  // inset core minus the corner radius, mapped through a 1px AA band.
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(0, Math.min(1, 0.5 - (d - r)));
};

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Page with a cut top-right corner and the fold triangle.
const PAGE_POLY = [
  [300, 220],
  [648, 220],
  [724, 296],
  [724, 804],
  [300, 804],
];
const FOLD_POLY = [
  [648, 220],
  [648, 296],
  [724, 296],
];
// Three content lines (meta text on the page).
const LINES = [
  [360, 380, 664, 404],
  [360, 460, 604, 484],
  [360, 540, 544, 564],
];

const sample = (x, y) => {
  // Background rounded square with a subtle vertical gradient.
  const bg = roundedRectAlpha(x, y, 40, 40, 984, 984, 190);
  if (bg <= 0) return [0, 0, 0, 0];
  const t = y / SIZE;
  let color = [
    ACCENT[0] + (ACCENT_DEEP[0] - ACCENT[0]) * t,
    ACCENT[1] + (ACCENT_DEEP[1] - ACCENT[1]) * t,
    ACCENT[2] + (ACCENT_DEEP[2] - ACCENT[2]) * t,
  ];
  const page = inPoly(x, y, PAGE_POLY);
  if (page) color = PAGE;
  if (inPoly(x, y, FOLD_POLY)) color = FOLD;
  if (page) {
    for (const [x0, y0, x1, y1] of LINES) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) color = [202, 212, 228];
    }
  }
  return [...color.map((c) => Math.round(c)), Math.round(bg * 255)];
};

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
let o = 0;
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SUPER; sy++) {
      for (let sx = 0; sx < SUPER; sx++) {
        const [cr, cg, cb, ca] = sample(x + (sx + 0.5) / SUPER, y + (sy + 0.5) / SUPER);
        r += cr; g += cg; b += cb; a += ca;
      }
    }
    const n = SUPER * SUPER;
    raw[o++] = r / n;
    raw[o++] = g / n;
    raw[o++] = b / n;
    raw[o++] = a / n;
  }
}

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "app-icon.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
