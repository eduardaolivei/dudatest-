import { describe, expect, it } from 'vitest';
import { cycleRange } from './dates';
import { budgetPeriod, budgetStatus, convertBudgets, effectiveCycle } from './finance';
import { emptyData } from '../store/storage';
import { newTx } from '../store/actions';

describe('budget cycles', () => {
  it('weekly cycle starts on payday (Thursday)', () => {
    // 20/11/2026 is a Friday payday anchor; ref Sun 22/11
    expect(cycleRange('weekly', '2026-11-19', '2026-11-22')).toEqual({ start: '2026-11-19', end: '2026-11-25' });
    expect(cycleRange('weekly', '2026-11-19', '2026-11-26')).toEqual({ start: '2026-11-26', end: '2026-12-02' });
  });
  it('works for dates before the anchor', () => {
    expect(cycleRange('weekly', '2026-11-26', '2026-11-22')).toEqual({ start: '2026-11-19', end: '2026-11-25' });
    expect(cycleRange('fortnightly', '2026-12-03', '2026-11-22')).toEqual({ start: '2026-11-19', end: '2026-12-02' });
  });
  it('monthly cycle on the 15th, and clamps short months', () => {
    expect(cycleRange('monthly', '2026-01-15', '2026-11-22')).toEqual({ start: '2026-11-15', end: '2026-12-14' });
    expect(cycleRange('monthly', '2026-01-15', '2026-11-10')).toEqual({ start: '2026-10-15', end: '2026-11-14' });
    expect(cycleRange('monthly', '2026-01-31', '2027-02-28')).toEqual({ start: '2027-02-28', end: '2027-03-30' });
  });
  it('period shows days left until payday', () => {
    const d = emptyData();
    d.settings.budgetCycle = { frequency: 'weekly', anchor: '2026-11-19' };
    const p = budgetPeriod(d, '2026-11-22');
    expect(p.dayNumber).toBe(4);
    expect(p.daysLeft).toBe(4);
    expect(p.nextReset).toBe('2026-11-26');
    expect(budgetPeriod(d, '2026-11-22', -1).start).toBe('2026-11-12');
  });
  it('follows a recurring salary', () => {
    const d = emptyData();
    d.recurring.push({ id: 's', kind: 'income', description: 'Salary', amount: 1, frequency: 'fortnightly', startDate: '2026-11-05', category: 'Income', person: 'me' });
    d.settings.budgetCycle = { frequency: 'monthly', anchor: '2026-01-01', incomeRuleId: 's' };
    expect(effectiveCycle(d).frequency).toBe('fortnightly');
    expect(budgetPeriod(d, '2026-11-22')).toMatchObject({ start: '2026-11-19', end: '2026-12-02' });
  });
  it('only counts spending inside the cycle', () => {
    const d = emptyData();
    d.settings.budgetCycle = { frequency: 'weekly', anchor: '2026-11-19' };
    d.settings.budgets = { Groceries: 20000 };
    d.transactions.push(newTx({ kind: 'expense', amount: 5000, description: 'old', date: '2026-11-18', category: 'Groceries', person: 'joint' }));
    d.transactions.push(newTx({ kind: 'expense', amount: 7000, description: 'new', date: '2026-11-20', category: 'Groceries', person: 'joint' }));
    expect(budgetStatus(d, budgetPeriod(d, '2026-11-22')).remaining).toBe(13000);
  });
  it('converts limits between cycles', () => {
    expect(convertBudgets({ Groceries: 60000 }, 'monthly', 'weekly')).toEqual({ Groceries: 13800 });
    expect(convertBudgets({ Groceries: 15000 }, 'weekly', 'fortnightly')).toEqual({ Groceries: 30000 });
  });
});

describe('subcategory budgets', () => {
  it('tracks subcategory spending and avoids double counting totals', () => {
    const d = emptyData();
    d.transactions.push(newTx({ kind: 'expense', amount: 1500, description: 'flat white', date: '2026-11-20', category: 'Groceries', subcategory: 'Coffee', person: 'me' }));
    d.transactions.push(newTx({ kind: 'expense', amount: 9000, description: 'coles', date: '2026-11-20', category: 'Groceries', subcategory: 'Supermarket', person: 'joint' }));
    d.transactions.push(newTx({ kind: 'card_purchase', amount: 3000, description: 'ubereats', date: '2026-11-21', category: 'Groceries', subcategory: 'Uber Eats', person: 'joint', cardId: 'x' }));
    const r = { start: '2026-11-01', end: '2026-11-30' };
    d.settings.budgets = { 'Groceries › Coffee': 4000, 'Groceries › Uber Eats': 5000 };
    let st = budgetStatus(d, r);
    expect(st.rows.find((x) => x.key === 'Groceries › Coffee')).toMatchObject({ label: 'Coffee', spent: 1500, remaining: 2500 });
    expect(st.rows.find((x) => x.label === 'Uber Eats')!.spent).toBe(3000);
    expect(st.totalBudget).toBe(9000); // no category budget -> sub budgets count
    d.settings.budgets['Groceries'] = 20000;
    st = budgetStatus(d, r);
    expect(st.totalBudget).toBe(20000); // category budget already contains its subs
    expect(st.totalSpent).toBe(13500);
  });
});

describe('editing recurring bills', () => {
  it('changing the due date does not resurrect paid bills', async () => {
    const { unpaidBills } = await import('./finance');
    const { settleOccurrence } = await import('../store/actions');
    let d = emptyData();
    const rent = { id: 'r', kind: 'expense' as const, description: 'Rent', amount: 200000, frequency: 'monthly' as const, startDate: '2026-10-01', category: 'Housing', person: 'joint' as const };
    d.recurring.push(rent);
    d = settleOccurrence(d, rent, '2026-10-01');
    d = settleOccurrence(d, rent, '2026-11-01');
    // user fixes the day: rent is actually due on the 3rd
    d.recurring = [{ ...rent, startDate: '2026-10-03' }];
    const bills = unpaidBills(d, '2026-11-22', '2026-12-31');
    expect(bills.map((b) => b.dueDate)).toEqual(['2026-12-03']);
  });
  it('a one-off pending edit replaces that occurrence only', async () => {
    const { unpaidBills } = await import('./finance');
    const d = emptyData();
    d.recurring.push({ id: 'r', kind: 'expense', description: 'Power', amount: 15000, frequency: 'monthly', startDate: '2026-11-25', category: 'Housing', person: 'joint' });
    d.transactions.push(newTx({ kind: 'expense', status: 'pending', amount: 18900, description: 'Power', date: '2026-11-27', dueDate: '2026-11-27', category: 'Housing', person: 'joint', recurringId: 'r', occurrence: '2026-11-25' }));
    const bills = unpaidBills(d, '2026-11-22', '2026-12-31');
    expect(bills.map((b) => [b.dueDate, b.amount, b.source])).toEqual([['2026-11-27', 18900, 'tx'], ['2026-12-25', 15000, 'recurring']]);
  });
});
