// All user-facing formatting goes through Intl (RULES R8.1) — no
// hand-rolled byte/date/number strings anywhere else.

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

// UI-36 (§3.9, rule revised by DR-208): a size displays in the unit its
// magnitude calls for — bytes below 1 000, kilobytes with at most one
// fraction digit up to the point where one digit would render `1 000 kB`
// (999 950), megabytes from there (one fraction digit below 100 MB, none
// from 100 MB up). All on the same 1000-base (Intl's byte-unit
// convention). The DTO, the sort whitelist and every byte value in the
// backend stay as they are — display only.
const bytesUnit = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "byte",
  unitDisplay: "short",
});
const kilobytes = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "kilobyte",
  unitDisplay: "short",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const megabytesByBand = [1, 0].map((digits) =>
  new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "megabyte",
    unitDisplay: "short",
    // §3.9: "1 fraction digit below 100 000 000" is a maximum, not padding
    // — `999_950` renders `1 MB`, `2_400_000` renders `2.4 MB`.
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }),
);

export function formatBytes(n: number): string {
  if (n < 1_000) return bytesUnit.format(n); // "512 B"; zero renders "0 B" (§3.9 guard)
  if (n < 999_950) return kilobytes.format(n / 1_000); // "2 kB", "12.5 kB", "999.9 kB"
  const mb = n / 1_000_000;
  return megabytesByBand[mb < 100 ? 0 : 1].format(mb); // "1 MB", "2.4 MB", "125 MB"
}

export function formatDate(unixSeconds: number): string {
  return dates.format(new Date(unixSeconds * 1000));
}
