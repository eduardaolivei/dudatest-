import { useState } from 'react';
import { useStore } from '../store/StoreContext';
import { budgetStatus, monthRange, spendingByCategory } from '../domain/finance';
import { monthKey, monthLabel } from '../domain/dates';
import { centsToInput, parseMoney } from '../domain/money';
import { categoryNames } from '../domain/categories';
import { Money, PageHeader, Progress, Section, Stat } from '../components/ui';

export default function Budgets() {
  const { data, update, person, month } = useStore();
  const r = monthRange(month);
  const status = budgetStatus(data, r, person);
  const spent = spendingByCategory(data, r, person);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(categoryNames.map((c) => [c, data.settings.budgets[c] ? centsToInput(data.settings.budgets[c]) : ''])),
  );
  const [err, setErr] = useState('');

  function save() {
    const budgets: Record<string, number> = {};
    for (const c of categoryNames) {
      const v = draft[c].trim();
      if (!v) continue;
      const cents = parseMoney(v);
      if (cents === null || cents < 0) return setErr(`Invalid amount for ${c}`);
      budgets[c] = cents;
    }
    setErr('');
    update((d) => ({ ...d, settings: { ...d.settings, budgets } }), 'Budgets saved');
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Budgets" subtitle={`Monthly spending limits — ${monthLabel(monthKey(month))}`} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Budgeted" value={status.totalBudget} icon="wallet" />
        <Stat label="Spent (budgeted categories)" value={status.totalSpent} icon="arrowUp" />
        <Stat label="Remaining" value={status.remaining} tone={status.remaining < 0 ? 'bad' : 'good'} icon="check" />
      </div>
      <Section title="Category budgets" action={<button className="btn-primary text-xs" onClick={save}>Save budgets</button>}>
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <ul className="space-y-4">
          {categoryNames.map((c) => {
            const budget = data.settings.budgets[c] ?? 0;
            const s = spent[c] ?? 0;
            const ratio = budget ? s / budget : 0;
            return (
              <li key={c} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c}</span>
                    <span className="muted"><Money cents={s} />{budget ? <> / <Money cents={budget} /></> : ' spent'}</span>
                  </div>
                  {budget > 0 && (
                    <>
                      <div className="mt-1"><Progress value={ratio} tone={ratio > 1 ? 'bad' : ratio > 0.85 ? 'warn' : 'good'} /></div>
                      <div className={`mt-0.5 text-xs ${ratio > 1 ? 'text-red-600' : 'muted'}`}>{ratio > 1 ? <>Over by <Money cents={s - budget} /></> : <><Money cents={budget - s} /> left</>}</div>
                    </>
                  )}
                </div>
                <input aria-label={`${c} budget`} className="input py-1.5 text-right" inputMode="decimal" placeholder="No limit" value={draft[c]} onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))} />
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
