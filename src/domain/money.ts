import type { Cents } from './types';

const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const fmtShort = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

/** 1234 -> "$12.34" ; -1234 -> "-$12.34" */
export function formatMoney(cents: Cents, opts: { short?: boolean } = {}): string {
  const v = cents / 100;
  return opts.short ? fmtShort.format(v) : fmt.format(v);
}

/**
 * Parse user input into cents without floating point drift.
 * Accepts "12", "12.3", "12.34", "$1,234.50". Returns null if invalid.
 */
export function parseMoney(input: string): Cents | null {
  const clean = input.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{0,2})?$/.test(clean)) return null;
  const neg = clean.startsWith('-');
  const [whole, frac = ''] = clean.replace('-', '').split('.');
  const cents = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return neg ? -cents : cents;
}

/** cents -> "12.34" for form inputs */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

export const sum = (xs: Cents[]): Cents => xs.reduce((a, b) => a + b, 0);

/** Split an amount into n parts that add up exactly (remainder goes to first parts). */
export function splitCents(total: Cents, n: number): Cents[] {
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
