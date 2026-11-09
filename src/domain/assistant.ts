import type { AppData, ISODate, PersonFilter } from './types';
import {
  affordability,
  budgetStatus,
  cardStatement,
  cashAvailable,
  cashNeeded,
  goalForecast,
  incomeTotal,
  matchPerson,
  monthRange,
  monthlySeries,
  pendingOccurrences,
  safeToSpend,
  savingsBalance,
  spendingByCategory,
  spendingBySubcategory,
  spendingTotal,
  totalCardDebt,
  unpaidBills,
  type Range,
} from './finance';
import { addDays, addMonths, endOfWeek, formatDate, fyRange, fyStartYear, monthKey, monthLabel, startOfMonth } from './dates';
import { formatMoney, parseMoney, sum } from './money';
import { EXPENSE_CATEGORIES } from './categories';

/**
 * Rule-based assistant: recognises the question type, then computes the answer
 * ONLY from recorded data. It never guesses — if data is missing it says so.
 */
export interface Answer {
  text: string;
  bullets?: string[];
  missing?: string;
}

const $ = (c: number) => formatMoney(c);

function periodFrom(q: string, ref: ISODate): { range: Range; label: string } {
  if (/last month/.test(q)) {
    const m = addMonths(startOfMonth(ref), -1, 1);
    return { range: monthRange(m), label: monthLabel(monthKey(m)) };
  }
  if (/financial year|\bfy\b|this year/.test(q)) {
    const fy = fyRange(fyStartYear(ref));
    return { range: { start: fy.start, end: fy.end }, label: fy.label };
  }
  if (/this week|week/.test(q)) return { range: { start: addDays(endOfWeek(ref), -6), end: endOfWeek(ref) }, label: 'this week' };
  return { range: monthRange(ref), label: `this month (${monthLabel(monthKey(ref))})` };
}

