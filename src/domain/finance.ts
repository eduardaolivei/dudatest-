import type {
  Account,
  AppData,
  BudgetCycle,
  Card,
  Cents,
  Goal,
  ISODate,
  Person,
  PersonFilter,
  RecurringRule,
  Transaction,
} from './types';
import {
  addDays,
  addMonths,
  cycleRange,
  diffDays,
  endOfMonth,
  inRange,
  monthKey,
  occurrences,
  parseISO,
  startOfMonth,
  toISO,
} from './dates';
import { sum } from './money';
import { parseBudgetKey } from './categories';

// ---------------------------------------------------------------------------
// Basic rules
// ---------------------------------------------------------------------------

export const matchPerson = (p: Person, f: PersonFilter) => f === 'all' || p === f;

/**
 * THE rule that prevents double counting:
 * Spending = paid bank expenses + card purchases + card interest/fees.
 * A card PAYMENT is never spending (the purchase was already counted).
 * A TRANSFER is never spending or income.
 */
export function isSpending(t: Transaction): boolean {
  if (t.kind === 'expense') return t.status === 'paid';
  return t.kind === 'card_purchase' || t.kind === 'card_charge';
}

export function isIncome(t: Transaction): boolean {
  return t.kind === 'income' && t.status === 'paid';
}

const posted = (t: Transaction, asOf?: ISODate) => t.status === 'paid' && (!asOf || t.date <= asOf);

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

/** Real bank balance = opening balance + every paid movement in/out of the account. */
export function accountBalance(acc: Account, txs: Transaction[], asOf?: ISODate): Cents {
  let bal = acc.openingBalance;
  for (const t of txs) {
    if (!posted(t, asOf)) continue;
    if (t.accountId === acc.id) {
      if (t.kind === 'income') bal += t.amount;
      else if (t.kind === 'expense' || t.kind === 'transfer' || t.kind === 'card_payment') bal -= t.amount;
    }
    if (t.kind === 'transfer' && t.toAccountId === acc.id) bal += t.amount;
  }
  return bal;
}

/** Card debt = opening debt + purchases + charges − payments. */
export function cardBalance(card: Card, txs: Transaction[], asOf?: ISODate): Cents {
  let bal = card.openingBalance;
  for (const t of txs) {
    if (t.cardId !== card.id || !posted(t, asOf)) continue;
    if (t.kind === 'card_purchase' || t.kind === 'card_charge') bal += t.amount;
    else if (t.kind === 'card_payment') bal -= t.amount;
  }
  return bal;
}

/** Money we can actually use today: bank + cash accounts. Credit limit is NOT money. */
export function cashAvailable(data: AppData, f: PersonFilter = 'all'): Cents {
  return sum(
    data.accounts
      .filter((a) => a.type !== 'savings' && matchPerson(a.owner, f))
      .map((a) => accountBalance(a, data.transactions)),
  );
}

export function savingsBalance(data: AppData, f: PersonFilter = 'all'): Cents {
  return sum(
    data.accounts
      .filter((a) => a.type === 'savings' && matchPerson(a.owner, f))
      .map((a) => accountBalance(a, data.transactions)),
  );
}

export function totalCardDebt(data: AppData, f: PersonFilter = 'all'): Cents {
  return sum(data.cards.filter((c) => matchPerson(c.owner, f)).map((c) => cardBalance(c, data.transactions)));
}

// ---------------------------------------------------------------------------
// Credit card statements
// ---------------------------------------------------------------------------

export interface CardStatement {
  balance: Cents; // current outstanding (includes purchases after closing)
  available: Cents; // limit - balance
  utilisation: number; // 0..1+
  lastClosing: ISODate; // most recent statement closing date
  nextClosing: ISODate;
  dueDate: ISODate; // payment due date for the last closed statement
  statementBalance: Cents; // balance at last closing (the "full statement balance")
  paidSinceClosing: Cents;
  amountDue: Cents; // statement balance still to pay
  minimumPayment: Cents;
  unbilled: Cents; // purchases since closing (go on the next statement)
  planRemaining: Cents; // instalment-plan amounts billed after the next statement (still owed, not due yet)
  status: 'paid' | 'due' | 'overdue' | 'no-balance';
}

