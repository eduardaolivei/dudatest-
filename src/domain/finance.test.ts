import { describe, expect, it } from 'vitest';
import type { AppData, Card } from './types';
import { emptyData } from '../store/storage';
import { addInstalments, markPaid, newTx, payCard, settleOccurrence, skipOccurrence } from '../store/actions';
import {
  accountBalance,
  affordability,
  cardBalance,
  cardStatement,
  cashAvailable,
  goalForecast,
  incomeTotal,
  jointContributions,
  monthRange,
  pendingOccurrences,
  safeToSpend,
  spendingByCategory,
  spendingTotal,
  unpaidBills,
} from './finance';
import { addMonths, fyStartYear, occurrences, startOfWeek } from './dates';
import { parseMoney, splitCents } from './money';

const REF = '2026-11-09'; // a Monday

function base(): AppData {
  const d = emptyData();
  d.accounts = [
    { id: 'joint', name: 'Joint', type: 'bank', owner: 'joint', openingBalance: 100000 },
    { id: 'me', name: 'Mine', type: 'bank', owner: 'me', openingBalance: 50000 },
    { id: 'sav', name: 'Saver', type: 'savings', owner: 'joint', openingBalance: 200000 },
  ];
  d.cards = [card()];
  return d;
}

function card(): Card {
  return {
    id: 'visa', name: 'Visa', bank: 'Bank', owner: 'joint', limit: 500000, openingBalance: 0,
    closingDay: 20, dueDay: 15, minPaymentPercent: 2, minPaymentFloor: 2500, annualFee: 0, interestRate: 20,
  };
}

describe('money', () => {
  it('parses without float errors', () => {
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('$1,234.56')).toBe(123456);
    expect(parseMoney('19.99')).toBe(1999);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
  });
  it('splits exactly', () => {
    expect(splitCents(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitCents(10000, 3).reduce((a, b) => a + b)).toBe(10000);
  });
});

