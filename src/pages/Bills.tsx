import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { cashNeeded, paidBills, unpaidBills, type Bill } from '../domain/finance';
import { addDays, endOfMonth, endOfWeek, formatDate, monthKey, monthLabel, parseISO, startOfMonth, today } from '../domain/dates';
import { sum } from '../domain/money';
import { skipOccurrence } from '../store/actions';
import { Badge, Empty, Money, PageHeader, Section, Segmented, Stat, StatusBadge } from '../components/ui';
import { SettleDialog, type SettleTarget } from '../components/SettleDialog';
import { BillEditDialog, type BillEditTarget } from '../components/BillEditDialog';
import { Icon } from '../components/Icon';

export default function Bills() {
  const { data, update, person, month, openQuickAdd } = useStore();
  const ref = today();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const [editing, setEditing] = useState<BillEditTarget | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthEnd = endOfMonth(month < ref ? ref : month);
  const { bills, weekBills, monthBills, paid } = useMemo(() => {
    const bills = unpaidBills(data, ref, monthEnd, person);
    return {
      bills,
      weekBills: bills.filter((b) => b.dueDate <= endOfWeek(ref)),
      monthBills: bills.filter((b) => b.dueDate <= endOfMonth(ref)),
      paid: paidBills(data, { start: startOfMonth(month), end: endOfMonth(month) }, person),
    };
  }, [data, ref, monthEnd, person, month]);

  const overdue = bills.filter((b) => b.status === 'overdue');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bills Calendar"
        subtitle="Everything we need to pay. You confirm every payment — nothing is paid automatically."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} />
            <button className="btn-primary" onClick={() => openQuickAdd('bill')}>+ Add Bill</button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Needed this week" value={cashNeeded(weekBills)} tone="warn" icon="calendar" hint={`${weekBills.length} bills by ${formatDate(endOfWeek(ref))}`} />
        <Stat label="Needed this month" value={cashNeeded(monthBills)} icon="calendar" hint={`${monthBills.length} bills by ${formatDate(endOfMonth(ref))}`} />
        <Stat label="Overdue" value={sum(overdue.map((b) => b.amount))} tone={overdue.length ? 'bad' : 'good'} icon="alert" hint={`${overdue.length} bill${overdue.length === 1 ? '' : 's'}`} />
        <Stat label={`Paid in ${monthLabel(monthKey(month), true)}`} value={sum(paid.map((t) => t.amount))} tone="good" icon="check" hint={`${paid.length} payments`} />
      </div>

      {view === 'calendar' ? (
        <Calendar month={month} bills={bills} paid={paid.map((t) => ({ date: t.date, amount: t.amount, description: t.description }))} selected={selectedDay} onSelect={setSelectedDay} onSettle={(b) => setSettle({ type: 'bill', bill: b })} onEdit={(b) => setEditing({ type: 'bill', bill: b })} />
      ) : (
        <Section title={`To pay (through ${formatDate(monthEnd)})`}>
          {bills.length === 0 ? (
            <Empty icon="calendar" title="All clear 🎉" text="No unpaid bills. Add rent, utilities or subscriptions as recurring bills so they show up here automatically." action={<button className="btn-primary" onClick={() => openQuickAdd('bill')}>Add Bill</button>} />
          ) : (
            <BillList bills={bills} onSettle={(b) => setSettle({ type: 'bill', bill: b })} onEdit={(b) => setEditing({ type: 'bill', bill: b })} onSkip={(b) => update((d) => skipOccurrence(d, b.ruleId!, b.occurrence!), 'Skipped this occurrence')} />
          )}
        </Section>
      )}

      <Section title={`Paid — ${monthLabel(monthKey(month))}`}>
        {paid.length === 0 ? (
          <p className="text-sm muted">No bills paid yet this month.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {paid.sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.description}</div>
                  <div className="text-xs muted">Paid {formatDate(t.date)}{t.dueDate && t.dueDate !== t.date ? ` · due ${formatDate(t.dueDate)}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="paid" /><Money cents={t.amount} className="font-semibold" />
                  <button className="btn-ghost p-1.5" onClick={() => setEditing({ type: 'paid', tx: t })} aria-label={`Edit ${t.description}`}><Icon name="edit" className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <SettleDialog target={settle} onClose={() => setSettle(null)} />
      <BillEditDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function BillList({ bills, onSettle, onSkip, onEdit }: { bills: Bill[]; onSettle: (b: Bill) => void; onSkip?: (b: Bill) => void; onEdit?: (b: Bill) => void }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {bills.map((b) => (
        <li key={b.key} className="py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{b.description}</span>
                {b.source === 'recurring' && <Icon name="repeat" className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              </div>
              <div className="text-xs muted">
                {formatDate(b.dueDate)} ·{' '}
                <span className={b.status === 'overdue' ? 'font-medium text-red-600' : ''}>
                  {b.daysLeft === 0 ? 'due today' : b.daysLeft > 0 ? `${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left` : `${-b.daysLeft} day${b.daysLeft === -1 ? '' : 's'} overdue`}
                </span>
                {b.minimumPayment !== undefined && <> · min <Money cents={b.minimumPayment} /></>}
              </div>
            </div>
            <Money cents={b.amount} className="font-semibold" />
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={b.status} />
            {b.onCard && <Badge>charged to card</Badge>}
            <div className="ml-auto flex gap-1">
              {onEdit && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onEdit(b)} aria-label={`Edit ${b.description}`}><Icon name="edit" className="h-3.5 w-3.5" />Edit</button>}
              {b.source === 'recurring' && onSkip && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => onSkip(b)} title="Skip this occurrence">Skip</button>}
              <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => onSettle(b)}>
                <Icon name="check" className="h-3.5 w-3.5" />{b.source === 'card' ? 'Pay' : 'Paid'}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Calendar({ month, bills, paid, selected, onSelect, onSettle, onEdit }: {
  month: string;
  bills: Bill[];
  paid: { date: string; amount: number; description: string }[];
  selected: string | null;
  onSelect: (d: string | null) => void;
  onSettle: (b: Bill) => void;
  onEdit: (b: Bill) => void;
}) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const lead = (parseISO(start).getUTCDay() + 6) % 7; // Monday-first
  const days: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const t = today();
  const dayBills = selected ? bills.filter((b) => b.dueDate === selected) : [];
  const dayPaid = selected ? paid.filter((p) => p.date === selected) : [];

  return (
    <Section title={monthLabel(monthKey(month))}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={'x' + i} />;
          const due = bills.filter((b) => b.dueDate === d);
          const pd = paid.filter((p) => p.date === d);
          const hasOverdue = due.some((b) => b.status === 'overdue');
          return (
            <button
              key={d}
              onClick={() => onSelect(selected === d ? null : d)}
              className={`flex min-h-[3.5rem] flex-col items-center rounded-xl border p-1 text-xs transition ${selected === d ? 'border-brand-500 bg-brand-50 dark:bg-brand-600/15' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'} ${d === t ? 'font-bold text-brand-600' : ''}`}
              aria-label={`${formatDate(d)}: ${due.length} due, ${pd.length} paid`}
            >
              <span>{Number(d.slice(8))}</span>
              <div className="mt-auto flex flex-wrap justify-center gap-0.5">
                {due.slice(0, 3).map((b) => <span key={b.key} className={`h-1.5 w-1.5 rounded-full ${hasOverdue ? 'bg-red-500' : b.status === 'due-today' ? 'bg-amber-500' : 'bg-sky-500'}`} />)}
                {pd.slice(0, 3).map((_, j) => <span key={j} className="h-1.5 w-1.5 rounded-full bg-emerald-500" />)}
              </div>
              {due.length > 0 && <span className="hidden text-[10px] font-medium sm:block"><Money cents={sum(due.map((b) => b.amount))} short /></span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" />Upcoming</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />Due today</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Overdue</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Paid</span>
      </div>
      {selected && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="mb-2 text-sm font-semibold">{formatDate(selected)}</div>
          {dayBills.length === 0 && dayPaid.length === 0 && <p className="text-sm muted">Nothing on this day.</p>}
          {dayBills.length > 0 && <BillList bills={dayBills} onSettle={onSettle} onEdit={onEdit} />}
          {dayPaid.map((p, i) => (
            <div key={i} className="flex justify-between py-1 text-sm"><span>{p.description}</span><span className="flex items-center gap-2"><StatusBadge status="paid" /><Money cents={p.amount} /></span></div>
          ))}
        </div>
      )}
    </Section>
  );
}