function closingOnOrBefore(day: number, ref: ISODate): ISODate {
  const thisMonth = addMonths(startOfMonth(ref), 0, day);
  return thisMonth <= ref ? thisMonth : addMonths(startOfMonth(ref), -1, day);
}

export function cardStatement(card: Card, txs: Transaction[], ref: ISODate): CardStatement {
  const balance = cardBalance(card, txs);
  const lastClosing = closingOnOrBefore(card.closingDay, ref);
  const nextClosing = addMonths(lastClosing, 1, card.closingDay);
  const dueMonthOffset = card.dueDay > card.closingDay ? 0 : 1;
  const dueDate = addMonths(startOfMonth(lastClosing), dueMonthOffset, card.dueDay);

  const statementBalance = Math.max(0, cardBalance(card, txs, lastClosing));
  const paidSinceClosing = sum(
    txs
      .filter((t) => t.cardId === card.id && t.kind === 'card_payment' && t.status === 'paid' && t.date > lastClosing)
      .map((t) => t.amount),
  );
  const amountDue = Math.max(0, statementBalance - paidSinceClosing);
  const minimumPayment =
    amountDue === 0
      ? 0
      : Math.min(amountDue, Math.max(card.minPaymentFloor, Math.round((statementBalance * card.minPaymentPercent) / 100)));
  const unbilled = sum(
    txs
      .filter(
        (t) =>
          t.cardId === card.id &&
          (t.kind === 'card_purchase' || t.kind === 'card_charge') &&
          t.status === 'paid' &&
          t.date > lastClosing &&
          t.date <= nextClosing,
      )
      .map((t) => t.amount),
  );
  // Future instalments of payment plans: part of the debt (they use the limit) but billed later.
  const planRemaining = sum(
    txs
      .filter((t) => t.cardId === card.id && t.kind === 'card_purchase' && t.status === 'paid' && t.date > nextClosing)
      .map((t) => t.amount),
  );

  let status: CardStatement['status'];
  if (statementBalance === 0) status = 'no-balance';
  else if (amountDue === 0) status = 'paid';
  else if (ref > dueDate) status = 'overdue';
  else status = 'due';

  return {
    balance,
    available: card.limit - balance,
    utilisation: card.limit > 0 ? balance / card.limit : 0,
    lastClosing,
    nextClosing,
    dueDate,
    statementBalance,
    paidSinceClosing,
    amountDue,
    minimumPayment,
    unbilled,
    planRemaining,
    status,
  };
}

// ---------------------------------------------------------------------------
// Instalment / payment plans on a card (e.g. 24 months)
// ---------------------------------------------------------------------------
export interface CardPlan {
  groupId: string;
  name: string;
  monthly: Cents;
  months: number; // total length of the plan
  billed: number; // instalments already on a statement / in the past (incl. ones paid before using the app)
  remaining: Cents; // still to be billed after today
  nextDate: ISODate | null;
  endDate: ISODate;
  category: string;
}

export function cardPlans(card: Card, txs: Transaction[], ref: ISODate): CardPlan[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) if (t.cardId === card.id && t.groupId && t.instalment) groups.set(t.groupId, [...(groups.get(t.groupId) ?? []), t]);
  return [...groups.entries()]
    .map(([groupId, list]) => {
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
      const future = sorted.filter((t) => t.date > ref);
      const of = sorted[0].instalment!.of;
      return {
        groupId,
        name: sorted[0].description.replace(/\s*\(\d+\/\d+\)$/, ''),
        monthly: sorted[sorted.length - 1].amount,
        months: of,
        billed: of - future.length,
        remaining: sum(future.map((t) => t.amount)),
        nextDate: future[0]?.date ?? null,
        endDate: sorted[sorted.length - 1].date,
        category: sorted[0].subcategory ?? sorted[0].category,
      };
    })
    .sort((a, b) => b.remaining - a.remaining);
}

// ---------------------------------------------------------------------------
// Period totals
// ---------------------------------------------------------------------------

export interface Range {
  start: ISODate;
  end: ISODate;
}

export const monthRange = (ref: ISODate): Range => ({ start: startOfMonth(ref), end: endOfMonth(ref) });

export function txInRange(data: AppData, r: Range, f: PersonFilter = 'all'): Transaction[] {
  return data.transactions.filter((t) => inRange(t.date, r.start, r.end) && matchPerson(t.person, f));
}

