// AC-43 (D11) + AC-71 (UI-32) + AC-82 (UI-35) + AC-97 (UI-38): the
// permanent contrast guard. WCAG relative-luminance ratios are computed from
// the values actually written in design-tokens.css — every text-role use
// clears 4.5:1 against the exact surface or tinted ground it renders on
// (tints composited over the surface under their alpha; a text token
// carrying alpha is composited over its ground the way the engine paints
// it). A brighter value added later fails the suite, which is the point
// (DR-120). The pair set runs against BOTH ramps: the dark set is the AC-71
// measurement behind the DR-145 substitutions, the light set the AC-82
// measurement behind the §3.7 substitutions and the DR-198 danger-text
// rendering rule (danger text carries the hover value on every ground it
// appears on; DR-220 extends it to the warning flag on the selection
// ground). AC-97 adds the selection-ground pairs on `--selection-tint` and
// the CIE76 ΔE ≥ 10 separation of the selection ground from both hover
// grounds.
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

type Pair = { role: string; fg: string; ground: Rgb };

function textPairs(ramp: Map<string, Rgb>): Pair[] {
  const token = (name: string): Rgb => {
    const color = ramp.get(name);
    if (!color) throw new Error(`token --${name} missing from the ramp`);
    return color;
  };
  const surface0 = token("surface-0");
  const surface1 = token("surface-1");
  const surface2 = token("surface-2");
  // One entry per text-role usage in the shipped components (the grounds are
  // what those rules actually render on; §3.12, DR-145). Graphics/fill/border
  // roles keep the base values and clear the 3:1 non-text bar (WCAG 1.4.11) —
  // they are not text pairs and are not listed here.
  return [
    { role: "primary text on surface-0 (library canvas)", fg: "text-primary", ground: surface0 },
    { role: "primary text on surface-1 (menu items, dialog text)", fg: "text-primary", ground: surface1 },
    { role: "primary text on surface-2 (control/icon/close/star hover labels)", fg: "text-primary", ground: surface2 },
    { role: "secondary text on surface-0", fg: "text-secondary", ground: surface0 },
    { role: "secondary text on surface-1 (filenames, dialog wording)", fg: "text-secondary", ground: surface1 },
    { role: "secondary text on surface-2 (hovered-card meta line)", fg: "text-secondary", ground: surface2 },
    { role: "primary text on the selection tint (title on a selected row/card)", fg: "text-primary", ground: overTint(token("selection-tint"), surface0) },
    { role: "secondary text on the selection tint (filename on a selected row)", fg: "text-secondary", ground: overTint(token("selection-tint"), surface0) },
    { role: "secondary text on the menu hover tint (surface-1 under the alpha)", fg: "text-secondary", ground: overTint(token("accent-quiet"), surface1) },
    { role: "accent text on surface-1 (active menu item, unhovered)", fg: "accent", ground: surface1 },
    {
      role: "active picker chip / pressed control label on its own accent tint (surface-1 under the alpha, D11)",
      fg: "accent-hover",
      ground: overTint(token("accent-quiet"), surface1),
    },
    {
      role: "active category chip on a hovered row (accent tint over surface-2)",
      fg: "accent-hover",
      ground: overTint(token("accent-quiet"), surface2),
    },
    {
      role: "bulk count on its own bar tint (surface-0 under the alpha, D11)",
      fg: "accent-hover",
      ground: overTint(token("accent-quiet"), surface0),
    },
    { role: "label on the accent fill (primary buttons)", fg: "text-on-accent", ground: token("accent") },
    { role: "label on the accent-hover fill (primary button hover)", fg: "text-on-accent", ground: token("accent-hover") },
    { role: "warning text on surface-0 (status-bar wording)", fg: "warning", ground: surface0 },
    { role: "warning text on surface-1 (missing-row label on a hovered row, card badge ground)", fg: "warning", ground: surface1 },
    {
      role: "missing-file warning flag on the selection tint takes the hover value (surface-0 under the alpha, DR-220)",
      fg: "warning-hover",
      ground: overTint(token("selection-tint"), surface0),
    },
    {
      role: "card badge text on its own warning tint (surface-1 under the alpha)",
      fg: "warning-hover",
      ground: overTint(token("warning-quiet"), surface1),
    },
    // §3.7/DR-198: every danger-text use in the components renders the hover
    // value — its grounds are surface-1, surface-2 or the selection tint,
    // where the base value measures 3.65–4.14:1. In the dark ramp the two
    // values are equal (DR-145), so the pairs are the same measurement there.
    { role: "danger text on surface-0 (row/card action icons under keyboard focus)", fg: "danger-hover", ground: surface0 },
    { role: "danger text on surface-1 (danger menu items, dialog controls, inline errors)", fg: "danger-hover", ground: surface1 },
    { role: "danger text on surface-2 (danger icon buttons on a hovered card)", fg: "danger-hover", ground: surface2 },
    { role: "danger text on the selection tint (surface-0 under the alpha)", fg: "danger-hover", ground: overTint(token("selection-tint"), surface0) },
    {
      role: "danger control hover text on its own tint (surface-0 under the alpha)",
      fg: "danger-hover",
      ground: overTint(token("danger-quiet"), surface0),
    },
    {
      role: "danger control hover text on its own tint (surface-1 under the alpha — dialog buttons)",
      fg: "danger-hover",
      ground: overTint(token("danger-quiet"), surface1),
    },
    { role: "label on the danger fill (window-close hover)", fg: "text-on-accent", ground: token("danger") },
  ];
}

