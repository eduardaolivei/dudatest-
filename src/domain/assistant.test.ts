import { describe, expect, it } from 'vitest';
import { emptyData } from '../store/storage';
import { newTx } from '../store/actions';
import { answer, alerts } from './assistant';
import { buildReport, reportToCSVRows } from './reports';

const REF = '2026-11-09';
function data() {
  const d = emptyData();
  d.accounts = [{ id: 'a', name: 'Everyday', type: 'bank', owner: 'joint', openingBalance: 100000 }];
  d.cards = [{ id: 'c', name: 'Visa', bank: 'B', owner: 'joint', limit: 100000, openingBalance: 0, closingDay: 20, dueDay: 15, minPaymentPercent: 2, minPaymentFloor: 2500, annualFee: 0, interestRate: 20 }];
  d.transactions = [
    newTx({ kind: 'expense', amount: 12000, description: 'Coles', date: '2026-11-03', category: 'Groceries', subcategory: 'Supermarket', person: 'joint', accountId: 'a' }),
    newTx({ kind: 'card_purchase', amount: 95000, description: 'Laptop', date: '2026-11-04', category: 'Personal', person: 'me', cardId: 'c' }),
    newTx({ kind: 'income', amount: 50000, description: 'Pay', date: '2026-11-05', category: 'Income', person: 'me', accountId: 'a', incomeSource: 'Salary' }),
  ];
  return d;
}

describe('assistant', () => {
  it('answers from real data only', () => {
    const d = data();
    expect(answer('How much did we spend on groceries?', d, REF).text).toContain('$120.00');
    expect(answer('How much did we spend on coffee?', d, REF).missing).toBeDefined();
    expect(answer('How much money do we have available?', d, REF).text).toContain('$1,380.00');
    expect(answer('How much credit card debt do we have?', d, REF).text).toContain('$950.00');
    expect(answer('Are we spending more than we earn?', d, REF).text).toMatch(/^Yes/);
    expect(answer('Can we afford $100?', d, REF).text).toMatch(/^Yes/);
    expect(answer('Can we afford $5000?', d, REF).text).toMatch(/^No/);
  });
  it('says when data is missing', () => {
    const a = answer('How much money do we have available?', emptyData(), REF);
    expect(a.missing).toMatch(/No bank accounts/);
  });
  it('raises alerts for high card utilisation', () => {
    expect(alerts(data(), REF).some((a) => a.text.includes('95%'))).toBe(true);
  });
});

describe('reports', () => {
  it('monthly report totals match and CSV uses dollars', () => {
    const rep = buildReport('monthly', data(), REF, 'all');
    expect(rep.tables[0].rows[0]).toEqual(['Income', 50000]);
    expect(rep.tables[0].rows[1]).toEqual(['Spending', 107000]);
    const csv = reportToCSVRows(rep);
    expect(csv.some((r) => r[0] === 'Spending' && r[1] === '1070.00')).toBe(true);
  });
  it('FY report covers July to June', () => {
    const rep = buildReport('fy', data(), REF, 'all');
    expect(rep.subtitle).toContain('FY 2026–27');
    expect(rep.tables[0].rows[0][0]).toBe('July 2026');
    expect(rep.tables[0].rows).toHaveLength(12);
  });
});
