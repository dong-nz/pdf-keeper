// All user-facing formatting goes through Intl (RULES R8.1) — no
// hand-rolled byte/date/number strings anywhere else.

const bytes = new Intl.NumberFormat(undefined, { style: "unit", unit: "byte", unitDisplay: "short" });
const numbers = new Intl.NumberFormat();
const dates = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const plural = new Intl.PluralRules();

/** `count` in the user's locale. */
export function formatCount(n: number): string {
  return numbers.format(n);
}

/** Cardinal plural category for catalog-key selection (i18n §5.3.11). */
export function pluralKey(n: number): string {
  return plural.select(n);
}

export function formatBytes(n: number): string {
  return bytes.format(n);
}

export function formatDate(unixSeconds: number): string {
  return dates.format(new Date(unixSeconds * 1000));
}
