import type { AppData, PersonFilter } from './types';
import {
  accountBalance,
  cardBalance,
  cardStatement,
  goalForecast,
  goalProgress,
  incomeTotal,
  isIncome,
  isSpending,
  jointContributions,
  monthRange,
  monthlySeries,
  spendingByCategory,
  spendingBySubcategory,
  spendingTotal,
  txInRange,
  paidBills,
  type Range,
} from './finance';
import { addDays, addMonths, endOfWeek, formatDate, fyRange, fyStartYear, monthKey, monthLabel, startOfMonth, startOfWeek } from './dates';
import { formatMoney, sum } from './money';
import { categoryNames } from './categories';

export interface Table {
  title: string;
  headers: string[];
  rows: (string | number)[][]; // numbers are cents (rendered as money)
  moneyCols?: number[]; // indexes of columns holding cents
  totalRow?: (string | number)[];
}

export interface Report {
  title: string;
  subtitle: string;
  tables: Table[];
  chart?: { key: string; income: number; spending: number }[];
}

export type ReportId = 'monthly' | 'weekly' | 'income' | 'breakdown' | 'cards' | 'savings' | 'fy' | 'compare' | 'couple';

export const REPORTS: { id: ReportId; label: string }[] = [
  { id: 'monthly', label: 'Monthly Financial Report' },
  { id: 'weekly', label: 'Weekly Spending Report' },
  { id: 'income', label: 'Income Statement' },
  { id: 'breakdown', label: 'Expense Breakdown' },
  { id: 'cards', label: 'Credit Card Report' },
  { id: 'savings', label: 'Savings Report' },
  { id: 'fy', label: 'Australian Financial Year Report' },
  { id: 'compare', label: 'Month vs Month' },
  { id: 'couple', label: 'Couple Report' },
];

const pName = (d: AppData, p: string) => (p === 'me' ? d.settings.myName : p === 'patrick' ? d.settings.partnerName : 'Joint');
const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);

function categoryTable(data: AppData, r: Range, f: PersonFilter, title = 'Spending by category'): Table {
  const cats = spendingByCategory(data, r, f);
  const total = sum(Object.values(cats));
  const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, v, pct(v, total)]);
  return { title, headers: ['Category', 'Amount', 'Share'], rows, moneyCols: [1], totalRow: ['Total', total, rows.length ? '100%' : '—'] };
}