// The tertiary text hierarchy (DR-139). DR-145 item 5 recorded the old light
// ramp's tertiary as below the bar and deferred the finding; UI-35's re-authored
// values (#59543e: 4.7–7.3 on every ground, §3.7) resolve it, so the pairs
// run against both ramps (DR-198 item 4).
function tertiaryPairs(ramp: Map<string, Rgb>): Pair[] {
  const token = (name: string): Rgb => {
    const color = ramp.get(name);
    if (!color) throw new Error(`token --${name} missing from the ramp`);
    return color;
  };
  const surface0 = token("surface-0");
  const surface1 = token("surface-1");
  const surface2 = token("surface-2");
  return [
    { role: "tertiary text on surface-0 (status bar, figure columns)", fg: "text-tertiary", ground: surface0 },
    { role: "tertiary text on surface-1 (hovered-row figures, dialog path lines)", fg: "text-tertiary", ground: surface1 },
    { role: "tertiary text on surface-2 (hovered-card meta/size lines)", fg: "text-tertiary", ground: surface2 },
    { role: "tertiary text on the selection tint (surface-0 under the alpha — selected-row figures)", fg: "text-tertiary", ground: overTint(token("selection-tint"), surface0) },
    { role: "tertiary text on the menu hover tint (surface-1 under the alpha)", fg: "text-tertiary", ground: overTint(token("accent-quiet"), surface1) },
  ];
}

// A text token carrying alpha is composited over its ground before the
// ratio is taken — the guard measures what the engine actually paints.
function effectiveColor(fg: Rgb, ground: Rgb): Rgb {
  if (fg.a >= 1) return fg;
  return {
    r: Math.round(fg.r * fg.a + ground.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + ground.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + ground.b * (1 - fg.a)),
    a: 1,
  };
}