export function answer(question: string, data: AppData, ref: ISODate, f: PersonFilter = 'all'): Answer {
  const q = question.toLowerCase().trim();
  const noAccounts = data.accounts.length === 0;
  const missingAccounts = 'No bank accounts recorded yet — add them under Accounts so I can calculate balances.';

  if (!q) return { text: 'Ask me something about your money, e.g. “How much did we spend on groceries?”' };

  // Can we afford X?
  if (/afford|can we buy|can i buy/.test(q)) {
    const m = q.match(/\$?\s?(\d[\d,]*(?:\.\d{1,2})?)/);
    const price = m ? parseMoney(m[1]) : null;
    if (noAccounts) return { text: 'I can’t check affordability yet.', missing: missingAccounts };
    const s = safeToSpend(data, ref, 'month', { start: ref, end: monthRange(ref).end }, f);
    if (!price) return { text: `Tell me the price, e.g. “Can we afford $450?”. Right now you can safely spend ${$(s.safe)} until ${formatDate(s.range.end)}.` };
    const a = affordability(s, price);
    const verdict = { yes: `Yes — after paying ${$(price)} you'd still have ${$(a.after)} safe to spend this month.`, wait: `Not yet. It fits only after expected income (${$(s.expectedIncome)}) arrives, leaving ${$(a.afterProjected)}.`, no: `No — even with expected income you'd be ${$(-a.afterProjected)} short for bills and goals.` }[a.verdict];
    return { text: verdict, bullets: [`Cash now: ${$(s.cash)}`, `Bills due this month: ${$(s.billsDue)}`, `Goal savings reserved: ${$(s.goalReserve)}`, `Planned purchases due: ${$(s.plannedPurchases)}`] };
  }

  // Spent on <category>?
  if (/spen[dt]|cost|paid for/.test(q) && !/more than|than we earn/.test(q)) {
    const { range, label } = periodFrom(q, ref);
    const subs = Object.entries(EXPENSE_CATEGORIES).flatMap(([c, s]) => s.map((x) => ({ c, s: x })));
    const aliases: Record<string, string> = { food: 'Groceries', grocery: 'Groceries', groceries: 'Groceries', petrol: 'Fuel', uber: 'Transportation', transport: 'Transportation', rent: 'Rent', coffee: 'Coffee', restaurant: 'Restaurants', eating: 'Restaurants', brazil: 'Brazil Expenses', uni: 'University Tuition', university: 'Education', subscription: 'Subscriptions' };
    const cat = Object.keys(EXPENSE_CATEGORIES).find((c) => q.includes(c.toLowerCase()));
    const sub = subs.find((x) => q.includes(x.s.toLowerCase()));
    const alias = Object.entries(aliases).find(([k]) => new RegExp(`\\b${k}`).test(q))?.[1];
    const target = sub?.s ?? cat ?? alias;
    if (target) {
      const isCat = target in EXPENSE_CATEGORIES;
      const total = isCat ? spendingByCategory(data, range, f)[target] ?? 0 : sum(spendingBySubcategory(data, range, f).filter((s) => s.subcategory === target).map((s) => s.amount));
      if (total === 0) return { text: `I found no ${target} spending recorded for ${label}.`, missing: 'If you did spend on this, it hasn’t been recorded (or was put in a different category).' };
      return { text: `You spent ${$(total)} on ${target} ${label}.`, bullets: isCat ? spendingBySubcategory(data, range, f).filter((s) => s.category === target).map((s) => `${s.subcategory}: ${$(s.amount)}`) : undefined };
    }
    const total = spendingTotal(data, range, f);
    const cats = Object.entries(spendingByCategory(data, range, f)).sort((a, b) => b[1] - a[1]);
    return { text: `Total spending ${label}: ${$(total)}.`, bullets: cats.map(([c, v]) => `${c}: ${$(v)}`), missing: cats.length ? undefined : 'No spending recorded for this period.' };
  }

  if (/available|how much (money )?(do )?we have|balance|money do we have/.test(q)) {
    if (noAccounts) return { text: 'I don’t know your balance yet.', missing: missingAccounts };
    const cash = cashAvailable(data, f);
    const s = safeToSpend(data, ref, 'month', { start: ref, end: monthRange(ref).end }, f);
    return {
      text: `You have ${$(cash)} in bank and cash accounts right now. After bills, card statements and goal savings, ${$(s.safe)} is safe to spend until ${formatDate(s.range.end)}.`,
      bullets: [`Savings: ${$(savingsBalance(data, f))}`, `Credit card debt: ${$(totalCardDebt(data, f))} (credit limits are not counted as money)`],
    };
  }

  if (/pay this week|due this week|bills? (this|next) week|need to pay/.test(q)) {
    const end = /next week/.test(q) ? addDays(endOfWeek(ref), 7) : endOfWeek(ref);
    const bills = unpaidBills(data, ref, end, f);
    if (!bills.length) return { text: `Nothing to pay up to ${formatDate(end)} (including overdue). 🎉`, missing: data.recurring.length ? undefined : 'Tip: add recurring bills so I can see them coming.' };
    return { text: `You need ${$(cashNeeded(bills))} to cover ${bills.length} bill(s) up to ${formatDate(end)}.`, bullets: bills.map((b) => `${b.description} — ${$(b.amount)} — ${b.status === 'overdue' ? 'OVERDUE since' : 'due'} ${formatDate(b.dueDate)}${b.onCard ? ' (charged to card)' : ''}`) };
  }

  if (/credit card|card debt|owe/.test(q)) {
    if (!data.cards.length) return { text: 'No credit cards recorded.', missing: 'Add your cards under Cards to track debt.' };
    const cards = data.cards.filter((c) => matchPerson(c.owner, f));
    return {
      text: `Total credit card debt: ${$(totalCardDebt(data, f))}.`,
      bullets: cards.map((c) => {
        const s = cardStatement(c, data.transactions, ref);
        return `${c.name}: ${$(s.balance)} owed (${Math.round(s.utilisation * 100)}% of limit)${s.amountDue ? ` — ${$(s.amountDue)} due ${formatDate(s.dueDate)}` : ''}`;
      }),
    };
  }

  if (/more than (we )?earn|than we earn|overspend|spending more/.test(q)) {
    const series = monthlySeries(data, ref, 3, f);
    if (series.every((m) => m.income === 0 && m.spending === 0)) return { text: 'Not enough data yet.', missing: 'Record income and expenses for at least one month.' };
    const cur = series[series.length - 1];
    return {
      text: cur.net >= 0 ? `No — this month you've earned ${$(cur.income)} and spent ${$(cur.spending)} (surplus ${$(cur.net)}).` : `Yes — this month spending (${$(cur.spending)}) is ${$(-cur.net)} more than income (${$(cur.income)}).`,
      bullets: series.map((m) => `${monthLabel(m.key)}: in ${$(m.income)}, out ${$(m.spending)}, net ${$(m.net)}`),
    };
  }

  if (/save|saving/.test(q)) {
    if (noAccounts) return { text: 'I can’t suggest savings yet.', missing: missingAccounts };
    const s = safeToSpend(data, ref, 'month', { start: ref, end: monthRange(ref).end }, f);
    const goals = data.goals.filter((g) => matchPerson(g.person, f) && g.current < g.target);
    return {
      text: `Your goals need ${$(s.goalReserve)} this month (already reserved). ${s.projected > 0 ? `If expected income arrives, up to ${$(s.projected)} more could go to savings after bills.` : 'There is no extra room this month after bills.'}`,
      bullets: goals.map((g) => {
        const fc = goalForecast(g, ref);
        return `${g.name}: ${$(g.monthlyContribution)}/month → ${fc.date ? `done ~${formatDate(fc.date)}` : 'no forecast (no contribution set)'}${fc.onTrack === false ? ' (behind deadline)' : ''}`;
      }),
      missing: goals.length ? undefined : 'No active goals — create one under Goals.',
    };
  }

  if (/income|earn|salary|received/.test(q)) {
    const { range, label } = periodFrom(q, ref);
    const inc = incomeTotal(data, range, f);
    const expected = pendingOccurrences(data, 'income', { start: ref, end: range.end }, f);
    return { text: `Income received ${label}: ${$(inc)}.`, bullets: expected.length ? [`Still expected (not counted): ${$(sum(expected.map((e) => e.rule.amount)))}`] : undefined, missing: inc ? undefined : 'No confirmed income recorded for this period.' };
  }

  return {
    text: 'I can answer questions about your recorded data. Try:',
    bullets: SUGGESTIONS,
  };
}

