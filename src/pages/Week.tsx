import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import {
  accountBalance,
  cashNeeded,
  isIncome,
  isSpending,
  matchPerson,
  monthRange,
  pendingOccurrences,
  safeToSpend,
  txInRange,
} from '../domain/finance';
import { addDays, endOfWeek, formatDate, startOfWeek, today } from '../domain/dates';
import { sum } from '../domain/money';
import { Money, PageHeader, Section, Segmented, Stat, StatusBadge } from '../components/ui';
import { AffordCheck } from '../components/AffordCheck';
import { Icon } from '../components/Icon';

export default function Week() {
  const { data, person } = useStore();
  const ref = today();
  const [offset, setOffset] = useState(0);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const wStart = addDays(startOfWeek(ref), offset * 7);
  const wEnd = endOfWeek(wStart);
  const isThisWeek = offset === 0;

  const w = useMemo(() => {
    const accounts = data.accounts.filter((a) => a.type !== 'savings' && matchPerson(a.owner, person));
    const startCash = sum(accounts.map((a) => accountBalance(a, data.transactions, addDays(wStart, -1))));
    const txs = txInRange(data, { start: wStart, end: wEnd }, person);
    const received = txs.filter(isIncome);
    const spent = txs.filter(isSpending);
    const expected = pendingOccurrences(data, 'income', { start: wStart < ref ? ref : wStart, end: wEnd }, person);
    const s2sWeek = safeToSpend(data, ref, 'week', { start: ref, end: wEnd < ref ? ref : wEnd }, person);
    const billsThisWeek = s2sWeek.bills.filter((b) => b.dueDate >= wStart || b.status === 'overdue');
    const plans = data.purchases.filter((p) => p.status !== 'purchased' && p.deadline && p.deadline >= wStart && p.deadline <= wEnd && matchPerson(p.person, person));
    const nowCash = sum(accounts.map((a) => accountBalance(a, data.transactions)));
    const projectedEnd = nowCash + sum(expected.map((e) => e.rule.amount)) - cashNeeded(billsThisWeek) - sum(plans.map((p) => p.price));
    return { startCash, received, spent, expected, billsThisWeek, plans, projectedEnd };
  }, [data, person, wStart, wEnd, ref]);

  const s2s = useMemo(
    () => safeToSpend(data, ref, period, period === 'week' ? { start: ref, end: endOfWeek(ref) } : { start: ref, end: monthRange(ref).end }, person),
    [data, ref, period, person],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Our Week"
        subtitle={`${formatDate(wStart)} – ${formatDate(wEnd)}`}
        actions={
          <div className="flex items-center gap-1">
            <button className="btn-secondary px-2" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}><Icon name="chevronLeft" className="h-4 w-4" /></button>
            <button className="btn-secondary" onClick={() => setOffset(0)} disabled={isThisWeek}>This week</button>
            <button className="btn-secondary px-2" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}><Icon name="chevronRight" className="h-4 w-4" /></button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Money at start of week" value={w.startCash} icon="wallet" />
        <Stat label="Income received" value={sum(w.received.map((t) => t.amount))} tone="good" icon="arrowDown" />
        <Stat label="Salaries still expected" value={sum(w.expected.map((e) => e.rule.amount))} icon="repeat" hint="Not counted until received" />
        <Stat label="Bills to pay" value={cashNeeded(w.billsThisWeek)} tone="warn" icon="calendar" hint={`${w.billsThisWeek.length} incl. overdue`} />
        <Stat label="Spent this week" value={sum(w.spent.map((t) => t.amount))} icon="arrowUp" />
        <Stat label="Projected end of week" value={w.projectedEnd} tone={w.projectedEnd < 0 ? 'bad' : 'default'} icon="chart" hint="If expected income arrives & bills are paid" />
      </div>

      <Section title="How Much Can We Spend?" action={<Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <dl className="space-y-1.5 text-sm">
              <Line label="Current bank + cash balance" v={s2s.cash} />
              <Line label="− Unpaid bills & card statements due" v={-s2s.billsDue} />
              <Line label={`− Goal savings for the ${period}`} v={-s2s.goalReserve} />
              <Line label="− Planned purchases due" v={-s2s.plannedPurchases} />
              <div className="border-t border-slate-200 pt-2 dark:border-slate-700"><Line label="= Safe to spend" v={s2s.safe} strong /></div>
              <Line label="Expected income (not yet available)" v={s2s.expectedIncome} muted />
              <Line label="Safe to spend if it arrives" v={s2s.projected} muted />
            </dl>
            <p className="mt-3 text-xs muted">Credit card limits are never counted as money. Expected salaries only count once you confirm them.</p>
          </div>
          <div className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-600/15">
            <div className="text-sm muted">You can safely spend until {formatDate(s2s.range.end)}</div>
            <Money cents={Math.max(0, s2s.safe)} className="text-4xl font-bold" />
            {s2s.safe < 0 && <div className="mt-1 text-sm text-red-600">Short by <Money cents={-s2s.safe} /> — hold off on non-essential spending.</div>}
            {s2s.safe > 0 && <div className="mt-1 text-sm muted">≈ <Money cents={Math.floor(s2s.safe / Math.max(1, (Date.parse(s2s.range.end) - Date.parse(ref)) / 86400000 + 1))} /> per day</div>}
            <div className="mt-4 text-sm font-medium">Check a purchase</div>
            <div className="mt-1"><AffordCheck s2s={s2s} /></div>
          </div>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Bills due">
          {w.billsThisWeek.length === 0 ? <p className="text-sm muted">No bills due.</p> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {w.billsThisWeek.map((b) => (
                <li key={b.key} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{b.description} <span className="text-xs muted">· {formatDate(b.dueDate)}</span></span>
                  <span className="flex items-center gap-2"><StatusBadge status={b.status} /><Money cents={b.amount} className="font-medium" /></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Expected salaries & planned purchases">
          {w.expected.length === 0 && w.plans.length === 0 ? <p className="text-sm muted">Nothing expected.</p> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {w.expected.map((e) => (
                <li key={e.rule.id + e.date} className="flex justify-between py-2"><span>{e.rule.description} <span className="text-xs muted">· {formatDate(e.date)}</span></span><Money cents={e.rule.amount} signed className="font-medium text-emerald-600" /></li>
              ))}
              {w.plans.map((p) => (
                <li key={p.id} className="flex justify-between py-2"><span>🛍 {p.name}</span><Money cents={-p.price} className="font-medium" /></li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Spending this week" className="lg:col-span-2">
          {w.spent.length === 0 ? <p className="text-sm muted">No spending recorded.</p> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {w.spent.sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                <li key={t.id} className="flex justify-between py-2"><span className="truncate">{t.description} <span className="text-xs muted">· {formatDate(t.date)} · {t.subcategory ?? t.category}</span></span><Money cents={t.amount} className="font-medium" /></li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Line({ label, v, strong, muted }: { label: string; v: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? 'muted' : ''}`}>
      <dt className={strong ? 'font-semibold' : ''}>{label}</dt>
      <Money cents={v} className={strong ? 'text-lg font-bold' : 'font-medium'} />
    </div>
  );
}
