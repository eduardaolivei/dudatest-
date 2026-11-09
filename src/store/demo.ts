import type { AppData, ISODate, Transaction } from '../domain/types';
import { addDays, addMonths, startOfMonth } from '../domain/dates';
import { uid } from './id';

/**
 * FICTIONAL demo data, every record flagged `demo: true` so it can be removed
 * in one click (More → Settings → Remove demo data). Never mixed with real data.
 */
export function buildDemo(ref: ISODate): Omit<AppData, 'settings' | 'version'> {
  const m0 = startOfMonth(ref);
  const prev = (n: number, day: number) => addMonths(m0, -n, day);
  const now = new Date().toISOString();

  const everyday = { id: uid(), name: 'Demo Everyday (Joint)', type: 'bank' as const, owner: 'joint' as const, openingBalance: 320000, demo: true };
  const mine = { id: uid(), name: 'Demo My Account', type: 'bank' as const, owner: 'me' as const, openingBalance: 85000, demo: true };
  const pats = { id: uid(), name: "Demo Patrick's Account", type: 'bank' as const, owner: 'patrick' as const, openingBalance: 110000, demo: true };
  const saver = { id: uid(), name: 'Demo Savings', type: 'savings' as const, owner: 'joint' as const, openingBalance: 450000, demo: true };

  const visa = {
    id: uid(), name: 'Demo Visa', bank: 'Demo Bank', owner: 'joint' as const, limit: 600000, openingBalance: 120000,
    closingDay: 20, dueDay: 15, minPaymentPercent: 2, minPaymentFloor: 2500, annualFee: 9900, interestRate: 20.99, demo: true,
  };
  const master = {
    id: uid(), name: 'Demo Mastercard', bank: 'Sample CU', owner: 'patrick' as const, limit: 300000, openingBalance: 0,
    closingDay: 5, dueDay: 28, minPaymentPercent: 2, minPaymentFloor: 2500, annualFee: 0, interestRate: 18.5, demo: true,
  };

  const salaryMe = { id: uid(), kind: 'income' as const, description: 'My Salary (demo)', amount: 210000, frequency: 'fortnightly' as const, startDate: addDays(prev(3, 1), 3), category: 'Income', person: 'me' as const, accountId: mine.id, incomeSource: 'Salary', demo: true };
  const salaryPat = { id: uid(), kind: 'income' as const, description: "Patrick's Salary (demo)", amount: 165000, frequency: 'weekly' as const, startDate: prev(3, 2), category: 'Income', person: 'patrick' as const, accountId: pats.id, incomeSource: 'Salary', demo: true };
  const rent = { id: uid(), kind: 'expense' as const, description: 'Rent (demo)', amount: 260000, frequency: 'monthly' as const, startDate: prev(3, 1), category: 'Housing', subcategory: 'Rent', person: 'joint' as const, accountId: everyday.id, paymentMethod: 'Bank transfer', demo: true };
  const internet = { id: uid(), kind: 'expense' as const, description: 'Internet (demo)', amount: 7900, frequency: 'monthly' as const, startDate: prev(3, 18), category: 'Housing', subcategory: 'Internet', person: 'joint' as const, accountId: everyday.id, paymentMethod: 'Direct debit', demo: true };
  const streaming = { id: uid(), kind: 'expense' as const, description: 'Streaming (demo)', amount: 1899, frequency: 'monthly' as const, startDate: prev(3, 12), category: 'Financial', subcategory: 'Subscriptions', person: 'joint' as const, cardId: visa.id, paymentMethod: 'Credit card', demo: true };
  const carIns = { id: uid(), kind: 'expense' as const, description: 'Car Insurance (demo)', amount: 42000, frequency: 'quarterly' as const, startDate: prev(2, 25), category: 'Transportation', subcategory: 'Car Insurance', person: 'joint' as const, accountId: everyday.id, paymentMethod: 'Direct debit', demo: true };

  const txs: Transaction[] = [];
  const t = (p: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'description' | 'date' | 'category'>) =>
    txs.push({ id: uid(), person: 'joint', status: 'paid', createdAt: now, demo: true, ...p });

  // Past 3 months of settled history (only up to today)
  for (let n = 3; n >= 0; n--) {
    const d = (day: number) => prev(n, day);
    const ok = (day: number) => d(day) <= ref;
    if (ok(1)) t({ kind: 'expense', amount: 260000, description: 'Rent (demo)', date: d(1), dueDate: d(1), category: 'Housing', subcategory: 'Rent', accountId: everyday.id, recurringId: rent.id, occurrence: d(1), paymentMethod: 'Bank transfer' });
    if (ok(18)) t({ kind: 'expense', amount: 7900, description: 'Internet (demo)', date: d(18), dueDate: d(18), category: 'Housing', subcategory: 'Internet', accountId: everyday.id, recurringId: internet.id, occurrence: d(18), paymentMethod: 'Direct debit' });
    if (ok(12)) t({ kind: 'card_purchase', amount: 1899, description: 'Streaming (demo)', date: d(12), category: 'Financial', subcategory: 'Subscriptions', cardId: visa.id, recurringId: streaming.id, occurrence: d(12), paymentMethod: 'Credit card' });
    if (ok(4)) t({ kind: 'card_purchase', amount: 18450 + n * 1300, description: 'Woolworths (demo)', date: d(4), category: 'Groceries', subcategory: 'Supermarket', cardId: visa.id, paymentMethod: 'Credit card' });
    if (ok(11)) t({ kind: 'expense', amount: 16520, description: 'Coles (demo)', date: d(11), category: 'Groceries', subcategory: 'Supermarket', accountId: everyday.id, paymentMethod: 'Debit card' });
    if (ok(9)) t({ kind: 'expense', amount: 7200, description: 'Fuel (demo)', date: d(9), category: 'Transportation', subcategory: 'Fuel', person: 'patrick', accountId: pats.id, paymentMethod: 'Debit card' });
    if (ok(14)) t({ kind: 'card_purchase', amount: 6400, description: 'Dinner out (demo)', date: d(14), category: 'Groceries', subcategory: 'Restaurants', person: 'patrick', cardId: master.id, paymentMethod: 'Credit card' });
    if (ok(7)) t({ kind: 'expense', amount: 2350, description: 'Coffee (demo)', date: d(7), category: 'Groceries', subcategory: 'Coffee', person: 'me', accountId: mine.id, paymentMethod: 'Debit card' });
    if (ok(6)) t({ kind: 'transfer', amount: 80000, description: 'My share to joint (demo)', date: d(6), category: 'Transfer', person: 'me', accountId: mine.id, toAccountId: everyday.id });
    if (ok(6)) t({ kind: 'transfer', amount: 80000, description: "Patrick's share to joint (demo)", date: d(6), category: 'Transfer', person: 'patrick', accountId: pats.id, toAccountId: everyday.id });
    if (ok(15) && n > 0) t({ kind: 'card_payment', amount: 30000, description: 'Demo Visa payment (demo)', date: d(15), category: 'Financial', subcategory: 'Credit Card Payments', accountId: everyday.id, cardId: visa.id });
    if (ok(22)) t({ kind: 'income', amount: 45000, description: 'Cleaning Business (demo)', date: d(22), category: 'Income', person: 'me', accountId: mine.id, incomeSource: 'Cleaning Business' });
  }
  // Salaries received (settle past occurrences)
  for (const rule of [salaryMe, salaryPat]) {
    const step = rule.frequency === 'weekly' ? 7 : 14;
    for (let d = rule.startDate; d <= ref; d = addDays(d, step)) {
      t({ kind: 'income', amount: rule.amount, description: rule.description, date: d, category: 'Income', person: rule.person, accountId: rule.accountId, incomeSource: 'Salary', recurringId: rule.id, occurrence: d });
    }
  }
  // An upcoming one-off bill and an overdue one
  t({ kind: 'expense', amount: 18900, status: 'pending', description: 'Electricity (demo)', date: addDays(ref, 5), dueDate: addDays(ref, 5), category: 'Housing', subcategory: 'Electricity', accountId: everyday.id, paymentMethod: 'BPAY' });
  t({ kind: 'expense', amount: 4500, status: 'pending', description: 'Gas (demo)', date: addDays(ref, -2), dueDate: addDays(ref, -2), category: 'Housing', subcategory: 'Gas', accountId: everyday.id, paymentMethod: 'BPAY' });

  return {
    accounts: [everyday, mine, pats, saver],
    cards: [visa, master],
    transactions: txs,
    recurring: [salaryMe, salaryPat, rent, internet, streaming, carIns],
    goals: [
      { id: uid(), name: 'Emergency Fund (demo)', target: 1000000, current: 450000, monthlyContribution: 50000, deadline: addMonths(ref, 12), person: 'joint', demo: true },
      { id: uid(), name: 'Visa Expenses (demo)', target: 400000, current: 120000, monthlyContribution: 20000, deadline: addMonths(ref, 6), person: 'joint', demo: true },
    ],
    purchases: [
      { id: uid(), name: 'Standing desk (demo)', price: 45000, saved: 10000, priority: 'medium', person: 'me', deadline: addMonths(ref, 2), category: 'Household expenses', status: 'saving', paymentMethod: 'Debit card', demo: true },
    ],
  };
}