export function incomeTotal(data: AppData, r: Range, f: PersonFilter = 'all'): Cents {
  return sum(txInRange(data, r, f).filter(isIncome).map((t) => t.amount));
}

export function spendingTotal(data: AppData, r: Range, f: PersonFilter = 'all'): Cents {
  return sum(txInRange(data, r, f).filter(isSpending).map((t) => t.amount));
}

export function spendingByCategory(data: AppData, r: Range, f: PersonFilter = 'all'): Record<string, Cents> {
  const out: Record<string, Cents> = {};
  for (const t of txInRange(data, r, f).filter(isSpending)) out[t.category] = (out[t.category] ?? 0) + t.amount;
  return out;
}

export function spendingBySubcategory(
  data: AppData,
  r: Range,
  f: PersonFilter = 'all',
): { category: string; subcategory: string; amount: Cents }[] {
  const map = new Map<string, { category: string; subcategory: string; amount: Cents }>();
  for (const t of txInRange(data, r, f).filter(isSpending)) {
    const sub = t.subcategory || 'Uncategorised';
    const k = t.category + '|' + sub;
    const cur = map.get(k) ?? { category: t.category, subcategory: sub, amount: 0 };
    cur.amount += t.amount;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export interface MonthPoint {
  key: string; // YYYY-MM
  income: Cents;
  spending: Cents;
  net: Cents;
}

export function monthlySeries(data: AppData, ref: ISODate, months: number, f: PersonFilter = 'all'): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(startOfMonth(ref), -i, 1);
    const r = monthRange(m);
    const income = incomeTotal(data, r, f);
    const spending = spendingTotal(data, r, f);
    out.push({ key: monthKey(m), income, spending, net: income - spending });
  }
  return out;
}

/** Month-end net position (cash + savings − card debt) — "Financial Progress". */
export function netPositionSeries(data: AppData, ref: ISODate, months: number) {
  const out: { key: string; cash: Cents; savings: Cents; debt: Cents; net: Cents }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(startOfMonth(ref), -i, 1);
    const end = i === 0 ? ref : endOfMonth(m);
    const cash = sum(data.accounts.filter((a) => a.type !== 'savings').map((a) => accountBalance(a, data.transactions, end)));
    const savings = sum(data.accounts.filter((a) => a.type === 'savings').map((a) => accountBalance(a, data.transactions, end)));
    const debt = sum(data.cards.map((c) => cardBalance(c, data.transactions, end)));
    out.push({ key: monthKey(m), cash, savings, debt, net: cash + savings - debt });
  }
  return out;
}

