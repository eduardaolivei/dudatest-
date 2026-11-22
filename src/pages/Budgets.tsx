import { useState } from 'react';
import { useStore } from '../store/StoreContext';
import { budgetStatus, monthRange, spendingByCategory } from '../domain/finance';
import { monthKey, monthLabel } from '../domain/dates';
import { centsToInput, formatMoney, parseMoney } from '../domain/money';
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

  // Each field saves on its own when you leave it or press Enter — no separate Save button.
  function saveOne(c: string) {
    const v = draft[c].trim();
    const cents = v ? parseMoney(v) : 0;
    if (cents === null || cents < 0) return setErr(`“${v}” is not a valid amount for ${c}. Use numbers only, e.g. 600 or 450.50`);
    setErr('');
    if ((data.settings.budgets[c] ?? 0) === cents) return;
    update((d) => {
      const budgets = { ...d.settings.budgets };
      if (cents) budgets[c] = cents;
      else delete budgets[c];
      return { ...d, settings: { ...d.settings, budgets } };
    }, cents ? `${c} budget saved: ${formatMoney(cents)}/month` : `${c} budget removed`);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Budgets" subtitle={`Monthly spending limits — ${monthLabel(monthKey(month))}`} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Budgeted" value={status.totalBudget} icon="wallet" />
        <Stat label="Spent (budgeted categories)" value={status.totalSpent} icon="arrowUp" />
        <Stat label="Remaining" value={status.remaining} tone={status.remaining < 0 ? 'bad' : 'good'} icon="check" />
      </div>
      <Section title="Category budgets">
        <p className="mb-3 rounded-xl bg-brand-50 p-2.5 text-xs text-brand-700 dark:bg-brand-600/15 dark:text-brand-100">
          Type a monthly limit in the box next to a category (e.g. <b>600</b>). It saves automatically when you tap outside the box or press Enter. Clear the box to remove the limit. Budgets repeat every month.
        </p>
        {err && <p className="mb-2 text-sm text-red-600" role="alert">{err}</p>}
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
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm muted">$</span>
                  <input
                    aria-label={`${c} budget`}
                    className="input border-brand-500/40 py-1.5 pl-6 text-right font-medium"
                    inputMode="decimal"
                    enterKeyHint="done"
                    placeholder="Set limit"
                    value={draft[c]}
                    onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                    onBlur={() => saveOne(c)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
