import { describe, expect, it } from 'vitest';
import { emptyData } from '../store/storage';
import { addPlan, deletePlan } from '../store/actions';
import { cardPlans, cardStatement, spendingTotal } from './finance';

const card = { id: 'v', name: 'Visa', bank: 'B', owner: 'joint' as const, limit: 1000000, openingBalance: 0, closingDay: 20, dueDay: 15, minPaymentPercent: 2, minPaymentFloor: 2500, annualFee: 0, interestRate: 20 };

describe('payment plans (24 months)', () => {
  it('existing plan: 6 of 24 paid, $100/month', () => {
    let d = emptyData();
    d.cards = [{ ...card, openingBalance: 300000 }]; // card balance typed in the app already included the plan ($1,800 left)
    d = addPlan(d, { cardId: 'v', name: 'iPhone', monthly: 10000, months: 24, alreadyPaid: 6, nextDate: '2026-12-05', category: 'Personal', person: 'me', alreadyInCardBalance: true });
    expect(d.transactions).toHaveLength(18);
    expect(d.cards[0].openingBalance).toBe(120000); // 3000 - 1800, no double counting
    const ref = '2026-11-28';
    const st = cardStatement(d.cards[0], d.transactions, ref);
    expect(st.balance).toBe(300000); // total debt unchanged
    expect(st.planRemaining).toBe(170000); // instalments after the next statement (17 x $100)
    expect(st.unbilled).toBe(10000); // next instalment, on the 20 Dec statement
    const plans = cardPlans(d.cards[0], d.transactions, ref);
    expect(plans[0]).toMatchObject({ name: 'iPhone', months: 24, billed: 6, remaining: 180000, monthly: 10000, nextDate: '2026-12-05', endDate: '2028-05-05' });
    // spending counts one instalment per month
    expect(spendingTotal(d, { start: '2026-12-01', end: '2026-12-31' })).toBe(10000);
    expect(spendingTotal(d, { start: '2026-11-01', end: '2026-11-30' })).toBe(0);
    // a month later the December instalment is on the statement to pay
    const jan = cardStatement(d.cards[0], d.transactions, '2026-12-22');
    expect(jan.statementBalance).toBe(130000); // opening $1,200 + Dec instalment
    expect(cardPlans(d.cards[0], d.transactions, '2026-12-22')[0].billed).toBe(7);
  });
  it('new plan not in the balance yet adds the full amount as debt; delete removes it', () => {
    let d = emptyData();
    d.cards = [card];
    d = addPlan(d, { cardId: 'v', name: 'MacBook', monthly: 8000, months: 24, alreadyPaid: 0, nextDate: '2026-12-01', category: 'Personal', person: 'me', alreadyInCardBalance: false });
    expect(cardStatement(d.cards[0], d.transactions, '2026-11-28').balance).toBe(192000);
    d = deletePlan(d, cardPlans(d.cards[0], d.transactions, '2026-11-28')[0].groupId);
    expect(d.transactions).toHaveLength(0);
  });
});
