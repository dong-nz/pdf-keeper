// `t(key, params)` + typed key union (spec §5.3.10). Count-dependent
// messages use `tp(key, n, params)`: the catalog carries `key.one` /
// `key.other` variants selected through Intl.PluralRules (RULES R8.1);
// numeric params are formatted with Intl in format.ts, never here.

import en from "./en";
import { formatCount, pluralKey } from "$lib/format";

export type Catalog = typeof en;
export type MsgKey = keyof Catalog;

/** The base of a `<base>.one` / `<base>.other` pair, derived from the
 *  catalog itself — a plural call site with no matching pair fails the
 *  compiler (R4.1). */
export type PluralBase = {
  [K in keyof Catalog]: K extends `${infer Base}.one` ? Base : never;
}[keyof Catalog];

export type MsgParams = Record<string, string | number>;

function interpolate(template: string, params?: MsgParams): string {
  if (!params) return template;
  let out = template;
  for (const [name, value] of Object.entries(params)) {
    out = out.replaceAll(`{${name}}`, String(value));
  }
  return out;
}

export function t(key: MsgKey, params?: MsgParams): string {
  return interpolate(en[key], params);
}

/** Plural variant selection: the catalog defines `<key>.one` and `<key>.other`. */
export function tp(key: PluralBase, count: number, params?: MsgParams): string {
  const tag = pluralKey(count) as "one" | "other";
  const variant = `${key}.${tag}` as MsgKey;
  // The `count` placeholder is interpolated through format.ts (R8.1): toasts
  // show the same grouping the status bar and bulk bar use.
  return interpolate(en[variant], { ...params, count: formatCount(count) });
}
