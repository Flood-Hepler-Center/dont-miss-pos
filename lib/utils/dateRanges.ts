/**
 * Date Range Utilities — Weekend-aware presets
 *
 * Built for "Don't Miss The Saturday" which operates primarily on Sat+Sun.
 * Provides preset ranges: current weekend, last weekend, last N weekends, etc.
 */

export type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Find the Saturday of the week for a given date.
 * If date is Sunday, returns the previous day (Saturday).
 * If date is Saturday, returns itself.
 * Otherwise returns this week's upcoming Saturday.
 */
function saturdayOfWeek(ref: Date): Date {
  const d = startOfDay(ref);
  const dow = d.getDay(); // 0 Sun, 6 Sat
  if (dow === 6) return d;
  if (dow === 0) {
    const sat = new Date(d);
    sat.setDate(d.getDate() - 1);
    return sat;
  }
  // Mon-Fri: upcoming Saturday
  const sat = new Date(d);
  sat.setDate(d.getDate() + (6 - dow));
  return sat;
}

/**
 * Format a date range as "Sat Mar 15 – Sun Mar 16, 2025".
 */
function formatWeekendLabel(sat: Date, sun: Date): string {
  const fmt = (d: Date, withYear = false) =>
    d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  const sameYear = sat.getFullYear() === sun.getFullYear();
  return `${fmt(sat)} – ${fmt(sun, sameYear)}`;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get the current weekend (Saturday + Sunday).
 * If today is Mon-Fri → upcoming Sat+Sun of this week.
 * If today is Sat-Sun → that weekend.
 */
export function getCurrentWeekend(now: Date = new Date()): DateRange {
  const sat = saturdayOfWeek(now);
  const sun = new Date(sat.getTime() + DAY);
  return {
    start: startOfDay(sat),
    end: endOfDay(sun),
    label: `Current Weekend · ${formatWeekendLabel(sat, sun)}`,
  };
}

/**
 * Get a weekend N weeks back from the current weekend.
 * offset 0 = current, 1 = last, 2 = two weekends ago, etc.
 */
export function getWeekendByOffset(offset: number, now: Date = new Date()): DateRange {
  const currentSat = saturdayOfWeek(now);
  const sat = new Date(currentSat);
  sat.setDate(currentSat.getDate() - offset * 7);
  const sun = new Date(sat.getTime() + DAY);
  const label =
    offset === 0
      ? `Current Weekend · ${formatWeekendLabel(sat, sun)}`
      : offset === 1
      ? `Last Weekend · ${formatWeekendLabel(sat, sun)}`
      : `${offset} Weekends Ago · ${formatWeekendLabel(sat, sun)}`;
  return {
    start: startOfDay(sat),
    end: endOfDay(sun),
    label,
  };
}

/**
 * Get a continuous range spanning the last N weekends
 * (from Saturday of the oldest weekend through Sunday of the current weekend).
 * NOTE: includes weekdays in between — the POS simply won't have data on those days.
 */
export function getLastNWeekendsRange(n: number, now: Date = new Date()): DateRange {
  const currentSat = saturdayOfWeek(now);
  const sun = new Date(currentSat.getTime() + DAY);
  const oldestSat = new Date(currentSat);
  oldestSat.setDate(currentSat.getDate() - (n - 1) * 7);
  return {
    start: startOfDay(oldestSat),
    end: endOfDay(sun),
    label: `Last ${n} Weekends · ${formatDayLabel(oldestSat)} – ${formatDayLabel(sun)}`,
  };
}

/**
 * Produce a list of the last N weekends as individual DateRanges
 * (useful for a dropdown selector).
 */
export function listRecentWeekends(n: number, now: Date = new Date()): DateRange[] {
  return Array.from({ length: n }, (_, i) => getWeekendByOffset(i, now));
}

/**
 * Build a custom range from ISO date strings (yyyy-mm-dd).
 * Returns null if inputs are invalid.
 */
export function buildCustomRange(startISO: string, endISO: string): DateRange | null {
  if (!startISO || !endISO) return null;
  const start = startOfDay(new Date(startISO));
  const end = endOfDay(new Date(endISO));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return null;
  return {
    start,
    end,
    label: `Custom · ${formatDayLabel(start)} – ${formatDayLabel(end)}`,
  };
}

/**
 * Check if a range includes today (used to toggle "LIVE" vs "HISTORICAL" indicator).
 */
export function rangeIncludesToday(range: DateRange, now: Date = new Date()): boolean {
  const today = startOfDay(now).getTime();
  return range.start.getTime() <= today && today <= range.end.getTime();
}
