import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import type { Person, RecurringRule } from '../domain/types';
import { matchPerson, pendingOccurrences } from '../domain/finance';
import { addDays, formatDate, monthlyFactor, today } from '../domain/dates';
import { centsToInput, formatMoney, parseMoney, sum } from '../domain/money';
import { INCOME_SOURCES, categoryNames, subcategoriesFor } from '../domain/categories';
import { remove, skipOccurrence, upsert } from '../store/actions';
import { Badge, ConfirmButton, Empty, Field, Modal, Money, PageHeader, Section } from '../components/ui';
import { SettleDialog, type SettleTarget } from '../components/SettleDialog';
import { Icon } from '../components/Icon';

const FREQ_LABEL = { weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

export default function Recurring() {
  const { data, update, person, personName, openQuickAdd } = useStore();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [settle, setSettle] = useState<SettleTarget | null>(null);
  const ref = today();

  const rules = data.recurring.filter((r) => matchPerson(r.person, person));
  const income = rules.filter((r) => r.kind === 'income');
  const expenses = rules.filter((r) => r.kind === 'expense');
  const monthly = (rs: RecurringRule[]) => Math.round(sum(rs.map((r) => r.amount * monthlyFactor(r.frequency))));

  const expected = useMemo(() => pendingOccurrences(data, 'income', { start: addDays(ref, -30), end: addDays(ref, 30) }, person), [data, ref, person]);

  // Actual vs forecast: received income linked to rules in the last 30 days
  const received = data.transactions
    .filter((t) => t.kind === 'income' && t.recurringId && t.date >= addDays(ref, -30) && matchPerson(t.person, person))
    .sort((a, b) => b.date.localeCompare(a.date));
  const ruleAmount = new Map(data.recurring.map((r) => [r.id, r.amount]));

  const RuleList = ({ list }: { list: RecurringRule[] }) => (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {list.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-2.5">
          <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(r)}>
            <div className="truncate font-medium">{r.description}</div>
            <div className="flex flex-wrap gap-1 text-xs muted">
              <span>{FREQ_LABEL[r.frequency]} from {formatDate(r.startDate)}</span>·<span>{personName(r.person)}</span>
              {r.cardId && <Badge>on card</Badge>}
              {r.endDate && <Badge>ends {formatDate(r.endDate)}</Badge>}
              {r.demo && <Badge className="bg-amber-100 text-amber-800">demo</Badge>}
            </div>
          </button>
          <Money cents={r.amount} className="font-semibold" />
          <button className="btn-ghost p-1.5" onClick={() => setEditing(r)} aria-label={`Edit ${r.description}`}><Icon name="edit" className="h-4 w-4" /></button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Income & Recurring"
        subtitle="Expected salaries and repeating bills. Confirm each payment when it actually happens."
        actions={
          <>
            <button className="btn-secondary" onClick={() => openQuickAdd('bill')}>+ Recurring bill</button>
            <button className="btn-primary" onClick={() => openQuickAdd('income')}>+ Income</button>
          </>
        }
      />

      <Section title="Expected income (±30 days)">
        {expected.length === 0 ? (
          <p className="text-sm muted">No expected income waiting for confirmation. Add salaries with a frequency (weekly, fortnightly…) to see them here.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {expected.map(({ rule, date }) => (
              <li key={rule.id + date} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{rule.description}</div>
                  <div className="text-xs muted">{date < ref ? '⚠️ Was expected' : 'Expected'} {formatDate(date)} · {personName(rule.person)}</div>
                </div>
                <Money cents={rule.amount} className="font-semibold text-emerald-600 dark:text-emerald-400" />
                <button className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => setSettle({ type: 'income', rule, occurrence: date })}><Icon name="check" className="h-3.5 w-3.5" />Received</button>
                <button className="btn-ghost px-2 py-1.5 text-xs" onClick={() => update((d) => skipOccurrence(d, rule.id, date), 'Skipped')}>Skip</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs muted">Expected income is never counted as available money until you confirm it.</p>
      </Section>

      {received.length > 0 && (
        <Section title="Received vs expected (last 30 days)">
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {received.map((t) => {
              const exp = ruleAmount.get(t.recurringId!) ?? t.amount;
              const diff = t.amount - exp;
              return (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0"><div className="truncate font-medium">{t.description}</div><div className="text-xs muted">{formatDate(t.date)}</div></div>
                  <div className="text-right">
                    <Money cents={t.amount} className="font-semibold" />
                    {diff !== 0 && <div className={`text-xs ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{diff > 0 ? '+' : '−'}{formatMoney(Math.abs(diff))} vs expected</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Recurring income" action={<span className="text-xs muted">≈ <Money cents={monthly(income)} />/month</span>}>
          {income.length ? <RuleList list={income} /> : <Empty icon="repeat" title="No recurring income" text="Add My Salary, Patrick's Salary or business income with its frequency." action={<button className="btn-secondary" onClick={() => openQuickAdd('income')}>Add income</button>} />}
        </Section>
        <Section title="Recurring bills" action={<span className="text-xs muted">≈ <Money cents={monthly(expenses)} />/month</span>}>
          {expenses.length ? <RuleList list={expenses} /> : <Empty icon="repeat" title="No recurring bills" text="Add rent, utilities, insurance or subscriptions." action={<button className="btn-secondary" onClick={() => openQuickAdd('bill')}>Add bill</button>} />}
        </Section>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit recurring item">
        {editing && (
          <RuleForm
            rule={editing}
            onSave={(r) => { update((d) => upsert(d, 'recurring', r), 'Saved'); setEditing(null); }}
            onDelete={() => { update((d) => remove(d, 'recurring', editing.id), 'Deleted — past transactions kept'); setEditing(null); }}
          />
        )}
      </Modal>
      <SettleDialog target={settle} onClose={() => setSettle(null)} />
    </div>
  );
}

function RuleForm({ rule, onSave, onDelete }: { rule: RecurringRule; onSave: (r: RecurringRule) => void; onDelete: () => void }) {
  const { data, personName } = useStore();
  const [f, setF] = useState({ ...rule, amountStr: centsToInput(rule.amount) });
  const [err, setErr] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(f.amountStr);
    if (cents === null || cents <= 0) return setErr('Enter a valid amount');
    if (!f.description.trim()) return setErr('Description is required');
    if (f.endDate && f.endDate < f.startDate) return setErr('End date must be after start date');
    const { amountStr: _ignored, ...rest } = f;
    void _ignored;
    onSave({ ...rest, description: f.description.trim(), amount: cents, endDate: f.endDate || undefined });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Field label="Description"><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount"><input className="input" inputMode="decimal" value={f.amountStr} onChange={(e) => set('amountStr', e.target.value)} /></Field>
        <Field label="Frequency">
          <select className="input" value={f.frequency} onChange={(e) => set('frequency', e.target.value as RecurringRule['frequency'])}>
            {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="First date"><input type="date" className="input" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="End date (optional)"><input type="date" className="input" value={f.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Person">
          <select className="input" value={f.person} onChange={(e) => set('person', e.target.value as Person)}>
            <option value="me">{personName('me')}</option><option value="patrick">{personName('patrick')}</option><option value="joint">Joint</option>
          </select>
        </Field>
        <Field label="Account">
          <select className="input" value={f.cardId ? 'card:' + f.cardId : 'acc:' + (f.accountId ?? '')} onChange={(e) => {
            const v = e.target.value;
            setF((x) => ({ ...x, accountId: v.startsWith('acc:') ? v.slice(4) : undefined, cardId: v.startsWith('card:') ? v.slice(5) : undefined }));
          }}>
            {data.accounts.map((a) => <option key={a.id} value={'acc:' + a.id}>{a.name}</option>)}
            {f.kind === 'expense' && data.cards.map((c) => <option key={c.id} value={'card:' + c.id}>{c.name} (card)</option>)}
          </select>
        </Field>
        {f.kind === 'income' ? (
          <Field label="Income source">
            <select className="input" value={f.incomeSource ?? ''} onChange={(e) => set('incomeSource', e.target.value)}>
              {INCOME_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Category">
              <select className="input" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value, subcategory: undefined }))}>
                {categoryNames.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Subcategory">
              <select className="input" value={f.subcategory ?? ''} onChange={(e) => set('subcategory', e.target.value || undefined)}>
                <option value="">—</option>
                {subcategoriesFor(f.category, data.settings.customSubcategories).map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </>
        )}
      </div>
      <p className="text-xs muted">Changing the amount affects future expected items only. Already confirmed payments keep their real amount.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1">Save</button>
        <ConfirmButton onConfirm={onDelete} />
      </div>
    </form>
  );
}
