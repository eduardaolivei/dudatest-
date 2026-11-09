import { describe, expect, it } from 'vitest';
import { normalize } from './storage';
import { toCSV } from '../components/exporters';
import { buildDemo } from './demo';
import { removeDemo } from './actions';
import { emptyData } from './storage';

describe('backup import', () => {
  it('fills missing fields from partial backups', () => {
    const d = normalize({ accounts: [{ id: 'a' }], settings: { myName: 'Ana' } });
    expect(d.transactions).toEqual([]);
    expect(d.settings.myName).toBe('Ana');
    expect(d.settings.partnerName).toBe('Patrick');
  });
  it('rejects invalid files', () => {
    expect(() => normalize('hello')).toThrow();
    expect(() => normalize({ transactions: 'oops' })).toThrow();
  });
});

describe('CSV export', () => {
  it('escapes commas/quotes and neutralises formulas', () => {
    expect(toCSV(['a', 'b'], [['Coles, Bondi', 'Say "hi"']])).toBe('a,b\r\n"Coles, Bondi","Say ""hi"""');
    expect(toCSV(['x'], [['=HYPERLINK("bad")']])).toContain("'=HYPERLINK");
    expect(toCSV(['x'], [['-12.50']])).toBe('x\r\n-12.50');
  });
});

describe('demo data', () => {
  it('is fully removable and never touches real records', () => {
    const real = emptyData();
    real.accounts.push({ id: 'mine', name: 'Real', type: 'bank', owner: 'me', openingBalance: 1 });
    const demo = buildDemo('2026-11-09');
    const merged = { ...real, ...{ accounts: [...real.accounts, ...demo.accounts], transactions: demo.transactions, cards: demo.cards, recurring: demo.recurring, goals: demo.goals, purchases: demo.purchases } };
    const cleaned = removeDemo(merged);
    expect(cleaned.accounts.map((a) => a.id)).toEqual(['mine']);
    expect(cleaned.transactions).toHaveLength(0);
    expect(cleaned.cards).toHaveLength(0);
    expect(demo.transactions.every((t) => t.demo && t.date <= '2026-11-09' || t.status === 'pending')).toBe(true);
  });
});