// CIE76 ΔE over D65 Lab (AC-97, DR-220): the perceptual distance between
// two grounds — the bar that keeps a selected item distinguishable from a
// hovered one.
function labOf(color: Rgb): { L: number; a: number; b: number } {
  const r = channel(color.r);
  const g = channel(color.g);
  const b = channel(color.b);
  let x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  let y = 0.2126729 * r + 0.7151534 * g + 0.0721758 * b;
  let z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

function dE76(a: Rgb, b: Rgb): number {
  const l1 = labOf(a);
  const l2 = labOf(b);
  return Math.hypot(l1.L - l2.L, l1.a - l2.a, l1.b - l2.b);
}

for (const [rampName, selector] of [
  ["light ramp", ":root {"],
  ["dark ramp", ':root[data-theme="dark"] {'],
] as const) {
  describe(`${rampName}: text-role contrast (AC-43/AC-71/AC-82)`, () => {
    const ramp = rampOf(selector);
    const pairs = [...textPairs(ramp), ...tertiaryPairs(ramp)];
    for (const pair of pairs) {
      test(`${pair.role} clears 4.5:1`, () => {
        const ratio = contrast(effectiveColor(ramp.get(pair.fg)!, pair.ground), pair.ground);
        expect(ratio, `${rampName} — ${pair.role}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      });
    }
  });

  // AC-97 (UI-38, DR-220): the selection ground must read as "marked", not
  // as a hover — the composited selection ground sits measurably apart from
  // both hover grounds (CIE76 ΔE ≥ 10).
  describe(`${rampName}: selection ground separated from the hover grounds (AC-97)`, () => {
    const ramp = rampOf(selector);
    const selection = overTint(ramp.get("selection-tint")!, ramp.get("surface-0")!);
    test("apart from the row-hover ground (surface-1)", () => {
      const distance = dE76(selection, ramp.get("surface-1")!);
      expect(distance, `ΔE ${distance.toFixed(1)}`).toBeGreaterThanOrEqual(10);
    });
    test("apart from the card-hover ground (surface-2)", () => {
      const distance = dE76(selection, ramp.get("surface-2")!);
      expect(distance, `ΔE ${distance.toFixed(1)}`).toBeGreaterThanOrEqual(10);
    });
  });
}

// AC-70 (source half): every token in the dark block equals the §3.6 mapping
// or its recorded Decision-Log substitution (DR-145), as declared. The
// comparison is bidirectional — a token added to or dropped from the block
// fails the suite, which is what keeps the mapping the only authority.
describe('dark ramp: §3.6 mapping as declared (AC-70)', () => {
  const EXPECTED: Record<string, string> = {
    "surface-0": "#282a36", // §3.6 Background
    "surface-1": "#343746", // §3.6 Background Light
    "surface-2": "#424450", // §3.6 Background Lighter
    "surface-3": "#44475a", // §3.6 Selection
    "border-hairline": "#343746", // §3.6 Background Light
    "border-strong": "#44475a", // §3.6 Selection
    "text-primary": "#f8f8f2", // §3.6 Foreground
    "text-secondary": "rgba(248, 248, 242, 0.72)", // §3.6 / DR-139 (72 %; DR-145 item 2 keeps it)
    "text-tertiary": "rgba(248, 248, 242, 0.65)", // DR-145 item 2 (55 % measured 4.01/3.82)
    "accent": "#bd93f9", // §3.6 Purple
    "accent-hover": "#d6acff", // §3.6 ANSI BrightBlue
    "accent-quiet": "rgba(189, 147, 249, 0.08)", // DR-145 item 3 (16 % measured 4.02/3.71)
    "selection-tint": "rgba(189, 147, 249, 0.20)", // §3.17/DR-220 (the drafted 16 % measured ΔE 8.5 vs the row-hover ground; 20 % measures 11.6, every text role ≥ 4.9)
    "text-on-accent": "#282a36", // §3.6 Background
    "warning": "#ffb86c", // §3.6 Orange
    "warning-hover": "#ffb86c", // hover role resolves to the base (the dark tint grounds clear 4.5:1 at base; recorded in the block's comment)
    "warning-quiet": "rgba(255, 184, 108, 0.16)", // §3.6 Orange at the shipped quiet alpha (unchanged mechanism)
    "danger": "#ff92df", // DR-145 item 1 (no red-family value clears)
    "danger-hover": "#ff92df", // DR-145 item 1
    "danger-quiet": "rgba(255, 146, 223, 0.12)", // DR-145 item 1 (16 % measured 4.32)
    "success": "#50fa7b", // §3.6 Green
    "shadow-overlay": "0 8px 24px rgba(0, 0, 0, 0.45)", // §3.6: unchanged (not a palette role)
    "scrollbar-thumb": "#44475a", // §3.6 Selection
    "scrollbar-track": "transparent", // unchanged (not a palette role)
  };
  const declared = new Map<string, string>();
  for (const match of blockOf(':root[data-theme="dark"] {').matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    declared.set(match[1], match[2].trim().toLowerCase());
  }
  test("the declared token set is exactly the mapped one", () => {
    expect([...declared.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });
  for (const [token, value] of Object.entries(EXPECTED)) {
    test(`--${token} equals its mapped value`, () => {
      expect(declared.get(token), `--${token}`).toBe(value.toLowerCase());
    });
  }
});
