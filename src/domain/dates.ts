import type { Frequency, ISODate } from './types';

// We work with dates as plain "YYYY-MM-DD" strings and do arithmetic in UTC
// so time zones / daylight saving never shift a bill to the wrong day.

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Today's date in the user's local time zone, as ISO. */
export function today(): ISODate {
  const d = new Date();
  return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export function formatDate(s?: ISODate): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Add months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: ISODate, n: number, anchorDay?: number): ISODate {
  const d = parseISO(s);
  const day = anchorDay ?? d.getUTCDate();
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m0 = total % 12;
  return toISO(new Date(Date.UTC(y, m0, Math.min(day, daysInMonth(y, m0)))));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 7) + '-01';
}

export function endOfMonth(s: ISODate): ISODate {
  const d = parseISO(s);
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Weeks start on Monday. */
export function startOfWeek(s: ISODate): ISODate {
  const dow = parseISO(s).getUTCDay(); // 0 = Sunday
  return addDays(s, -((dow + 6) % 7));
}

export function endOfWeek(s: ISODate): ISODate {
  return addDays(startOfWeek(s), 6);
}

/** Australian financial year: 1 July – 30 June. Returns start year (FY2025-26 => 2025). */
export function fyStartYear(s: ISODate): number {
  const d = parseISO(s);
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export function fyRange(startYear: number): { start: ISODate; end: ISODate; label: string } {
  return {
    start: `${startYear}-07-01`,
    end: `${startYear + 1}-06-30`,
    label: `FY ${startYear}–${String(startYear + 1).slice(2)}`,
  };
}

export function monthLabel(key: string, short = false): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-AU', {
    month: short ? 'short' : 'long',
    year: short ? '2-digit' : 'numeric',
    timeZone: 'UTC',
  });
}

export function inRange(s: ISODate, start: ISODate, end: ISODate): boolean {
  return s >= start && s <= end;
}

/**
 * All occurrence dates of a recurring schedule that fall inside [from, to].
 * Monthly/quarterly/yearly keep the start date's day-of-month (clamped).
 */
export function occurrences(
  startDate: ISODate,
  frequency: Frequency,
  from: ISODate,
  to: ISODate,
  endDate?: ISODate,
): ISODate[] {
  const out: ISODate[] = [];
  const last = endDate && endDate < to ? endDate : to;
  if (frequency === 'one-time') {
    if (inRange(startDate, from, last)) out.push(startDate);
    return out;
  }
  const anchor = parseISO(startDate).getUTCDate();
  let i = 0;
  // Safety cap prevents infinite loops on bad data.
  while (i < 5000) {
    let d: ISODate;
    switch (frequency) {
      case 'weekly':
        d = addDays(startDate, 7 * i);
        break;
      case 'fortnightly':
        d = addDays(startDate, 14 * i);
        break;
      case 'monthly':
        d = addMonths(startDate, i, anchor);
        break;
      case 'quarterly':
        d = addMonths(startDate, 3 * i, anchor);
        break;
      case 'yearly':
        d = addMonths(startDate, 12 * i, anchor);
        break;
    }
    if (d > last) break;
    if (d >= from) out.push(d);
    i++;
  }
  return out;
}

/** Monthly equivalent multiplier for a frequency (used for budgeting). */
export function monthlyFactor(f: Frequency): number {
  switch (f) {
    case 'weekly':
      return 52 / 12;
    case 'fortnightly':
      return 26 / 12;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 1 / 3;
    case 'yearly':
      return 1 / 12;
    default:
      return 0;
  }
}

/**
 * The pay-cycle period containing `ref`.
 * weekly/fortnightly: repeats every 7/14 days from `anchor` (works for dates before the anchor too).
 * monthly: starts on the anchor's day of the month (clamped for short months).
 */
export function cycleRange(frequency: 'weekly' | 'fortnightly' | 'monthly', anchor: ISODate, ref: ISODate): { start: ISODate; end: ISODate } {
  if (frequency === 'monthly') {
    const day = parseISO(anchor).getUTCDate();
    let start = addMonths(startOfMonth(ref), 0, day);
    if (start > ref) start = addMonths(startOfMonth(ref), -1, day);
    const next = addMonths(startOfMonth(start), 1, day);
    return { start, end: addDays(next, -1) };
  }
  const len = frequency === 'weekly' ? 7 : 14;
  const k = Math.floor(diffDays(ref, anchor) / len);
  const start = addDays(anchor, k * len);
  return { start, end: addDays(start, len - 1) };
}

export function weekdayName(s: ISODate, short = false): string {
  return parseISO(s).toLocaleDateString('en-AU', { weekday: short ? 'short' : 'long', timeZone: 'UTC' });
}
