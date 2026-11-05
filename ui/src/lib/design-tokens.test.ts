// AC-43 (D11): the permanent contrast guard. WCAG relative-luminance ratios
// are computed from the values actually written in design-tokens.css — every
// text-role use of accent, warning and danger clears 4.5:1 against the exact
// surface or tinted ground it renders on (tints composited over the surface
// under their alpha); the dark ramp's text roles re-check at the same bar.
// A brighter value added later fails the suite, which is the point (DR-120).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

type Rgb = { r: number; g: number; b: number; a: number };

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "design-tokens.css"),
  "utf8",
);

function blockOf(selector: string): string {
  const at = source.indexOf(selector);
  if (at < 0) throw new Error(`token block "${selector}" not found`);
  const open = source.indexOf("{", at);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function rampOf(selector: string): Map<string, Rgb> {
  const ramp = new Map<string, Rgb>();
  for (const match of blockOf(selector).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, raw] = match;
    const value = raw.trim();
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const digits = hex[1];
      ramp.set(name, {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16),
        a: 1,
      });
      continue;
    }
    const rgba = value.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
    if (rgba) {
      ramp.set(name, {
        r: Number(rgba[1]),
        g: Number(rgba[2]),
        b: Number(rgba[3]),
        a: Number(rgba[4]),
      });
    }
  }
  return ramp;
}

function channel(unit: number): number {
  const s = unit / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The tint ground is the ramp color composited over the surface beneath it.
function overTint(tint: Rgb, surface: Rgb): Rgb {
  return {
    r: Math.round(tint.r * tint.a + surface.r * (1 - tint.a)),
    g: Math.round(tint.g * tint.a + surface.g * (1 - tint.a)),
    b: Math.round(tint.b * tint.a + surface.b * (1 - tint.a)),
    a: 1,
  };
}

// One entry per text-role usage in the shipped components (the grounds are
// what those rules actually render on; §3.12). Graphics/fill/border roles
// keep the base values and clear the 3:1 non-text bar (WCAG 1.4.11) — they
// are not text pairs and are not listed here.
function textPairs(ramp: Map<string, Rgb>) {
  const token = (name: string): Rgb => {
    const color = ramp.get(name);
    if (!color) throw new Error(`token --${name} missing from the ramp`);
    return color;
  };
  const surface0 = token("surface-0");
  const surface1 = token("surface-1");
  const surface2 = token("surface-2");
  return [
    { role: "accent text on surface-0 (aria-pressed toolbar controls)", fg: "accent", ground: surface0 },
    { role: "accent text on surface-1 (active menu items, bulk count)", fg: "accent", ground: surface1 },
    { role: "label on the accent fill (primary buttons)", fg: "text-on-accent", ground: token("accent") },
    {
      role: "active picker text on its own accent tint (surface-1 under the alpha)",
      fg: "accent-hover",
      ground: overTint(token("accent-quiet"), surface1),
    },
    { role: "warning text on surface-0 (status-bar wording)", fg: "warning", ground: surface0 },
    { role: "warning text on surface-1 (missing-row label on a hovered row)", fg: "warning", ground: surface1 },
    {
      role: "card badge text on its own warning tint (surface-1 under the alpha)",
      fg: "warning-hover",
      ground: overTint(token("warning-quiet"), surface1),
    },
    { role: "danger text on surface-0 (danger controls)", fg: "danger", ground: surface0 },
    { role: "danger text on surface-1 (danger menu items, inline errors)", fg: "danger", ground: surface1 },
    { role: "danger text on surface-2 (danger icon buttons on a hovered card)", fg: "danger", ground: surface2 },
    {
      role: "danger control hover text on its own tint (surface-0 under the alpha)",
      fg: "danger-hover",
      ground: overTint(token("danger-quiet"), surface0),
    },
    { role: "label on the danger fill (window-close hover)", fg: "text-on-accent", ground: token("danger") },
  ];
}

for (const [rampName, selector] of [
  ["light ramp", ":root {"],
  ["dark ramp", ':root[data-theme="dark"] {'],
] as const) {
  describe(`${rampName}: text-role contrast (AC-43)`, () => {
    const ramp = rampOf(selector);
    for (const pair of textPairs(ramp)) {
      test(`${pair.role} clears 4.5:1`, () => {
        const ratio = contrast(ramp.get(pair.fg)!, pair.ground);
        expect(ratio, `${rampName} — ${pair.role}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    }
  });
}