export function buildReport(id: ReportId, data: AppData, ref: string, f: PersonFilter, compareWith?: string): Report {
  const r = monthRange(ref);
  const ml = monthLabel(monthKey(ref));
  switch (id) {
    case 'monthly': {
      const income = incomeTotal(data, r, f);
      const spending = spendingTotal(data, r, f);
      const top = txInRange(data, r, f).filter(isSpending).sort((a, b) => b.amount - a.amount).slice(0, 10);
      const bills = paidBills(data, r, f);
      return {
        title: 'Monthly Financial Report',
        subtitle: ml,
        chart: monthlySeries(data, ref, 6, f),
        tables: [
          { title: 'Summary', headers: ['Item', 'Amount'], moneyCols: [1], rows: [['Income', income], ['Spending', spending], ['Net cash flow', income - spending], ['Savings rate', income ? pct(income - spending, income) : '—']] },
          categoryTable(data, r, f),
          { title: 'Largest expenses', headers: ['Date', 'Description', 'Category', 'Amount'], moneyCols: [3], rows: top.map((t) => [formatDate(t.date), t.description, t.subcategory ?? t.category, t.amount]) },
          { title: 'Bills & card payments made', headers: ['Paid on', 'Description', 'Amount'], moneyCols: [2], rows: bills.map((t) => [formatDate(t.date), t.description, t.amount]), totalRow: ['Total', '', sum(bills.map((t) => t.amount))] },
        ],
      };
    }
    case 'weekly': {
      const rows: (string | number)[][] = [];
      const ws = startOfWeek(ref);
      for (let i = 7; i >= 0; i--) {
        const s = addDays(ws, -7 * i);
        const range = { start: s, end: endOfWeek(s) };
        const cats = spendingByCategory(data, range, f);
        rows.push([`${formatDate(s)} – ${formatDate(range.end)}`, incomeTotal(data, range, f), spendingTotal(data, range, f), ...categoryNames.map((c) => cats[c] ?? 0)]);
      }
      return {
        title: 'Weekly Spending Report',
        subtitle: 'Last 8 weeks (Monday–Sunday)',
        tables: [{ title: 'Weekly totals', headers: ['Week', 'Income', 'Spending', ...categoryNames], rows, moneyCols: [1, 2, ...categoryNames.map((_, i) => i + 3)] }],
      };
    }
    case 'income': {
      const inc = txInRange(data, r, f).filter(isIncome);
      const bySource = new Map<string, number>();
      const byPerson = new Map<string, number>();
      for (const t of inc) {
        bySource.set(t.incomeSource ?? 'Other Income', (bySource.get(t.incomeSource ?? 'Other Income') ?? 0) + t.amount);
        byPerson.set(pName(data, t.person), (byPerson.get(pName(data, t.person)) ?? 0) + t.amount);
      }
      const income = sum(inc.map((t) => t.amount));
      const spending = spendingTotal(data, r, f);
      return {
        title: 'Income Statement',
        subtitle: ml,
        tables: [
          { title: 'Income by source', headers: ['Source', 'Amount'], moneyCols: [1], rows: [...bySource.entries()], totalRow: ['Total income', income] },
          { title: 'Income by person', headers: ['Person', 'Amount'], moneyCols: [1], rows: [...byPerson.entries()] },
          categoryTable(data, r, f, 'Expenses'),
          { title: 'Result', headers: ['', 'Amount'], moneyCols: [1], rows: [['Total income', income], ['Total expenses', spending], [income - spending >= 0 ? 'Surplus' : 'Deficit', income - spending]] },
        ],
      };
    }
    case 'breakdown': {
      const subs = spendingBySubcategory(data, r, f);
      const total = sum(subs.map((s) => s.amount));
      return {
        title: 'Expense Breakdown',
        subtitle: ml,
        tables: [
          categoryTable(data, r, f),
          { title: 'By subcategory', headers: ['Category', 'Subcategory', 'Amount', 'Share'], moneyCols: [2], rows: subs.map((s) => [s.category, s.subcategory, s.amount, pct(s.amount, total)]), totalRow: ['Total', '', total, ''] },
        ],
      };
    }
    case 'cards': {
      const rows = data.cards.map((c) => {
        const st = cardStatement(c, data.transactions, ref > r.end ? r.end : ref);
        const tx = data.transactions.filter((t) => t.cardId === c.id && t.date >= r.start && t.date <= r.end && t.status === 'paid');
        return [
          c.name, c.limit, st.balance, `${Math.round(st.utilisation * 100)}%`, st.statementBalance, st.amountDue, formatDate(st.dueDate),
          sum(tx.filter((t) => t.kind === 'card_purchase').map((t) => t.amount)),
          sum(tx.filter((t) => t.kind === 'card_charge').map((t) => t.amount)),
          sum(tx.filter((t) => t.kind === 'card_payment').map((t) => t.amount)),
        ];
      });
      return {
        title: 'Credit Card Report',
        subtitle: ml,
        tables: [{
          title: 'Cards',
          headers: ['Card', 'Limit', 'Balance', 'Utilisation', 'Statement', 'To pay', 'Due', 'Purchases (month)', 'Interest & fees (month)', 'Payments (month)'],
          moneyCols: [1, 2, 4, 5, 7, 8, 9],
          rows,
          totalRow: ['Total', sum(data.cards.map((c) => c.limit)), sum(data.cards.map((c) => cardBalance(c, data.transactions))), '', '', '', '', '', '', ''],
        }],
      };
    }
    case 'savings': {
      return {
        title: 'Savings Report',
        subtitle: `As of ${formatDate(ref)}`,
        tables: [
          { title: 'Savings accounts', headers: ['Account', 'Balance'], moneyCols: [1], rows: data.accounts.filter((a) => a.type === 'savings').map((a) => [a.name, accountBalance(a, data.transactions)]) },
          {
            title: 'Goals',
            headers: ['Goal', 'Target', 'Saved', 'Progress', 'Monthly', 'Deadline', 'Forecast'],
            moneyCols: [1, 2, 4],
            rows: data.goals.map((g) => {
              const fc = goalForecast(g, ref);
              return [g.name, g.target, g.current, `${Math.round(goalProgress(g) * 100)}%`, g.monthlyContribution, formatDate(g.deadline), fc.date ? formatDate(fc.date) : 'Set a contribution'];
            }),
          },
        ],
      };
    }
    case 'fy': {
      const fy = fyRange(fyStartYear(ref));
      const months: (string | number)[][] = [];
      for (let i = 0; i < 12; i++) {
        const m = addMonths(fy.start, i, 1);
        const mr = monthRange(m);
        const inc = incomeTotal(data, mr, f);
        const sp = spendingTotal(data, mr, f);
        months.push([monthLabel(monthKey(m)), inc, sp, inc - sp]);
      }
      const range = { start: fy.start, end: fy.end };
      const income = incomeTotal(data, range, f);
      const spending = spendingTotal(data, range, f);
      return {
        title: 'Australian Financial Year Report',
        subtitle: `${fy.label} (1 July – 30 June)`,
        chart: months.map((m, i) => ({ key: monthKey(addMonths(fy.start, i, 1)), income: m[1] as number, spending: m[2] as number })),
        tables: [
          { title: 'Month by month', headers: ['Month', 'Income', 'Spending', 'Net'], moneyCols: [1, 2, 3], rows: months, totalRow: ['Total', income, spending, income - spending] },
          categoryTable(data, range, f, 'Spending by category (FY)'),
        ],
      };
    }
    case 'compare': {
      const other = compareWith ?? addMonths(startOfMonth(ref), -1, 1);
      const ra = monthRange(other);
      const a = spendingByCategory(data, ra, f);
      const b = spendingByCategory(data, r, f);
      const la = monthLabel(monthKey(other), true);
      const lb = monthLabel(monthKey(ref), true);
      const cats = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const rows = cats.map((c) => [c, a[c] ?? 0, b[c] ?? 0, (b[c] ?? 0) - (a[c] ?? 0)]);
      const ia = incomeTotal(data, ra, f), ib = incomeTotal(data, r, f);
      const sa = spendingTotal(data, ra, f), sb = spendingTotal(data, r, f);
      return {
        title: `${monthLabel(monthKey(other))} vs ${ml}`,
        subtitle: 'Positive difference = more than the earlier month',
        tables: [
          { title: 'Totals', headers: ['', la, lb, 'Difference'], moneyCols: [1, 2, 3], rows: [['Income', ia, ib, ib - ia], ['Spending', sa, sb, sb - sa], ['Net', ia - sa, ib - sb, ib - sb - (ia - sa)]] },
          { title: 'Spending by category', headers: ['Category', la, lb, 'Difference'], moneyCols: [1, 2, 3], rows },
        ],
      };
    }
    case 'couple': {
      const contrib = jointContributions(data, r);
      const rows = (['me', 'patrick', 'joint'] as const).map((p) => [pName(data, p), incomeTotal(data, r, p), spendingTotal(data, r, p)]);
      return {
        title: 'Couple Report',
        subtitle: ml,
        tables: [
          { title: 'Income & spending by person', headers: ['Person', 'Income', 'Spending'], moneyCols: [1, 2], rows },
          {
            title: 'Contributions to joint costs',
            headers: ['Person', 'Contributed', 'Share'],
            moneyCols: [1],
            rows: [
              [pName(data, 'me'), contrib.me, pct(contrib.me, contrib.me + contrib.patrick)],
              [pName(data, 'patrick'), contrib.patrick, pct(contrib.patrick, contrib.me + contrib.patrick)],
            ],
          },
          {
            title: 'Account balances by owner',
            headers: ['Owner', 'Bank + cash', 'Savings'],
            moneyCols: [1, 2],
            rows: (['me', 'patrick', 'joint'] as const).map((p) => [
              pName(data, p),
              sum(data.accounts.filter((a) => a.owner === p && a.type !== 'savings').map((a) => accountBalance(a, data.transactions))),
              sum(data.accounts.filter((a) => a.owner === p && a.type === 'savings').map((a) => accountBalance(a, data.transactions))),
            ]),
          },
        ],
      };
    }
  }
}

/** Flatten a report into CSV rows (amounts as plain decimal dollars). */
export function reportToCSVRows(rep: Report): (string | number)[][] {
  const out: (string | number)[][] = [[rep.title], [rep.subtitle], []];
  for (const t of rep.tables) {
    out.push([t.title], t.headers);
    const fmt = (row: (string | number)[]) => row.map((v, i) => (t.moneyCols?.includes(i) && typeof v === 'number' ? (v / 100).toFixed(2) : v));
    for (const row of t.rows) out.push(fmt(row));
    if (t.totalRow) out.push(fmt(t.totalRow));
    out.push([]);
  }
  return out;
}

export const money = (v: number) => formatMoney(v);
