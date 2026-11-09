import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import {
  budgetStatus,
  cardBalanceSeries,
  cashAvailable,
  incomeTotal,
  monthRange,
  monthlySeries,
  netPositionSeries,
  safeToSpend,
  savingsBalance,
  spendingByCategory,
  spendingTotal,
  totalCardDebt,
} from '../domain/finance';
import { endOfMonth, formatDate, monthKey, monthLabel, today } from '../domain/dates';
import { Empty, Money, PageHeader, Section, Stat, StatusBadge } from '../components/ui';
import { CategoryChart, IncomeExpenseChart, LinesChart, MonthlySpendingChart, SERIES } from '../components/charts';
import { Welcome } from '../components/Welcome';

export default function Dashboard() {
  const { data, person, month, openQuickAdd } = useStore();
  const ref = today();
  const isCurrent = monthKey(month) === monthKey(ref);

  const m = useMemo(() => {
    const r = monthRange(month);
    const income = incomeTotal(data, r, person);
    const spending = spendingTotal(data, r, person);
    // "Upcoming bills" & safe-to-spend look from today to the end of the selected month
    const s2s = safeToSpend(data, ref, 'month', { start: ref, end: endOfMonth(isCurrent || month < ref ? ref : month) }, person);
    const budget = budgetStatus(data, r, person);
    const cats = Object.entries(spendingByCategory(data, r, person))
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    return {
      income,
      spending,
      cash: cashAvailable(data, person),
      savings: savingsBalance(data, person),
      debt: totalCardDebt(data, person),
      s2s,
      budget,
      cats,
      series: monthlySeries(data, month, 6, person),
      net: netPositionSeries(data, isCurrent ? ref : endOfMonth(month), 6),
      cardSeries: cardBalanceSeries(data, isCurrent ? ref : endOfMonth(month), 6),
    };
  }, [data, person, month, ref, isCurrent]);

  const empty = data.accounts.length === 0 && data.transactions.length === 0;
  if (empty) return <Welcome />;

  const committed = m.s2s.billsDue + m.s2s.goalReserve + m.s2s.plannedPurchases;
  const flow = m.income - m.spending;
  const canSave = Math.max(0, m.s2s.projected);

  return (
    <div className="space-y-4">
      <PageHeader
        title={isCurrent ? 'Good to see you 👋' : monthLabel(monthKey(month))}
        subtitle={isCurrent ? `Here's where you stand today, ${formatDate(ref)}` : 'Viewing a past/future month'}
        actions={<button className="btn-primary hidden lg:inline-flex" onClick={() => openQuickAdd('expense')}>+ Add Transaction</button>}
      />

      {/* Hero: safe to spend */}
      <div className="card bg-gradient-to-br from-brand-600 to-brand-700 text-white dark:from-brand-700 dark:to-slate-900">
        <div className="text-sm opacity-80">Safe to spend until {formatDate(m.s2s.range.end)}</div>
        <Money cents={m.s2s.safe} className="text-4xl font-bold" />
        <div className="mt-1 text-sm opacity-80">
          After bills, card statements, goal savings and planned purchases. Expected income (<Money cents={m.s2s.expectedIncome} />) is <b>not</b> included until it arrives.
        </div>
        <Link to="/week" className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">How much can we spend? →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Income this month" value={m.income} tone="good" icon="arrowDown" />
        <Stat label="Expenses this month" value={m.spending} icon="arrowUp" hint="Card payments & transfers excluded" />
        <Stat label="Available balance" value={m.cash} icon="wallet" hint="Bank + cash only" />
        <Stat label="Upcoming bills" value={m.s2s.billsDue} tone={m.s2s.bills.some((b) => b.status === 'overdue') ? 'bad' : 'warn'} icon="calendar" hint={`${m.s2s.bills.length} to pay by ${formatDate(m.s2s.range.end)}`} />
        <Stat label="Credit card debt" value={m.debt} tone={m.debt > 0 ? 'bad' : 'default'} icon="card" hint="Not available money" />
        <Stat label="Savings" value={m.savings} tone="good" icon="target" hint="Savings accounts" />
        <Stat label="Remaining budget" value={m.budget.remaining} tone={m.budget.remaining < 0 ? 'bad' : 'default'} icon="wallet" hint={m.budget.totalBudget ? `of ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(m.budget.totalBudget / 100)} budgeted` : <Link className="text-brand-600" to="/budgets">Set budgets →</Link>} />
        <Stat label="Monthly cash flow" value={flow} tone={flow >= 0 ? 'good' : 'bad'} icon="chart" hint="Income − expenses" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Section title="Financial Health" className="lg:col-span-2">
          <dl className="space-y-2.5 text-sm">
            <Row label="Money we have now" value={m.cash} hint="Real bank + cash balance" />
            <Row label="Already committed" value={-committed} hint="Bills + goal savings + planned buys" />
            <Row label="Still to pay (cards, total)" value={-m.debt} hint="Full credit card debt" />
            <div className="border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <Row label="We can spend safely" value={m.s2s.safe} strong />
            </div>
            <Row label="We could save this month" value={canSave} hint="Safe amount + expected income" />
          </dl>
          <p className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs muted dark:bg-slate-800/60">
            {m.s2s.safe < 0
              ? '⚠️ Bills and commitments are bigger than the money available now. Prioritise essential bills and wait for income.'
              : flow < 0
                ? '⚠️ You are spending more than you earn this month.'
                : '✅ Bills are covered by the money you already have.'}
          </p>
        </Section>

        <Section title="Upcoming bills" className="lg:col-span-3" action={<Link to="/bills" className="text-sm font-medium text-brand-600">See all</Link>}>
          {m.s2s.bills.length === 0 ? (
            <Empty icon="calendar" title="No bills due" text="Nothing pending for the rest of this month. Add a bill to track due dates." action={<button className="btn-secondary" onClick={() => openQuickAdd('bill')}>Add Bill</button>} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {m.s2s.bills.slice(0, 6).map((b) => (
                <li key={b.key} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.description}</div>
                    <div className="text-xs muted">{formatDate(b.dueDate)} · {b.daysLeft === 0 ? 'today' : b.daysLeft > 0 ? `in ${b.daysLeft}d` : `${-b.daysLeft}d late`}{b.onCard ? ' · on card' : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={b.status} />
                    <Money cents={b.amount} className="text-sm font-semibold" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Income vs Expenses (6 months)">
          <IncomeExpenseChart data={m.series} />
        </Section>
        <Section title={`Expenses by category — ${monthLabel(monthKey(month))}`}>
          {m.cats.length ? <CategoryChart data={m.cats} /> : <Empty icon="chart" title="No spending yet" text="Expenses you add this month will be grouped here by category." />}
        </Section>
        <Section title="Monthly spending">
          <MonthlySpendingChart data={m.series} />
        </Section>
        <Section title="Financial progress (cash + savings − card debt)">
          <LinesChart data={m.net} series={[{ key: 'net', name: 'Net position', color: 'var(--s1)' }]} />
        </Section>
        {data.cards.length > 0 && (
          <Section title="Credit card balance evolution" className="lg:col-span-2">
            <LinesChart data={m.cardSeries} series={data.cards.slice(0, 8).map((c, i) => ({ key: c.id, name: c.name, color: SERIES[i] }))} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <dt className={strong ? 'font-semibold' : ''}>{label}</dt>
        {hint && <dd className="text-xs muted">{hint}</dd>}
      </div>
      <Money cents={value} className={`${strong ? 'text-lg font-bold' : 'font-medium'} ${value < 0 ? 'text-red-600 dark:text-red-400' : ''}`} />
    </div>
  );
}
