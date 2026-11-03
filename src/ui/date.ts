/** Commit date formatting (pure; the clock is a parameter). */

/**
 * - `short`: `2026-03-04` in lists and `2026-03-04 10:00` in the details (the default).
 * - `iso`: `2026-03-04 10:00` everywhere.
 * - `relative`: `há 3 dias`; the details add the exact time.
 */
export const DATE_STYLES = ['short', 'iso', 'relative'] as const;
export type DateStyle = (typeof DATE_STYLES)[number];

const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', {numeric: 'auto'});

// Seconds in each unit, largest first; a month is the average one (30.44 days).
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** "há 3 dias", "ontem", "agora" ... relative to `now`. */
export function relativeDate(iso: string, now: Date): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return iso;
  const seconds = (time - now.getTime()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      // Days and shorter are cut ("3 days ago" up to 4 days); months and years are rounded, as `git log --date=relative`
      // does, otherwise 90 days would read "2 months" and 2 years "last year".
      const rounded = unit === 'month' || unit === 'year' ? Math.round(seconds / size) : Math.trunc(seconds / size);
      return relativeFormat.format(rounded, unit);
    }
  }
  return relativeFormat.format(0, 'second');
}

/**
 * The date as shown to the user. `iso` is the author date as git prints it
 * (`2026-03-04T10:00:00+00:00`), kept in its own timezone like `git log`.
 * `detail` is true for the single-commit panels, which have room for the time.
 */
export function formatDate(iso: string, style: DateStyle, {now = new Date(), detail = false} = {}): string {
  const exact = iso.replace('T', ' ').slice(0, 16);
  switch (style) {
    case 'relative':
      return detail ? `${relativeDate(iso, now)} (${exact})` : relativeDate(iso, now);
    case 'iso':
      return exact;
    case 'short':
      return detail ? exact : iso.slice(0, 10);
  }
}