export const SUGGESTIONS = [
  'How much money do we have available?',
  'How much do we need to pay this week?',
  'How much did we spend on groceries?',
  'How much credit card debt do we have?',
  'Are we spending more than we earn?',
  'Can we afford $500?',
  'How much should we save this month?',
];

export interface Alert {
  level: 'critical' | 'warning' | 'info';
  text: string;
}

export function alerts(data: AppData, ref: ISODate, f: PersonFilter = 'all'): Alert[] {
  const out: Alert[] = [];
  const bills = unpaidBills(data, ref, addDays(ref, 3), f);
  for (const b of bills) {
    if (b.status === 'overdue') out.push({ level: 'critical', text: `${b.description} (${$(b.amount)}) is overdue since ${formatDate(b.dueDate)}.` });
    else out.push({ level: 'warning', text: `${b.description} (${$(b.amount)}) is due ${b.daysLeft === 0 ? 'today' : `in ${b.daysLeft} day(s)`}.` });
  }
  for (const r of budgetStatus(data, monthRange(ref), f).rows) {
    if (r.spent > r.budget) out.push({ level: 'warning', text: `${r.category} is over budget by ${$(r.spent - r.budget)} this month.` });
    else if (r.spent > r.budget * 0.85) out.push({ level: 'info', text: `${r.category} has used ${Math.round((r.spent / r.budget) * 100)}% of its budget.` });
  }
  for (const c of data.cards.filter((c) => matchPerson(c.owner, f))) {
    const s = cardStatement(c, data.transactions, ref);
    if (s.utilisation >= 0.7) out.push({ level: s.utilisation >= 0.9 ? 'critical' : 'warning', text: `${c.name} is at ${Math.round(s.utilisation * 100)}% of its limit.` });
  }
  const series = monthlySeries(data, ref, 3, f);
  for (const m of series.slice(0, -1)) if (m.net < 0) out.push({ level: 'warning', text: `${monthLabel(m.key)} had negative cash flow (${$(m.net)}).` });
  const cur = series[series.length - 1];
  if (cur && cur.net < 0) out.push({ level: 'info', text: `So far this month spending is ${$(-cur.net)} above income.` });
  for (const g of data.goals.filter((g) => matchPerson(g.person, f))) {
    if (goalForecast(g, ref).onTrack === false) out.push({ level: 'info', text: `Goal “${g.name}” is behind its deadline at the current contribution.` });
  }
  if (data.accounts.length) {
    const s = safeToSpend(data, ref, 'month', { start: ref, end: monthRange(ref).end }, f);
    if (s.safe < 0) out.push({ level: 'critical', text: `Bills and commitments this month exceed available money by ${$(-s.safe)}.` });
  }
  const late = pendingOccurrences(data, 'income', { start: addDays(ref, -14), end: addDays(ref, -1) }, f);
  for (const o of late) out.push({ level: 'info', text: `${o.rule.description} expected ${formatDate(o.date)} hasn't been confirmed as received.` });
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
