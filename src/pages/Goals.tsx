import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import type { Goal, Person } from '../domain/types';
import { goalForecast, goalProgress, goalRequiredMonthly, matchPerson } from '../domain/finance';
import { addMonths, formatDate, monthKey, today } from '../domain/dates';
import { centsToInput, formatMoney, parseMoney, sum } from '../domain/money';
import { contributeGoal, remove, upsert } from '../store/actions';
import { uid } from '../store/id';
import { Badge, ConfirmButton, Empty, Field, Modal, Money, PageHeader, Progress, Section, Stat } from '../components/ui';
import { LinesChart, SERIES } from '../components/charts';
import { Icon } from '../components/Icon';

export default function Goals() {
  const { data, update, person } = useStore();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [contrib, setContrib] = useState<Goal | null>(null);
  const ref = today();
  const goals = data.goals.filter((g) => matchPerson(g.person, person));

  // 12-month projection at the current monthly contribution (capped at target)
  const projection = useMemo(() => {
    const rows: Record<string, string | number>[] = [];
    for (let i = 0; i <= 12; i++) {
      const row: Record<string, string | number> = { key: monthKey(addMonths(ref, i)) };
      for (const g of goals.slice(0, 8)) row[g.id] = Math.min(g.target, g.current + g.monthlyContribution * i);
      rows.push(row);
    }
    return rows;
  }, [goals, ref]);

  return (
    <div className="space-y-4">
      <PageHeader title="Savings & Goals" subtitle="What we're saving for, and when we'll get there." actions={<button className="btn-primary" onClick={() => setEditing('new')}>+ New goal</button>} />

      {goals.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Saved towards goals" value={sum(goals.map((g) => g.current))} tone="good" icon="target" />
          <Stat label="Still to save" value={sum(goals.map((g) => Math.max(0, g.target - g.current)))} icon="wallet" />
          <Stat label="Monthly contributions" value={sum(goals.filter((g) => g.current < g.target).map((g) => g.monthlyContribution))} icon="repeat" hint="Reserved in “How much can we spend?”" />
        </div>
      )}

      {goals.length === 0 ? (
        <div className="card"><Empty icon="target" title="No goals yet" text="Try Emergency Fund, Visa Expenses, University Fees, Travel or a Car." action={<button className="btn-primary" onClick={() => setEditing('new')}>Create a goal</button>} /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((g) => {
            const p = goalProgress(g);
            const f = goalForecast(g, ref);
            const req = goalRequiredMonthly(g, ref);
            return (
              <div key={g.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{g.name}{g.demo && <Badge className="bg-amber-100 text-amber-800">demo</Badge>}</div>
                    <div className="text-xs muted">{g.deadline ? `Deadline ${formatDate(g.deadline)}` : 'No deadline'}</div>
                  </div>
                  {f.onTrack === true && p < 1 && <Badge className="bg-emerald-100 text-emerald-700">On track</Badge>}
                  {f.onTrack === false && <Badge className="bg-red-100 text-red-700">Behind</Badge>}
                  {p >= 1 && <Badge className="bg-emerald-100 text-emerald-700">Reached 🎉</Badge>}
                </div>
                <div className="flex items-end justify-between">
                  <Money cents={g.current} className="text-xl font-bold" />
                  <span className="text-sm muted">of <Money cents={g.target} /> · {Math.round(p * 100)}%</span>
                </div>
                <Progress value={p} tone={p >= 1 ? 'good' : f.onTrack === false ? 'warn' : 'brand'} />
                <div className="text-xs muted">
                  {p >= 1 ? 'Goal complete.' : f.date ? <>At {formatMoney(g.monthlyContribution)}/month you'll reach it around <b>{formatDate(f.date)}</b> ({f.months} months).</> : 'Set a monthly contribution to get a forecast.'}
                  {req !== null && req > g.monthlyContribution && p < 1 && <> To hit the deadline, save <b>{formatMoney(req)}</b>/month.</>}
                </div>
                <div className="flex gap-2 pt-1">
                  <button className="btn-secondary text-xs" onClick={() => setContrib(g)}><Icon name="plus" className="h-4 w-4" />Add / withdraw</button>
                  <button className="btn-ghost text-xs" onClick={() => setEditing(g)}><Icon name="edit" className="h-4 w-4" />Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {goals.length > 0 && (
        <Section title="Projection — next 12 months">
          <LinesChart data={projection} series={goals.slice(0, 8).map((g, i) => ({ key: g.id, name: g.name, color: SERIES[i] }))} />
        </Section>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New goal' : 'Edit goal'}>
        {editing && (
          <GoalForm
            initial={editing === 'new' ? undefined : editing}
            onSave={(g) => { update((d) => upsert(d, 'goals', g), 'Goal saved'); setEditing(null); }}
            onDelete={editing !== 'new' ? () => { update((d) => remove(d, 'goals', editing.id), 'Goal deleted'); setEditing(null); } : undefined}
          />
        )}
      </Modal>
      <Modal open={!!contrib} onClose={() => setContrib(null)} title={contrib ? `Update ${contrib.name}` : ''}>
        {contrib && <ContributeForm goal={contrib} onDone={(amount) => { update((d) => contributeGoal(d, contrib, amount), amount >= 0 ? `Added ${formatMoney(amount)}` : `Withdrew ${formatMoney(-amount)}`); setContrib(null); }} />}
      </Modal>
    </div>
  );
}

function ContributeForm({ goal, onDone }: { goal: Goal; onDone: (cents: number) => void }) {
  const [amount, setAmount] = useState(centsToInput(goal.monthlyContribution || 0));
  const [err, setErr] = useState('');
  const go = (sign: 1 | -1) => {
    const c = parseMoney(amount);
    if (c === null || c <= 0) return setErr('Enter an amount');
    if (sign === -1 && c > goal.current) return setErr('Cannot withdraw more than saved');
    onDone(sign * c);
  };
  return (
    <div className="space-y-3">
      <Field label="Amount" error={err}><input autoFocus className="input text-xl font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <p className="text-xs muted">This tracks how much of your savings is earmarked for this goal. To move real money, also record a transfer to your savings account.</p>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={() => go(1)}>Add to goal</button>
        <button className="btn-secondary" onClick={() => go(-1)}>Withdraw</button>
      </div>
    </div>
  );
}

function GoalForm({ initial, onSave, onDelete }: { initial?: Goal; onSave: (g: Goal) => void; onDelete?: () => void }) {
  const { personName } = useStore();
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial ? centsToInput(initial.target) : '');
  const [current, setCurrent] = useState(initial ? centsToInput(initial.current) : '0');
  const [monthly, setMonthly] = useState(initial ? centsToInput(initial.monthlyContribution) : '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [person, setPerson] = useState<Person>(initial?.person ?? 'joint');
  const [err, setErr] = useState('');
  const suggestions = ['Emergency Fund', 'Visa Expenses', 'University Fees', 'Travel', 'Car', 'Long-term Savings'];

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = parseMoney(target), c = parseMoney(current || '0'), m = parseMoney(monthly || '0');
    if (!name.trim()) return setErr('Name the goal');
    if (t === null || t <= 0) return setErr('Target must be more than $0');
    if (c === null || c < 0 || m === null || m < 0) return setErr('Amounts must be valid and not negative');
    onSave({ id: initial?.id ?? uid(), name: name.trim(), target: t, current: c, monthlyContribution: m, deadline: deadline || undefined, person, demo: initial?.demo });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Field label="Goal name"><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} list="goal-suggestions" /></Field>
      <datalist id="goal-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount"><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Saved so far"><input className="input" inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="Monthly contribution"><input className="input" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
        <Field label="Deadline (optional)"><input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="For">
          <select className="input" value={person} onChange={(e) => setPerson(e.target.value as Person)}>
            <option value="joint">Joint</option><option value="me">{personName('me')}</option><option value="patrick">{personName('patrick')}</option>
          </select>
        </Field>
      </div>
      <div className="flex gap-2"><button className="btn-primary flex-1">Save</button>{onDelete && <ConfirmButton onConfirm={onDelete} />}</div>
    </form>
  );
}
