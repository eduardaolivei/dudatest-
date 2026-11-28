import { useMemo, useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import type { PlannedPurchase, Person } from '../domain/types';
import { affordability, goalRequiredMonthly, matchPerson, monthRange, safeToSpend } from '../domain/finance';
import { formatDate, today } from '../domain/dates';
import { centsToInput, formatMoney, parseMoney, sum } from '../domain/money';
import { PAYMENT_METHODS, wishlistCategoriesFor, wishlistEmoji } from '../domain/categories';
import { remove, upsert } from '../store/actions';
import { uid } from '../store/id';
import { Badge, ConfirmButton, Empty, Field, Modal, Money, PageHeader, Progress, Section, Stat } from '../components/ui';
import { AffordCheck } from '../components/AffordCheck';
import { Icon } from '../components/Icon';


const PRIORITY_CLS = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-100 text-slate-700' };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function Planner() {
  const { data, update, person, personName, openQuickAdd } = useStore();
  const [editing, setEditing] = useState<PlannedPurchase | 'new' | null>(null);
  const ref = today();
  const s2s = useMemo(() => safeToSpend(data, ref, 'month', { start: ref, end: monthRange(ref).end }, person), [data, ref, person]);
  const items = data.purchases
    .filter((p) => matchPerson(p.person, person))
    .sort((a, b) => (a.status === 'purchased' ? 1 : 0) - (b.status === 'purchased' ? 1 : 0) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const open = items.filter((p) => p.status !== 'purchased');
  const [filter, setFilter] = useState<string>('all');
  const cats = wishlistCategoriesFor(data.settings, data.purchases);
  const used = cats.filter((c) => items.some((p) => p.category === c));
  const shown = filter === 'all' ? items : items.filter((p) => p.category === filter);
  const groups = used.filter((c) => filter === 'all' || c === filter).map((c) => ({ c, list: shown.filter((p) => p.category === c) })).filter((g) => g.list.length);

  return (
    <div className="space-y-4">
      <PageHeader title="Things We Want to Buy" subtitle="Plan purchases so they never surprise the budget." actions={<button className="btn-primary" onClick={() => setEditing('new')}>+ Add item</button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total wishlist" value={sum(open.map((p) => p.price))} icon="bag" />
        <Stat label="Still need to save" value={sum(open.map((p) => Math.max(0, p.price - p.saved)))} icon="target" />
        <Stat label="Safe to spend now" value={s2s.safe} tone={s2s.safe < 0 ? 'bad' : 'good'} icon="wallet" hint={`Until ${formatDate(s2s.range.end)}`} />
      </div>

      <Section title="Can we afford it?">
        <AffordCheck s2s={s2s} />
      </Section>

      {items.length === 0 ? (
        <div className="card"><Empty icon="bag" title="Nothing planned yet" text="Add things you want to buy — a new phone, a sofa, flights — with a price and deadline." action={<button className="btn-primary" onClick={() => setEditing('new')}>Add item</button>} /></div>
      ) : (
        <>
          {used.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {[{ c: 'all', n: items.length }, ...used.map((c) => ({ c, n: items.filter((p) => p.category === c).length }))].map(({ c, n }) => (
                <button key={c} onClick={() => setFilter(c)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${filter === c ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200'}`}>
                  {c === 'all' ? 'All' : `${wishlistEmoji(c)} ${c}`} · {n}
                </button>
              ))}
            </div>
          )}
          {groups.map(({ c, list }) => (
            <section key={c} className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span aria-hidden>{wishlistEmoji(c)}</span>{c}
                <span className="font-normal muted">· <Money cents={sum(list.filter((p) => p.status !== 'purchased').map((p) => p.price))} /></span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((p) => {
            const need = Math.max(0, p.price - p.saved);
            const monthly = p.deadline ? goalRequiredMonthly({ id: p.id, name: p.name, target: p.price, current: p.saved, monthlyContribution: 0, deadline: p.deadline, person: p.person }, ref) : null;
            const fit = affordability(s2s, need);
            return (
              <div key={p.id} className={`card space-y-2 ${p.status === 'purchased' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="flex flex-wrap gap-1 text-xs muted">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLS[p.priority]}`}>{p.priority}</span>
                      <Badge>{p.status}</Badge><Badge>{personName(p.person)}</Badge>{p.demo && <Badge className="bg-amber-100 text-amber-800">demo</Badge>}
                    </div>
                  </div>
                  <Money cents={p.price} className="text-lg font-bold" />
                </div>
                <Progress value={p.price ? p.saved / p.price : 0} tone="good" />
                <div className="text-xs muted">
                  Saved <Money cents={p.saved} /> · need <b><Money cents={need} /></b>
                  {p.deadline && <> by {formatDate(p.deadline)}{monthly ? <> (≈ {formatMoney(monthly)}/month)</> : null}</>}
                  {' · '}{p.category} · {p.paymentMethod}
                </div>
                {p.status !== 'purchased' && (
                  <div className={`text-xs font-medium ${fit.verdict === 'yes' ? 'text-emerald-600' : fit.verdict === 'wait' ? 'text-amber-600' : 'text-red-600'}`}>
                    {fit.verdict === 'yes' ? '✅ Fits the budget right now' : fit.verdict === 'wait' ? '⏳ Fits after expected income arrives' : '⛔ Does not fit this month — keep saving'}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {p.status !== 'purchased' && (
                    <button className="btn-secondary text-xs" onClick={() => { update((d) => upsert(d, 'purchases', { ...p, status: 'purchased' }), 'Marked as purchased — now record the expense'); openQuickAdd(p.paymentMethod === 'Credit card' ? 'card' : 'expense'); }}>
                      <Icon name="check" className="h-4 w-4" />Bought it
                    </button>
                  )}
                  <button className="btn-ghost text-xs" onClick={() => setEditing(p)}><Icon name="edit" className="h-4 w-4" />Edit</button>
                </div>
              </div>
            );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add planned purchase' : 'Edit planned purchase'}>
        {editing && (
          <PurchaseForm
            initial={editing === 'new' ? undefined : editing}
            onSave={(p) => {
              update((d) => {
                const known = wishlistCategoriesFor(d.settings, d.purchases);
                const settings = known.includes(p.category) ? d.settings : { ...d.settings, wishlistCategories: [...(d.settings.wishlistCategories ?? []), p.category] };
                return upsert({ ...d, settings }, 'purchases', p);
              }, 'Saved');
              setEditing(null);
            }}
            onDelete={editing !== 'new' ? () => { update((d) => remove(d, 'purchases', editing.id), 'Deleted'); setEditing(null); } : undefined}
          />
        )}
      </Modal>
    </div>
  );
}

function PurchaseForm({ initial, onSave, onDelete }: { initial?: PlannedPurchase; onSave: (p: PlannedPurchase) => void; onDelete?: () => void }) {
  const { personName } = useStore();
  const [f, setF] = useState({
    name: initial?.name ?? '', price: initial ? centsToInput(initial.price) : '', saved: initial ? centsToInput(initial.saved) : '0',
    priority: initial?.priority ?? 'medium', person: initial?.person ?? ('joint' as Person), deadline: initial?.deadline ?? '',
    category: initial?.category ?? 'Just want', status: initial?.status ?? 'planned', paymentMethod: initial?.paymentMethod ?? 'Debit card',
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const price = parseMoney(f.price), saved = parseMoney(f.saved || '0');
    if (!f.name.trim()) return setErr('Product name is required');
    if (newCat !== null && !newCat.trim()) return setErr('Type a name for the new category');
    const category = newCat?.trim() ? wishCats.find((c) => c.toLowerCase() === newCat.trim().toLowerCase()) ?? newCat.trim() : f.category;
    if (price === null || price <= 0) return setErr('Enter an estimated price');
    if (saved === null || saved < 0) return setErr('Saved amount is invalid');
    onSave({ id: initial?.id ?? uid(), name: f.name.trim(), price, saved, priority: f.priority as PlannedPurchase['priority'], person: f.person, deadline: f.deadline || undefined, category, status: f.status as PlannedPurchase['status'], paymentMethod: f.paymentMethod, demo: initial?.demo });
  }
  const { data } = useStore();
  const wishCats = wishlistCategoriesFor(data.settings, data.purchases);
  const [newCat, setNewCat] = useState<string | null>(null);
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Field label="Product name"><input autoFocus className="input" value={f.name} onChange={set('name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estimated price"><input className="input" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
        <Field label="Already saved"><input className="input" inputMode="decimal" value={f.saved} onChange={set('saved')} /></Field>
        <Field label="Priority"><select className="input" value={f.priority} onChange={set('priority')}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={set('status')}><option value="planned">Planned</option><option value="saving">Saving</option><option value="purchased">Purchased</option></select></Field>
        <Field label="Responsible"><select className="input" value={f.person} onChange={set('person')}><option value="joint">Joint</option><option value="me">{personName('me')}</option><option value="patrick">{personName('patrick')}</option></select></Field>
        <Field label="Purchase deadline"><input type="date" className="input" value={f.deadline} onChange={set('deadline')} /></Field>
        <Field label="Category">
          <select className="input" value={newCat !== null ? '__new__' : f.category} onChange={(e) => { if (e.target.value === '__new__') setNewCat(''); else { setNewCat(null); setF((x) => ({ ...x, category: e.target.value })); } }} aria-label="Wish category">
            {wishCats.map((c) => <option key={c} value={c}>{wishlistEmoji(c)} {c}</option>)}
            <option value="__new__">+ New category…</option>
          </select>
        </Field>
        <Field label="Payment method"><select className="input" value={f.paymentMethod} onChange={set('paymentMethod')}>{PAYMENT_METHODS.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      {newCat !== null && (
        <Field label="New category name">
          <input autoFocus className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Brazil trip, Wedding, Baby" aria-label="New category name" />
        </Field>
      )}
      <p className="text-xs muted">Items with a deadline inside the current period are reserved in “How much can we spend?”.</p>
      <div className="flex gap-2"><button className="btn-primary flex-1">Save</button>{onDelete && <ConfirmButton onConfirm={onDelete} />}</div>
    </form>
  );
}