export function cardBalanceSeries(data: AppData, ref: ISODate, months: number) {
  const out: Record<string, string | number>[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = addMonths(startOfMonth(ref), -i, 1);
    const end = i === 0 ? ref : endOfMonth(m);
    const row: Record<string, string | number> = { key: monthKey(m) };
    for (const c of data.cards) row[c.id] = cardBalance(c, data.transactions, end);
    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bills (pending expenses + recurring occurrences + card statements)
// ---------------------------------------------------------------------------

export type BillStatus = 'overdue' | 'due-today' | 'upcoming' | 'paid';

export interface Bill {
  key: string;
  source: 'tx' | 'recurring' | 'card';
  description: string;
  amount: Cents;
  dueDate: ISODate;
  status: BillStatus;
  daysLeft: number;
  category: string;
  subcategory?: string;
  person: Person;
  onCard: boolean; // charged to a credit card -> no cash needed now
  txId?: string;
  ruleId?: string;
  occurrence?: ISODate;
  cardId?: string;
  minimumPayment?: Cents;
}

export function billStatus(dueDate: ISODate, ref: ISODate, paid = false): BillStatus {
  if (paid) return 'paid';
  if (dueDate < ref) return 'overdue';
  if (dueDate === ref) return 'due-today';
  return 'upcoming';
}

export const RECURRING_LOOKBACK_DAYS = 45;

/** Half a period, in days: a payment this close to an occurrence settles it. */
const SETTLE_WINDOW: Record<RecurringRule['frequency'], number> = { weekly: 3, fortnightly: 6, monthly: 14, quarterly: 44, yearly: 180 };

/**
 * An occurrence is settled if it was skipped or has a linked transaction (paid,
 * or a pending one-off edit). Matching uses a window of ±half a period so that
 * correcting a rule's date later doesn't make already-paid bills reappear.
 */
export function isSettled(rule: RecurringRule, occ: ISODate, txs: Transaction[]): boolean {
  const w = SETTLE_WINDOW[rule.frequency];
  const near = (d?: ISODate) => !!d && Math.abs(diffDays(d, occ)) <= w;
  return (rule.skipped ?? []).some(near) || txs.some((t) => t.recurringId === rule.id && (t.occurrence === occ || near(t.occurrence)));
}

/** Expected (not yet confirmed) occurrences of recurring rules in a window. */
export function pendingOccurrences(data: AppData, kind: 'income' | 'expense', r: Range, f: PersonFilter = 'all') {
  const out: { rule: RecurringRule; date: ISODate }[] = [];
  for (const rule of data.recurring) {
    if (rule.kind !== kind || !matchPerson(rule.person, f)) continue;
    for (const d of occurrences(rule.startDate, rule.frequency, r.start, r.end, rule.endDate)) {
      if (!isSettled(rule, d, data.transactions)) out.push({ rule, date: d });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** All unpaid bills due up to `until` (including overdue ones), sorted by due date. */
export function unpaidBills(data: AppData, ref: ISODate, until: ISODate, f: PersonFilter = 'all'): Bill[] {
  const bills: Bill[] = [];

  for (const t of data.transactions) {
    if (t.kind !== 'expense' || t.status !== 'pending' || !matchPerson(t.person, f)) continue;
    const due = t.dueDate ?? t.date;
    if (due > until) continue;
    bills.push({
      key: 'tx:' + t.id,
      source: 'tx',
      description: t.description,
      amount: t.amount,
      dueDate: due,
      status: billStatus(due, ref),
      daysLeft: diffDays(due, ref),
      category: t.category,
      subcategory: t.subcategory,
      person: t.person,
      onCard: false,
      txId: t.id,
    });
  }

  const from = addDays(ref, -RECURRING_LOOKBACK_DAYS);
  for (const { rule, date } of pendingOccurrences(data, 'expense', { start: from, end: until }, f)) {
    bills.push({
      key: `rec:${rule.id}:${date}`,
      source: 'recurring',
      description: rule.description,
      amount: rule.amount,
      dueDate: date,
      status: billStatus(date, ref),
      daysLeft: diffDays(date, ref),
      category: rule.category,
      subcategory: rule.subcategory,
      person: rule.person,
      onCard: !!rule.cardId,
      ruleId: rule.id,
      occurrence: date,
      cardId: rule.cardId,
    });
  }

  for (const c of data.cards) {
    if (!matchPerson(c.owner, f)) continue;
    const st = cardStatement(c, data.transactions, ref);
    if (st.amountDue > 0 && st.dueDate <= until) {
      bills.push({
        key: 'card:' + c.id,
        source: 'card',
        description: `${c.name} statement`,
        amount: st.amountDue,
        dueDate: st.dueDate,
        status: billStatus(st.dueDate, ref),
        daysLeft: diffDays(st.dueDate, ref),
        category: 'Financial',
        subcategory: 'Credit Card Payments',
        person: c.owner,
        onCard: false,
        cardId: c.id,
        minimumPayment: st.minimumPayment,
      });
    }
  }

  return bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Cash needed to clear bills (card-charged subscriptions excluded – the card statement covers them). */
export const cashNeeded = (bills: Bill[]): Cents => sum(bills.filter((b) => !b.onCard).map((b) => b.amount));

/** Bills already paid in a range (expenses with a due date or from a recurring rule, plus card payments). */
export function paidBills(data: AppData, r: Range, f: PersonFilter = 'all'): Transaction[] {
  return txInRange(data, r, f).filter(
    (t) =>
      t.status === 'paid' &&
      ((t.kind === 'expense' && (t.dueDate || t.recurringId)) || t.kind === 'card_payment'),
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function goalProgress(g: Goal) {
  return g.target > 0 ? Math.min(1, g.current / g.target) : 0;
}

/** Projected completion date at the current monthly contribution, or null if never. */
export function goalForecast(g: Goal, ref: ISODate): { date: ISODate | null; months: number | null; onTrack: boolean | null } {
  const remaining = g.target - g.current;
  if (remaining <= 0) return { date: ref, months: 0, onTrack: true };
  if (g.monthlyContribution <= 0) return { date: null, months: null, onTrack: g.deadline ? false : null };
  const months = Math.ceil(remaining / g.monthlyContribution);
  const date = addMonths(ref, months);
  return { date, months, onTrack: g.deadline ? date <= g.deadline : null };
}

/** Monthly amount needed to hit the deadline. */
export function goalRequiredMonthly(g: Goal, ref: ISODate): Cents | null {
  if (!g.deadline) return null;
  const remaining = g.target - g.current;
  if (remaining <= 0) return 0;
  const d1 = parseISO(ref);
  const d2 = parseISO(g.deadline);
  const months = (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + (d2.getUTCMonth() - d1.getUTCMonth());
  return Math.ceil(remaining / Math.max(1, months));
}

// ---------------------------------------------------------------------------
// "How much can we spend?"
// ---------------------------------------------------------------------------

export interface SafeToSpend {
  range: Range;
  cash: Cents; // real money in bank + cash accounts now
  billsDue: Cents; // unpaid bills due up to period end (incl. overdue)
  goalReserve: Cents; // money set aside for goals this period
  plannedPurchases: Cents; // planned purchases with a deadline in the period
  safe: Cents; // cash − bills − goals − planned purchases
  expectedIncome: Cents; // NOT counted in `safe`
  projected: Cents; // safe + expected income (shown separately)
  bills: Bill[];
}

export function safeToSpend(
  data: AppData,
  ref: ISODate,
  period: 'week' | 'month',
  r: Range,
  f: PersonFilter = 'all',
): SafeToSpend {
  const cash = cashAvailable(data, f);
  const bills = unpaidBills(data, ref, r.end, f);
  const billsDue = cashNeeded(bills);
  const monthlyGoals = sum(
    data.goals.filter((g) => matchPerson(g.person, f) && g.current < g.target).map((g) => g.monthlyContribution),
  );
  const goalReserve = period === 'month' ? monthlyGoals : Math.round((monthlyGoals * 12) / 52);
  const plannedPurchases = sum(
    data.purchases
      .filter((p) => p.status !== 'purchased' && p.deadline && p.deadline <= r.end && matchPerson(p.person, f))
      .map((p) => p.price),
  );
  const expectedIncome = sum(
    pendingOccurrences(data, 'income', { start: ref, end: r.end }, f).map((o) => o.rule.amount),
  );
  const safe = cash - billsDue - goalReserve - plannedPurchases;
  return { range: r, cash, billsDue, goalReserve, plannedPurchases, safe, expectedIncome, projected: safe + expectedIncome, bills };
}

/** Can we afford `price` right now without touching bills/goals? */
export function affordability(s: SafeToSpend, price: Cents) {
  const after = s.safe - price;
  const afterProjected = s.projected - price;
  let verdict: 'yes' | 'wait' | 'no';
  if (after >= 0) verdict = 'yes';
  else if (afterProjected >= 0) verdict = 'wait';
  else verdict = 'no';
  return { verdict, after, afterProjected };
}

// ---------------------------------------------------------------------------
// Budgets & couple view
// ---------------------------------------------------------------------------

export const DEFAULT_CYCLE: BudgetCycle = { frequency: 'monthly', anchor: '2026-01-01' };

/** Current budget cycle settings, following a recurring income if one is linked. */
export function effectiveCycle(data: AppData): BudgetCycle {
  const c = data.settings.budgetCycle ?? DEFAULT_CYCLE;
  if (c.incomeRuleId) {
    const rule = data.recurring.find((r) => r.id === c.incomeRuleId);
    if (rule && (rule.frequency === 'weekly' || rule.frequency === 'fortnightly' || rule.frequency === 'monthly')) {
      return { frequency: rule.frequency, anchor: rule.startDate, incomeRuleId: rule.id };
    }
  }
  return c;
}

export interface BudgetPeriod extends Range {
  frequency: BudgetCycle['frequency'];
  nextReset: ISODate; // first day of the next cycle (payday)
  daysLeft: number; // including today
  dayNumber: number; // 1-based day within the cycle
  totalDays: number;
}

export function budgetPeriod(data: AppData, ref: ISODate, offset = 0): BudgetPeriod {
  const c = effectiveCycle(data);
  let r = cycleRange(c.frequency, c.anchor, ref);
  for (let i = 0; i < Math.abs(offset); i++) r = cycleRange(c.frequency, c.anchor, offset > 0 ? addDays(r.end, 1) : addDays(r.start, -1));
  const totalDays = diffDays(r.end, r.start) + 1;
  const clampedRef = ref < r.start ? r.start : ref > r.end ? r.end : ref;
  return {
    ...r,
    frequency: c.frequency,
    nextReset: addDays(r.end, 1),
    daysLeft: ref > r.end ? 0 : ref < r.start ? totalDays : diffDays(r.end, ref) + 1,
    dayNumber: diffDays(clampedRef, r.start) + 1,
    totalDays,
  };
}

/** Convert per-cycle budget amounts when switching cycle (e.g. $600/month -> ~$138/week). */
export function convertBudgets(budgets: Record<string, Cents>, from: BudgetCycle['frequency'], to: BudgetCycle['frequency']): Record<string, Cents> {
  if (from === to) return { ...budgets };
  const perYear = { weekly: 52, fortnightly: 26, monthly: 12 };
  const out: Record<string, Cents> = {};
  for (const [k, v] of Object.entries(budgets)) out[k] = Math.round((v * perYear[from]) / perYear[to] / 100) * 100; // round to whole dollars
  return out;
}

export interface BudgetRow {
  key: string;
  label: string;
  category: string;
  subcategory?: string;
  budget: Cents;
  spent: Cents;
  remaining: Cents;
}

/**
 * Budget vs spending. A budget can be for a whole category or one subcategory.
 * Totals avoid double counting: a subcategory budget is only added to the totals
 * when its parent category has no budget of its own.
 */
export function budgetStatus(data: AppData, r: Range, f: PersonFilter = 'all') {
  const byCat = spendingByCategory(data, r, f);
  const bySub = spendingBySubcategory(data, r, f);
  const rows: BudgetRow[] = Object.entries(data.settings.budgets)
    .filter(([, b]) => b > 0)
    .map(([key, budget]) => {
      const { category, subcategory } = parseBudgetKey(key);
      const spent = subcategory ? sum(bySub.filter((x) => x.category === category && x.subcategory === subcategory).map((x) => x.amount)) : byCat[category] ?? 0;
      return { key, label: subcategory ?? category, category, subcategory, budget, spent, remaining: budget - spent };
    });
  const counted = rows.filter((row) => !row.subcategory || !(data.settings.budgets[row.category] > 0));
  const totalBudget = sum(counted.map((x) => x.budget));
  const totalSpent = sum(counted.map((x) => x.spent));
  return { rows, totalBudget, totalSpent, remaining: totalBudget - totalSpent };
}

/** Who paid for joint costs: joint expenses by funding account/card owner + transfers into joint accounts. */
export function jointContributions(data: AppData, r: Range): Record<'me' | 'patrick' | 'joint', Cents> {
  const out = { me: 0, patrick: 0, joint: 0 };
  const accOwner = new Map(data.accounts.map((a) => [a.id, a.owner]));
  const cardOwner = new Map(data.cards.map((c) => [c.id, c.owner]));
  for (const t of txInRange(data, r)) {
    if (t.kind === 'transfer' && t.status === 'paid' && t.toAccountId && accOwner.get(t.toAccountId) === 'joint') {
      const from = t.accountId ? accOwner.get(t.accountId) : undefined;
      if (from === 'me' || from === 'patrick') out[from] += t.amount;
    } else if (isSpending(t) && t.person === 'joint') {
      const payer = t.cardId ? cardOwner.get(t.cardId) : t.accountId ? accOwner.get(t.accountId) : undefined;
      if (payer) out[payer] += t.amount;
    }
  }
  return out;
}

export function personSummary(data: AppData, r: Range) {
  return (['me', 'patrick', 'joint'] as Person[]).map((p) => ({
    person: p,
    income: incomeTotal(data, r, p),
    spending: spendingTotal(data, r, p),
  }));
}

export { toISO };
