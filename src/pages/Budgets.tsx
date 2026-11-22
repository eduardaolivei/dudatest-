import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import type { BudgetCycle } from '../domain/types';
import { budgetPeriod, budgetStatus, convertBudgets, effectiveCycle, spendingByCategory, type BudgetRow } from '../domain/finance';
import { formatDate, today, weekdayName } from '../domain/dates';
import { centsToInput, formatMoney, parseMoney } from '../domain/money';
import { budgetKey, categoryNames, parseBudgetKey, subcategoriesFor, themeFor, type CategoryTheme } from '../domain/categories';
import { ConfirmButton, Field, Modal, Money, PageHeader, Progress, Section, Segmented, Stat } from '../components/ui';
import { Icon } from '../components/Icon';

const COLLAPSE_KEY = 'our-money-dashboard:budgets-collapsed';
const CYCLE_LABEL = { weekly: 'week', fortnightly: 'fortnight', monthly: 'month' } as const;

export default function Budgets() {
  const { data, update, person } = useStore();
  const ref = today();
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Which categories have their subcategories hidden (remembered on this device)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const saveCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  const toggle = (c: string) => {
    const next = new Set(collapsed);
    if (next.has(c)) next.delete(c); else next.add(c);
    saveCollapsed(next);
  };

  const cycle = effectiveCycle(data);
  const period = useMemo(() => budgetPeriod(data, ref, offset), [data, ref, offset]);
  const status = budgetStatus(data, period, person);
  const spent = spendingByCategory(data, period, person);
  const isCurrent = offset === 0;
  const unit = CYCLE_LABEL[cycle.frequency];
  const rowsByKey = new Map(status.rows.map((r) => [r.key, r]));
  const pace = isCurrent ? period.dayNumber / period.totalDays : 0;
  const catsWithSubs = categoryNames.filter((c) => status.rows.some((r) => r.category === c && r.subcategory));
  const allCollapsed = catsWithSubs.length > 0 && catsWithSubs.every((c) => collapsed.has(c));
  const setCollapsedAll = (hide: boolean) => saveCollapsed(hide ? new Set(catsWithSubs) : new Set());
  const linkedIncome = cycle.incomeRuleId ? data.recurring.find((r) => r.id === cycle.incomeRuleId) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title="Budgets" subtitle={`Spending limits per ${unit}, aligned to payday`} actions={<button className="btn-secondary" onClick={() => setCycleOpen(true)}><Icon name="calendar" className="h-4 w-4" />Budget cycle</button>} />

      {/* Current cycle */}
      <div className="card">
        <div className="flex items-center justify-between gap-2">
          <button className="btn-ghost px-2" aria-label="Previous cycle" onClick={() => setOffset((o) => o - 1)}><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wide muted">{cycle.frequency} budget{linkedIncome ? ` · follows ${linkedIncome.description}` : ''}</div>
            <div className="font-semibold">{weekdayName(period.start, true)} {formatDate(period.start)} – {weekdayName(period.end, true)} {formatDate(period.end)}</div>
          </div>
          <button className="btn-ghost px-2" aria-label="Next cycle" onClick={() => setOffset((o) => o + 1)}><Icon name="chevronRight" className="h-4 w-4" /></button>
        </div>
        {isCurrent ? (
          <>
            <div className="mt-3"><Progress value={period.dayNumber / period.totalDays} /></div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-sm">
              <span>Day {period.dayNumber} of {period.totalDays}</span>
              <span className="font-medium">
                {period.daysLeft === 1 ? 'Last day — ' : `${period.daysLeft} days left — `}resets on {weekdayName(period.nextReset)} {formatDate(period.nextReset)}{linkedIncome || cycle.frequency !== 'monthly' ? ' (payday)' : ''}
              </span>
            </div>
          </>
        ) : (
          <button className="mt-2 w-full text-center text-sm font-medium text-brand-600" onClick={() => setOffset(0)}>Back to current {unit}</button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Budget this ${unit}`} value={status.totalBudget} icon="wallet" />
        <Stat label="Spent" value={status.totalSpent} icon="arrowUp" hint="Budgeted categories" />
        <Stat label="Remaining" value={status.remaining} tone={status.remaining < 0 ? 'bad' : 'good'} icon="check" />
        <Stat label="Per day until payday" value={isCurrent && period.daysLeft > 0 ? Math.max(0, Math.floor(status.remaining / period.daysLeft)) : 0} icon="calendar" hint={isCurrent ? `${period.daysLeft} day${period.daysLeft === 1 ? '' : 's'} left` : 'Current cycle only'} />
      </div>

      <Section
        title="Budgets"
        action={
          <div className="flex gap-2">
            {catsWithSubs.length > 0 && (
              <button className="btn-ghost text-xs" onClick={() => setCollapsedAll(!allCollapsed)}>
                <Icon name="chevronRight" className={`h-3.5 w-3.5 transition-transform ${allCollapsed ? '' : 'rotate-90'}`} />
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
            )}
            <button className="btn-primary text-xs" onClick={() => setAdding(true)}><Icon name="plus" className="h-3.5 w-3.5" />Add budget</button>
          </div>
        }
      >
        {status.rows.length === 0 && (
          <p className="mb-3 rounded-xl bg-brand-50 p-2.5 text-sm text-brand-700 dark:bg-brand-600/15 dark:text-brand-100">
            Tap <b>Set limit</b> on a category, or <b>+ Add budget</b> for something more specific like Coffee, Food Delivery or a new item of your own.
          </p>
        )}
        <ul className="space-y-3">
          {categoryNames.map((c) => {
            const t = themeFor(c);
            const catRow = rowsByKey.get(c);
            const subRows = status.rows.filter((r) => r.category === c && r.subcategory);
            const open = !collapsed.has(c);
            return (
              <li key={c} className={`rounded-2xl border p-3 sm:p-4 ${t.card}`}>
                <BudgetLine
                  label={c}
                  theme={t}
                  row={catRow}
                  spentIfNone={spent[c] ?? 0}
                  pace={pace}
                  onEdit={() => setEditing(c)}
                  toggle={subRows.length > 0 ? { open, onClick: () => toggle(c), count: subRows.length } : undefined}
                />
                {subRows.length > 0 && !open && (
                  <button className="mt-2 ml-11 block text-left text-xs muted hover:underline" onClick={() => toggle(c)}>
                    {subRows.length} item{subRows.length === 1 ? '' : 's'} · <Money cents={subRows.reduce((a, r) => a + r.spent, 0)} /> of <Money cents={subRows.reduce((a, r) => a + r.budget, 0)} />
                    {subRows.some((r) => r.spent > r.budget) && <span className="font-medium text-red-600"> · {subRows.filter((r) => r.spent > r.budget).length} over</span>}
                  </button>
                )}
                {subRows.length > 0 && open && (
                  <ul className="mt-3 space-y-2">
                    {subRows.map((r) => (
                      <li key={r.key} className={`rounded-xl border px-3 py-2.5 ${t.sub}`}>
                        <BudgetLine label={r.label} theme={t} row={r} spentIfNone={0} pace={pace} onEdit={() => setEditing(r.key)} small />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {status.rows.some((r) => r.subcategory && rowsByKey.has(r.category)) && (
          <p className="mt-2 text-xs muted">Subcategory limits sit inside their category's limit, so they're not added to the totals twice.</p>
        )}
      </Section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${parseBudgetKey(editing).subcategory ?? editing} limit` : ''}>
        {editing && (
          <LimitForm
            category={parseBudgetKey(editing).subcategory ?? editing}
            unit={unit}
            initial={data.settings.budgets[editing] ?? 0}
            onSave={(cents) => {
              update((d) => {
                const budgets = { ...d.settings.budgets };
                if (cents > 0) budgets[editing] = cents;
                else delete budgets[editing];
                return { ...d, settings: { ...d.settings, budgets } };
              }, cents > 0 ? `${parseBudgetKey(editing).subcategory ?? editing}: ${formatMoney(cents)} per ${unit}` : `${parseBudgetKey(editing).subcategory ?? editing} limit removed`);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add budget">
        {adding && (
          <AddBudgetForm
            unit={unit}
            onSave={(category, sub, newSub, cents) => {
              update((d) => {
                const custom = { ...(d.settings.customSubcategories ?? {}) };
                if (newSub) custom[category] = [...(custom[category] ?? []), newSub];
                return { ...d, settings: { ...d.settings, customSubcategories: custom, budgets: { ...d.settings.budgets, [budgetKey(category, sub)]: cents } } };
              }, `${sub ?? category}: ${formatMoney(cents)} per ${unit}`);
              setAdding(false);
            }}
          />
        )}
      </Modal>

      <Modal open={cycleOpen} onClose={() => setCycleOpen(false)} title="Budget cycle">
        {cycleOpen && (
          <CycleForm
            current={cycle}
            onSave={(next) => {
              update((d) => {
                const from = effectiveCycle(d).frequency;
                return { ...d, settings: { ...d.settings, budgetCycle: next, budgets: convertBudgets(d.settings.budgets, from, next.frequency) } };
              }, 'Budget cycle saved');
              setOffset(0);
              setCycleOpen(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function LimitForm({ category, unit, initial, onSave }: { category: string; unit: string; initial: number; onSave: (cents: number) => void }) {
  const [amount, setAmount] = useState(initial ? centsToInput(initial) : '');
  const [err, setErr] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setErr('Type an amount greater than $0, e.g. 150');
    onSave(cents);
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label={`How much can we spend on ${category} per ${unit}?`} error={err}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg muted">$</span>
          <input autoFocus inputMode="decimal" className="input pl-7 text-2xl font-semibold" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Limit amount" />
        </div>
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1 py-3">Save</button>
        {initial > 0 && <ConfirmButton label="Remove" confirmLabel="Remove?" onConfirm={() => onSave(0)} />}
      </div>
    </form>
  );
}

function CycleForm({ current, onSave }: { current: BudgetCycle; onSave: (c: BudgetCycle) => void }) {
  const { data, personName } = useStore();
  const incomes = data.recurring.filter((r) => r.kind === 'income' && r.frequency !== 'quarterly' && r.frequency !== 'yearly');
  const [mode, setMode] = useState<'income' | 'manual'>(current.incomeRuleId && incomes.some((r) => r.id === current.incomeRuleId) ? 'income' : incomes.length ? 'income' : 'manual');
  const [ruleId, setRuleId] = useState(current.incomeRuleId ?? incomes[0]?.id ?? '');
  const [frequency, setFrequency] = useState<BudgetCycle['frequency']>(current.frequency);
  const [anchor, setAnchor] = useState(current.anchor === '2026-01-01' && !current.incomeRuleId ? today() : current.anchor);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'income') {
      const r = incomes.find((x) => x.id === ruleId);
      if (!r) return;
      onSave({ frequency: r.frequency as BudgetCycle['frequency'], anchor: r.startDate, incomeRuleId: r.id });
    } else {
      onSave({ frequency, anchor });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm muted">Choose when your budget starts again — usually the day you get paid.</p>
      {incomes.length > 0 && (
        <Segmented value={mode} onChange={setMode} options={[{ value: 'income', label: 'Follow a salary' }, { value: 'manual', label: 'Choose manually' }]} />
      )}
      {mode === 'income' && incomes.length > 0 ? (
        <Field label="Budget renews when this income is paid">
          <select className="input" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            {incomes.map((r) => <option key={r.id} value={r.id}>{r.description} — {r.frequency}, {weekdayName(r.startDate)}s ({personName(r.person)})</option>)}
          </select>
        </Field>
      ) : (
        <>
          <div>
            <span className="label">How often</span>
            <Segmented value={frequency} onChange={setFrequency} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'fortnightly', label: 'Fortnightly' }, { value: 'monthly', label: 'Monthly' }]} />
          </div>
          <Field label={frequency === 'monthly' ? 'A payday (the budget restarts on this day of each month)' : 'A recent or upcoming payday'}>
            <input type="date" className="input" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
          </Field>
          {frequency !== 'monthly' && <p className="text-xs muted">Budget restarts every {frequency === 'weekly' ? '' : 'second '}{weekdayName(anchor)}.</p>}
          {incomes.length === 0 && <p className="text-xs muted">Tip: add your salary under Income &amp; Recurring and the budget can follow it automatically.</p>}
        </>
      )}
      <p className="rounded-xl bg-slate-50 p-2.5 text-xs muted dark:bg-slate-800/60">If you switch between weekly, fortnightly and monthly, existing limits are converted automatically (e.g. $600/month ≈ $138/week).</p>
      <button className="btn-primary w-full py-3">Save cycle</button>
    </form>
  );
}

function BudgetLine({ label, theme: t, row, spentIfNone, pace, onEdit, small, toggle }: { label: string; theme: CategoryTheme; row?: BudgetRow; spentIfNone: number; pace: number; onEdit: () => void; small?: boolean; toggle?: { open: boolean; onClick: () => void; count: number } }) {
  const budget = row?.budget ?? 0;
  const s = row ? row.spent : spentIfNone;
  const ratio = budget ? s / budget : 0;
  const fast = pace > 0 && ratio < 1 && ratio > pace + 0.15;
  // Status colours stay soft too: coral when over, peach when going fast, category colour otherwise.
  const bar = ratio > 1 ? 'bg-red-300 dark:bg-red-400/80' : fast && ratio > 0.85 ? 'bg-orange-300 dark:bg-orange-400/80' : t.bar;
  const titleCls = small ? 'text-sm font-medium text-slate-700 dark:text-slate-200' : `text-base font-semibold ${t.title}`;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {!small && <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base ${t.chip}`} aria-hidden>{t.emoji}</span>}
          <div className="min-w-0">
            {toggle ? (
              <button className={`-ml-1 flex items-center gap-1.5 rounded-lg px-1 ${titleCls} hover:opacity-80`} onClick={toggle.onClick} aria-expanded={toggle.open} aria-label={`${toggle.open ? 'Hide' : 'Show'} ${label} subcategories`}>
                {label}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold ${t.chip}`}>{toggle.count}</span>
                <Icon name="chevronRight" className={`h-4 w-4 opacity-60 transition-transform ${toggle.open ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <div className={titleCls}>{label}</div>
            )}
            <div className="text-xs muted"><Money cents={s} /> spent{budget ? <> of <Money cents={budget} /></> : ' · no limit'}</div>
          </div>
        </div>
        <button className={`btn shrink-0 px-3 py-1.5 text-xs ${t.button}`} onClick={onEdit} aria-label={`${budget ? 'Edit' : 'Set'} ${label} limit`}>
          {budget ? <><Icon name="edit" className="h-3.5 w-3.5" />Edit</> : <><Icon name="plus" className="h-3.5 w-3.5" />Set limit</>}
        </button>
      </div>
      {budget > 0 && (
        <div className={small ? 'mt-2' : 'mt-2.5 sm:ml-11'}>
          <Progress value={ratio} barClass={bar} trackClass={t.track} />
          <div className={`mt-1 text-xs ${ratio > 1 ? 'font-medium text-red-600 dark:text-red-400' : 'muted'}`}>
            {ratio > 1 ? <>Over by <Money cents={s - budget} /></> : <><Money cents={budget - s} /> left</>}
            {ratio === 1 ? ' · fully used' : fast && ' · spending faster than the days are passing'}
          </div>
        </div>
      )}
    </div>
  );
}

function AddBudgetForm({ unit, onSave }: { unit: string; onSave: (category: string, sub: string | undefined, newSub: string | undefined, cents: number) => void }) {
  const { data } = useStore();
  const [category, setCategory] = useState('Groceries');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const subs = subcategoriesFor(category, data.settings.customSubcategories);
  const typed = name.trim();
  const existing = subs.find((x) => x.toLowerCase() === typed.toLowerCase());
  const isNew = !!typed && !existing && typed.toLowerCase() !== category.toLowerCase();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (typed.includes('›')) return setErr('Please don’t use the › character in the name');
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setErr('Type a limit greater than $0, e.g. 50');
    const sub = !typed || typed.toLowerCase() === category.toLowerCase() ? undefined : existing ?? typed;
    onSave(category, sub, isNew ? typed : undefined, cents);
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <Field label="Name">
        <input
          autoFocus
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          list="budget-name-suggestions"
          placeholder="e.g. Coffee, Uber Eats, Gym"
          aria-label="Budget name"
        />
        <datalist id="budget-name-suggestions">{subs.map((x) => <option key={x} value={x} />)}</datalist>
      </Field>
      <Field label="Category it belongs to">
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category it belongs to">
          {categoryNames.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {subs.slice(0, 8).map((x) => (
          <button type="button" key={x} onClick={() => setName(x)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${existing === x ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{x}</button>
        ))}
      </div>
      <Field label={`Limit per ${unit}`}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg muted">$</span>
          <input inputMode="decimal" className="input pl-7 text-2xl font-semibold" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Limit amount" />
        </div>
      </Field>
      <p className="text-xs muted">
        {!typed
          ? `No name = a limit for the whole ${category} category.`
          : isNew
            ? `“${typed}” is new — it will be created in ${category} and appear when you add expenses.`
            : `Budget for ${existing ?? category} in ${category}.`}
      </p>
      <button type="submit" className="btn-primary w-full py-3">Save budget</button>
    </form>
  );
}
