import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import type { Card, Person } from '../domain/types';
import { cardStatement, matchPerson, type CardStatement } from '../domain/finance';
import { formatDate, today } from '../domain/dates';
import { centsToInput, formatMoney, parseMoney, sum } from '../domain/money';
import { deleteCardWithHistory, remove, setCardClosed, upsert } from '../store/actions';
import { uid } from '../store/id';
import { Badge, ConfirmButton, Empty, Field, Modal, Money, PageHeader, Progress, Stat } from '../components/ui';
import { TransactionForm } from '../components/TransactionForm';
import { Icon } from '../components/Icon';

const STATUS: Record<CardStatement['status'], { label: string; cls: string }> = {
  paid: { label: 'Statement paid', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  due: { label: 'Payment due', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  'no-balance': { label: 'Nothing due', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

type Action = { type: 'purchase' | 'payment' | 'charge'; card: Card } | { type: 'edit'; card?: Card } | { type: 'history'; card: Card };

export default function Cards() {
  const { data, person, update } = useStore();
  const [action, setAction] = useState<Action | null>(null);
  const ref = today();
  const mine = data.cards.filter((c) => matchPerson(c.owner, person));
  const cards = mine.filter((c) => !c.closed);
  const closedCards = mine.filter((c) => c.closed);
  const stats = useMemo(() => new Map(cards.map((c) => [c.id, cardStatement(c, data.transactions, ref)])), [cards, data.transactions, ref]);

  const totalDebt = sum(cards.map((c) => stats.get(c.id)!.balance));
  const totalLimit = sum(cards.map((c) => c.limit));
  const totalDue = sum(cards.map((c) => stats.get(c.id)!.amountDue));

  return (
    <div className="space-y-4">
      <PageHeader title="Credit Cards" subtitle="Credit limit is not our money. Track what we owe and when it's due." actions={<button className="btn-primary" onClick={() => setAction({ type: 'edit' })}>+ Add credit card</button>} />

      <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
        <Icon name="bank" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <b>Debit cards don't go here.</b> A debit card spends straight from your bank account, so there's no limit or bill to pay.
          Add the bank account under <Link to="/accounts" className="font-semibold underline">Accounts</Link>, then choose that account in “Paid with” when you buy something with the debit card.
        </p>
      </div>

      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total card debt" value={totalDebt} tone={totalDebt > 0 ? 'bad' : 'good'} icon="card" />
          <Stat label="Statements to pay" value={totalDue} tone="warn" icon="calendar" />
          <Stat label="Total limit" value={totalLimit} icon="wallet" hint="Borrowing capacity, not cash" />
          <Stat label="Overall utilisation" value={0} icon="chart" display={`${totalLimit ? Math.round((totalDebt / totalLimit) * 100) : 0}%`} tone={totalLimit && totalDebt / totalLimit > 0.8 ? 'bad' : totalLimit && totalDebt / totalLimit > 0.3 ? 'warn' : 'good'} hint="Below 30% is healthy" />
        </div>
      )}

      {cards.length === 0 ? (
        <div className="card">
          <Empty icon="card" title="No cards yet" text="Add each credit card with its limit, current balance, statement closing day and due day. Never enter the card number." action={<button className="btn-primary" onClick={() => setAction({ type: 'edit' })}>Add card</button>} />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cards.map((c) => {
            const s = stats.get(c.id)!;
            const util = s.utilisation;
            const estInterest = Math.round(((s.amountDue - s.minimumPayment) * c.interestRate) / 100 / 12);
            return (
              <div key={c.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{c.name} {c.demo && <Badge className="bg-amber-100 text-amber-800">demo</Badge>}</div>
                    <div className="text-xs muted">{c.bank} · {c.interestRate}% p.a. · annual fee {formatMoney(c.annualFee)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                </div>

                <div>
                  <div className="flex items-end justify-between">
                    <div><div className="text-xs muted">Outstanding balance</div><Money cents={s.balance} className="text-2xl font-bold" /></div>
                    <div className="text-right text-xs muted">Available credit<br /><Money cents={s.available} className="text-sm font-semibold text-slate-900 dark:text-slate-100" /> of <Money cents={c.limit} short /></div>
                  </div>
                  <div className="mt-2"><Progress value={util} tone={util > 0.8 ? 'bad' : util > 0.5 ? 'warn' : 'good'} /></div>
                  <div className="mt-1 text-xs muted">{Math.round(util * 100)}% of limit used{util > 0.8 ? ' — high utilisation' : ''}</div>
                </div>

                {/* The four distinct stages */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Mini label="1. New purchases (not billed yet)" value={s.unbilled} sub={`Closes ${formatDate(s.nextClosing)}`} />
                  <Mini label="2. Statement closed" value={s.statementBalance} sub={`On ${formatDate(s.lastClosing)}`} />
                  <Mini label="3. To pay" value={s.amountDue} sub={s.amountDue ? `Due ${formatDate(s.dueDate)} · min ${formatMoney(s.minimumPayment)}` : 'Nothing due'} strong />
                  <Mini label="4. Paid since statement" value={s.paidSinceClosing} sub="From bank account" />
                </div>
                {s.amountDue > s.minimumPayment && c.interestRate > 0 && (
                  <p className="rounded-xl bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    Paying only the minimum could cost about {formatMoney(estInterest)} in interest next month. Pay the full {formatMoney(s.amountDue)} to avoid it.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary text-xs" onClick={() => setAction({ type: 'payment', card: c })}><Icon name="check" className="h-4 w-4" />Pay</button>
                  <button className="btn-secondary text-xs" onClick={() => setAction({ type: 'purchase', card: c })}>+ Purchase</button>
                  <button className="btn-secondary text-xs" onClick={() => setAction({ type: 'charge', card: c })}>+ Interest/fee</button>
                  <button className="btn-ghost text-xs" onClick={() => setAction({ type: 'history', card: c })}>History</button>
                  <button className="btn-ghost text-xs" onClick={() => setAction({ type: 'edit', card: c })}><Icon name="edit" className="h-4 w-4" />Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {closedCards.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">Closed cards ({closedCards.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {closedCards.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{c.name} <span className="text-xs muted">· {c.bank}</span></span>
                <span className="flex items-center gap-2">
                  <Money cents={cardStatement(c, data.transactions, ref).balance} className="text-xs muted" />
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setAction({ type: 'edit', card: c })} aria-label={`Manage ${c.name}`}><Icon name="edit" className="h-3.5 w-3.5" />Manage</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs muted">How it works: purchases count as spending when you buy. Paying the statement moves money from your bank to the card — it lowers both balances and is never counted as spending a second time.</p>

      <Modal open={!!action && (action.type === 'purchase' || action.type === 'payment' || action.type === 'charge')} onClose={() => setAction(null)} title={action?.type === 'payment' ? 'Record card payment' : action?.type === 'charge' ? 'Add interest or fee' : 'Add card purchase'}>
        {action && (action.type === 'purchase' || action.type === 'payment' || action.type === 'charge') && (
          <ChargeForm key={action.type + action.card.id} action={action} onDone={() => setAction(null)} />
        )}
      </Modal>

      <Modal open={action?.type === 'edit'} onClose={() => setAction(null)} title={action?.type === 'edit' && action.card ? 'Edit credit card' : 'Add credit card'}>
        {action?.type === 'edit' && (
          <CardForm
            initial={action.card}
            onSave={(c) => { update((d) => upsert(d, 'cards', c), 'Card saved'); setAction(null); }}
            onDelete={action.card ? () => { update((d) => deleteCardWithHistory(d, action.card!.id), 'Card deleted'); setAction(null); } : undefined}
            onClose={action.card ? (closed) => { update((d) => setCardClosed(d, action.card!.id, closed), closed ? 'Card closed — history kept' : 'Card reopened'); setAction(null); } : undefined}
            txCount={action.card ? data.transactions.filter((t) => t.cardId === action.card!.id).length : 0}
            balance={action.card ? cardStatement(action.card, data.transactions, ref).balance : 0}
          />
        )}
      </Modal>

      <Modal open={action?.type === 'history'} onClose={() => setAction(null)} title={action?.type === 'history' ? `${action.card.name} history` : ''} wide>
        {action?.type === 'history' && <History card={action.card} />}
      </Modal>
    </div>
  );
}

function ChargeForm({ action, onDone }: { action: { type: 'purchase' | 'payment' | 'charge'; card: Card }; onDone: () => void }) {
  // Reuse the main transaction form, preset to this card.
  return <TransactionForm mode={action.type === 'payment' ? 'payment' : 'card'} presetCardId={action.card.id} onDone={onDone} initialCardKind={action.type === 'charge' ? 'card_charge' : 'card_purchase'} />;
}

function Mini({ label, value, sub, strong }: { label: string; value: number; sub: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl p-2.5 ${strong ? 'bg-brand-50 dark:bg-brand-600/15' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
      <div className="text-[11px] muted">{label}</div>
      <Money cents={value} className="font-semibold" />
      <div className="text-[11px] muted">{sub}</div>
    </div>
  );
}

function History({ card }: { card: Card }) {
  const { data, update } = useStore();
  const txs = data.transactions.filter((t) => t.cardId === card.id).sort((a, b) => b.date.localeCompare(a.date));
  if (!txs.length) return <p className="text-sm muted">No activity on this card yet.</p>;
  const label = { card_purchase: 'Purchase', card_charge: 'Interest/fee', card_payment: 'Payment' } as Record<string, string>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {txs.map((t) => (
        <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{t.description}</div>
            <div className="flex flex-wrap gap-1 text-xs muted">
              {formatDate(t.date)} <Badge>{label[t.kind] ?? t.kind}</Badge>
              {t.instalment && <Badge>instalment {t.instalment.n}/{t.instalment.of}</Badge>}
              {t.recurringId && <Badge>recurring</Badge>}
            </div>
          </div>
          <Money cents={t.kind === 'card_payment' ? -t.amount : t.amount} signed className={t.kind === 'card_payment' ? 'font-semibold text-emerald-600' : 'font-semibold'} />
          <ConfirmButton label="" confirmLabel="Delete?" className="btn-ghost p-1.5 text-red-600" onConfirm={() => update((d) => remove(d, 'transactions', t.id), 'Deleted')} />
        </li>
      ))}
    </ul>
  );
}

function CardForm({ initial, onSave, onDelete, onClose, txCount, balance }: { initial?: Card; onSave: (c: Card) => void; onDelete?: () => void; onClose?: (closed: boolean) => void; txCount: number; balance: number }) {
  const { personName } = useStore();
  const [f, setF] = useState({
    name: initial?.name ?? '',
    bank: initial?.bank ?? '',
    owner: initial?.owner ?? ('joint' as Person),
    limit: initial ? centsToInput(initial.limit) : '',
    balance: initial ? centsToInput(initial.openingBalance) : '0',
    closingDay: String(initial?.closingDay ?? 20),
    dueDay: String(initial?.dueDay ?? 15),
    minPct: String(initial?.minPaymentPercent ?? 2),
    minFloor: initial ? centsToInput(initial.minPaymentFloor) : '25',
    annualFee: initial ? centsToInput(initial.annualFee) : '0',
    rate: String(initial?.interestRate ?? 20.99),
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const limit = parseMoney(f.limit);
    const bal = parseMoney(f.balance || '0');
    const floor = parseMoney(f.minFloor || '0');
    const fee = parseMoney(f.annualFee || '0');
    const cd = Number(f.closingDay), dd = Number(f.dueDay), pct = Number(f.minPct), rate = Number(f.rate);
    if (!f.name.trim()) er.name = 'Required';
    if (/\d{12,}/.test(f.name.replace(/\s/g, ''))) er.name = "Don't enter card numbers";
    if (limit === null || limit <= 0) er.limit = 'Enter the credit limit';
    if (bal === null) er.balance = 'Invalid amount';
    if (!Number.isInteger(cd) || cd < 1 || cd > 28) er.closingDay = '1–28';
    if (!Number.isInteger(dd) || dd < 1 || dd > 28) er.dueDay = '1–28';
    if (!(pct >= 0 && pct <= 100)) er.minPct = '0–100';
    if (!(rate >= 0 && rate <= 100)) er.rate = '0–100';
    if (floor === null || fee === null) er.minFloor = 'Invalid amount';
    setErr(er);
    if (Object.keys(er).length) return;
    onSave({
      id: initial?.id ?? uid(), name: f.name.trim(), bank: f.bank.trim(), owner: f.owner, limit: limit!, openingBalance: bal!,
      closingDay: cd, dueDay: dd, minPaymentPercent: pct, minPaymentFloor: floor!, annualFee: fee!, interestRate: rate, demo: initial?.demo,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Card name" error={err.name}><input autoFocus className="input" value={f.name} onChange={set('name')} placeholder="e.g. Low Rate Visa" /></Field>
        <Field label="Bank"><input className="input" value={f.bank} onChange={set('bank')} /></Field>
        <Field label="Credit limit" error={err.limit}><input className="input" inputMode="decimal" value={f.limit} onChange={set('limit')} /></Field>
        <Field label={initial ? 'Balance when added' : 'Current balance owed'} error={err.balance}><input className="input" inputMode="decimal" value={f.balance} onChange={set('balance')} /></Field>
        <Field label="Statement closes (day)" error={err.closingDay}><input className="input" inputMode="numeric" value={f.closingDay} onChange={set('closingDay')} /></Field>
        <Field label="Payment due (day)" error={err.dueDay}><input className="input" inputMode="numeric" value={f.dueDay} onChange={set('dueDay')} /></Field>
        <Field label="Minimum payment %" error={err.minPct}><input className="input" inputMode="decimal" value={f.minPct} onChange={set('minPct')} /></Field>
        <Field label="Minimum at least ($)" error={err.minFloor}><input className="input" inputMode="decimal" value={f.minFloor} onChange={set('minFloor')} /></Field>
        <Field label="Interest rate % p.a." error={err.rate}><input className="input" inputMode="decimal" value={f.rate} onChange={set('rate')} /></Field>
        <Field label="Annual fee"><input className="input" inputMode="decimal" value={f.annualFee} onChange={set('annualFee')} /></Field>
        <Field label="Owner">
          <select className="input" value={f.owner} onChange={set('owner')}>
            <option value="me">{personName('me')}</option><option value="patrick">{personName('patrick')}</option><option value="joint">Joint</option>
          </select>
        </Field>
      </div>
      <p className="text-xs muted">Only credit cards here (they have a limit and a bill). Debit cards are just your bank account — add it under Accounts.</p>
      <p className="text-xs muted">🔒 Never store the card number, CVV or PIN. A nickname is enough.</p>
      <button className="btn-primary w-full">Save</button>
      {initial && (onClose || onDelete) && (
        <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          {onClose && (
            <div>
              <button type="button" className="btn-secondary" onClick={() => onClose(!initial.closed)}>
                <Icon name={initial.closed ? 'repeat' : 'check'} className="h-4 w-4" />{initial.closed ? 'Reopen card' : 'Close card (keep history)'}
              </button>
              {!initial.closed && (
                <p className="mt-1 text-xs muted">
                  For a cancelled card: it disappears from Cards and from the lists, but past spending stays in your reports.
                  {balance > 0 && <> ⚠️ It still owes {formatMoney(balance)}, which keeps counting as debt until paid.</>}
                </p>
              )}
            </div>
          )}
          {onDelete && (
            <div>
              <ConfirmButton
                label={txCount ? `Delete card + ${txCount} transaction${txCount === 1 ? '' : 's'}` : 'Delete card'}
                confirmLabel={txCount ? `Tap again: delete card and ${txCount} transaction${txCount === 1 ? '' : 's'}` : 'Tap again to delete'}
                onConfirm={onDelete}
              />
              <p className="mt-1 text-xs muted">
                {txCount
                  ? 'For a card added by mistake: removes the card and every purchase, fee and payment on it from your spending history. Cannot be undone (except from a backup).'
                  : 'Removes the card.'}
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