describe('dates', () => {
  it('handles monthly recurrences at month end', () => {
    expect(occurrences('2026-01-31', 'monthly', '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ]);
  });
  it('handles fortnightly / quarterly / yearly', () => {
    expect(occurrences('2026-11-02', 'fortnightly', '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30']);
    expect(occurrences('2026-01-15', 'quarterly', '2026-01-01', '2026-12-31')).toHaveLength(4);
    expect(occurrences('2024-02-29', 'yearly', '2025-01-01', '2025-12-31')).toEqual(['2025-02-28']);
  });
  it('uses the Australian financial year', () => {
    expect(fyStartYear('2026-06-30')).toBe(2025);
    expect(fyStartYear('2026-07-01')).toBe(2026);
  });
  it('weeks start Monday', () => {
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
  });
});

describe('balances and the no-double-count rule', () => {
  it('card purchase + card payment counts spending ONCE', () => {
    let d = base();
    d.transactions.push(newTx({ kind: 'card_purchase', amount: 20000, description: 'Groceries', date: '2026-11-02', category: 'Groceries', person: 'joint', cardId: 'visa' }));
    d = payCard(d, d.cards[0], 20000, 'joint', '2026-11-05');
    const r = monthRange(REF);
    expect(spendingTotal(d, r)).toBe(20000); // not 40000
    expect(cardBalance(d.cards[0], d.transactions)).toBe(0);
    expect(accountBalance(d.accounts[0], d.transactions)).toBe(80000);
    expect(spendingByCategory(d, r)).toEqual({ Groceries: 20000 });
  });

  it('transfers are neither income nor spending, and move balances', () => {
    const d = base();
    d.transactions.push(newTx({ kind: 'transfer', amount: 30000, description: 'share', date: '2026-11-03', category: 'Transfer', person: 'me', accountId: 'me', toAccountId: 'joint' }));
    const r = monthRange(REF);
    expect(incomeTotal(d, r)).toBe(0);
    expect(spendingTotal(d, r)).toBe(0);
    expect(accountBalance(d.accounts[0], d.transactions)).toBe(130000);
    expect(accountBalance(d.accounts[1], d.transactions)).toBe(20000);
    expect(jointContributions(d, r).me).toBe(30000);
  });

  it('pending bills do not affect the balance until paid', () => {
    let d = base();
    const bill = newTx({ kind: 'expense', status: 'pending', amount: 10000, description: 'Power', date: '2026-11-12', dueDate: '2026-11-12', category: 'Housing', person: 'joint', accountId: 'joint' });
    d.transactions.push(bill);
    expect(cashAvailable(d)).toBe(150000);
    expect(spendingTotal(d, monthRange(REF))).toBe(0);
    d = markPaid(d, bill.id, '2026-11-10');
    expect(cashAvailable(d)).toBe(140000);
    expect(spendingTotal(d, monthRange(REF))).toBe(10000);
  });

  it('credit limit and savings are not available cash', () => {
    const d = base();
    expect(cashAvailable(d)).toBe(150000);
  });
});

describe('card statements', () => {
  it('computes statement, due date, minimum and unbilled', () => {
    let d = base();
    d.transactions.push(newTx({ kind: 'card_purchase', amount: 100000, description: 'TV', date: '2026-10-25', category: 'Personal', person: 'joint', cardId: 'visa' }));
    d.transactions.push(newTx({ kind: 'card_purchase', amount: 5000, description: 'Coffee', date: '2026-10-21', category: 'Groceries', person: 'joint', cardId: 'visa' }));
    // REF 9 Nov: last closing 20 Oct -> nothing on statement yet
    let s = cardStatement(d.cards[0], d.transactions, REF);
    expect(s.lastClosing).toBe('2026-10-20');
    expect(s.statementBalance).toBe(0);
    expect(s.unbilled).toBe(105000);
    // On 25 Nov the 20 Nov statement includes both, due 15 Dec
    s = cardStatement(d.cards[0], d.transactions, '2026-11-25');
    expect(s.lastClosing).toBe('2026-11-20');
    expect(s.dueDate).toBe('2026-12-15');
    expect(s.statementBalance).toBe(105000);
    expect(s.minimumPayment).toBe(2500); // 2% of 1050 = 21 -> floor $25
    d = payCard(d, d.cards[0], 40000, 'joint', '2026-11-26');
    s = cardStatement(d.cards[0], d.transactions, '2026-11-27');
    expect(s.amountDue).toBe(65000);
    expect(s.status).toBe('due');
    expect(cardStatement(d.cards[0], d.transactions, '2026-12-16').status).toBe('overdue');
  });

  it('instalments sum to the purchase and land monthly', () => {
    let d = base();
    d = addInstalments(d, newTx({ kind: 'card_purchase', amount: 100000, description: 'Laptop', date: '2026-11-01', category: 'Personal', person: 'me', cardId: 'visa' }), 3);
    expect(d.transactions).toHaveLength(3);
    expect(d.transactions.map((t) => t.date)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    expect(d.transactions.reduce((a, t) => a + t.amount, 0)).toBe(100000);
    expect(spendingTotal(d, monthRange(REF))).toBe(33334);
  });
});

describe('recurring + bills', () => {
  it('lists recurring occurrences until confirmed, then never duplicates', () => {
    let d = base();
    const rent = { id: 'rent', kind: 'expense' as const, description: 'Rent', amount: 200000, frequency: 'monthly' as const, startDate: '2026-10-01', category: 'Housing', person: 'joint' as const, accountId: 'joint' };
    d.recurring.push(rent);
    // 1 Oct is 39 days back (inside the 45-day overdue lookback), 1 Nov is overdue too
    let bills = unpaidBills(d, REF, '2026-11-30');
    expect(bills.map((b) => [b.dueDate, b.status])).toEqual([
      ['2026-10-01', 'overdue'],
      ['2026-11-01', 'overdue'],
    ]);
    d = settleOccurrence(d, rent, '2026-11-01');
    d = skipOccurrence(d, 'rent', '2026-10-01');
    bills = unpaidBills(d, REF, '2026-11-30');
    expect(bills).toHaveLength(0);
    expect(spendingTotal(d, monthRange(REF))).toBe(200000);
    // settling again would be a user action; the rule itself never auto-pays
    expect(d.transactions).toHaveLength(1);
  });

  it('expected income is never counted as available cash', () => {
    const d = base();
    d.recurring.push({ id: 'sal', kind: 'income', description: 'Salary', amount: 300000, frequency: 'fortnightly', startDate: '2026-11-13', category: 'Income', person: 'me', accountId: 'me' });
    const s = safeToSpend(d, REF, 'month', monthRange(REF));
    expect(s.cash).toBe(150000);
    expect(s.expectedIncome).toBe(600000); // 13 and 27 Nov
    expect(s.safe).toBe(150000);
    expect(s.projected).toBe(750000);
    expect(pendingOccurrences(d, 'income', monthRange(REF))).toHaveLength(2);
  });

  it('safe-to-spend subtracts bills, card statements and goal reserves', () => {
    const d = base();
    d.transactions.push(newTx({ kind: 'expense', status: 'pending', amount: 20000, description: 'Power', date: '2026-11-20', dueDate: '2026-11-20', category: 'Housing', person: 'joint' }));
    d.transactions.push(newTx({ kind: 'card_purchase', amount: 30000, description: 'Stuff', date: '2026-10-10', category: 'Personal', person: 'joint', cardId: 'visa' }));
    d.goals.push({ id: 'g', name: 'EF', target: 100000, current: 0, monthlyContribution: 10000, person: 'joint' });
    const s = safeToSpend(d, REF, 'month', monthRange(REF));
    // statement closed 20 Oct (30000) due 15 Nov
    expect(s.billsDue).toBe(50000);
    expect(s.goalReserve).toBe(10000);
    expect(s.safe).toBe(150000 - 50000 - 10000);
    expect(affordability(s, 100000).verdict).toBe('no');
    expect(affordability(s, 50000).verdict).toBe('yes');
  });
});

describe('goals', () => {
  it('forecasts completion', () => {
    const g = { id: 'g', name: 'Car', target: 100000, current: 40000, monthlyContribution: 20000, deadline: addMonths(REF, 2), person: 'joint' as const };
    const f = goalForecast(g, REF);
    expect(f.months).toBe(3);
    expect(f.onTrack).toBe(false);
  });
});
