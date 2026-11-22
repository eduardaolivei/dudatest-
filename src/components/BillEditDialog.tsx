import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import type { Bill } from '../domain/finance';
import type { Transaction } from '../domain/types';
import { centsToInput, formatMoney, parseMoney } from '../domain/money';
import { formatDate } from '../domain/dates';
import { newTx, remove, upsert } from '../store/actions';
import { ConfirmButton, Field, Modal, Segmented } from './ui';
import { TransactionForm } from './TransactionForm';
import { RuleForm } from '../pages/Recurring';

export type BillEditTarget = { type: 'bill'; bill: Bill } | { type: 'paid'; tx: Transaction };

/** Fix a bill's amount, date or details — for one-off bills, recurring bills and paid ones. */
export function BillEditDialog({ target, onClose }: { target: BillEditTarget | null; onClose: () => void }) {
  if (!target) return null;
  const title = target.type === 'paid' ? 'Edit paid bill' : 'Edit bill';
  return (
    <Modal open onClose={onClose} title={title}>
      {target.type === 'paid' ? <PaidEdit tx={target.tx} onDone={onClose} /> : <UnpaidEdit bill={target.bill} onDone={onClose} />}
    </Modal>
  );
}

function UnpaidEdit({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const { data, update } = useStore();

  if (bill.source === 'card') {
    return (
      <div className="space-y-3 text-sm">
        <p>The statement amount is calculated from the purchases on <b>{data.cards.find((c) => c.id === bill.cardId)?.name ?? 'this card'}</b>, and the due date comes from the card's settings.</p>
        <p className="muted">To fix it, edit or delete the wrong purchase, or change the card's due day.</p>
        <Link to="/cards" className="btn-primary" onClick={onDone}>Go to Cards</Link>
      </div>
    );
  }

  if (bill.source === 'tx') {
    const tx = data.transactions.find((t) => t.id === bill.txId);
    if (!tx) return null;
    return (
      <div className="space-y-4">
        <TransactionForm key={tx.id} mode="bill" initial={tx} onDone={onDone} />
        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <ConfirmButton label="Delete this bill" confirmLabel="Tap again to delete" onConfirm={() => { update((d) => remove(d, 'transactions', tx.id), 'Bill deleted'); onDone(); }} />
        </div>
      </div>
    );
  }

  return <RecurringEdit bill={bill} onDone={onDone} />;
}

function RecurringEdit({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const { data, update } = useStore();
  const rule = data.recurring.find((r) => r.id === bill.ruleId);
  const [scope, setScope] = useState<'once' | 'future'>('once');
  const [amount, setAmount] = useState(centsToInput(bill.amount));
  const [due, setDue] = useState(bill.dueDate);
  const [err, setErr] = useState('');
  if (!rule) return null;

  function saveOnce(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setErr('Enter a valid amount, e.g. 189.50');
    if (!due) return setErr('Pick a due date');
    // A pending bill linked to this occurrence replaces it (the rule itself is unchanged).
    const tx = newTx({
      kind: 'expense', status: 'pending', amount: cents, description: rule!.description, date: due, dueDate: due,
      category: rule!.category, subcategory: rule!.subcategory, person: rule!.person, accountId: rule!.accountId,
      paymentMethod: rule!.paymentMethod, recurringId: rule!.id, occurrence: bill.occurrence,
    });
    update((d) => upsert(d, 'transactions', tx), `Updated: ${formatMoney(cents)} due ${formatDate(due)}`);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
        <div className="font-medium">{rule.description}</div>
        <div className="muted">Repeats {rule.frequency} · this one due {formatDate(bill.dueDate)}</div>
      </div>
      <Segmented value={scope} onChange={setScope} options={[{ value: 'once', label: 'Only this bill' }, { value: 'future', label: 'This and future bills' }]} />
      {scope === 'once' ? (
        <form onSubmit={saveOnce} className="space-y-3" noValidate>
          {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><input className="input text-lg font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Bill amount" /></Field>
            <Field label="Due date"><input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Bill due date" /></Field>
          </div>
          <p className="text-xs muted">Changes only this bill. Next ones keep {formatMoney(rule.amount)}.</p>
          <button className="btn-primary w-full py-3">Save this bill</button>
        </form>
      ) : (
        <>
          <p className="text-xs muted">Changes every future bill. Bills you already paid keep their real amount.</p>
          <RuleForm
            rule={rule}
            onSave={(r) => { update((d) => upsert(d, 'recurring', r), 'Recurring bill updated'); onDone(); }}
            onDelete={() => { update((d) => remove(d, 'recurring', rule.id), 'Recurring bill deleted — paid ones kept'); onDone(); }}
          />
        </>
      )}
    </div>
  );
}

function PaidEdit({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const { update } = useStore();
  const undo = () => {
    update((d) =>
      tx.recurringId
        ? remove(d, 'transactions', tx.id) // the occurrence becomes unpaid again
        : upsert(d, 'transactions', { ...tx, status: 'pending', date: tx.dueDate ?? tx.date }),
    'Marked as not paid');
    onDone();
  };
  return (
    <div className="space-y-4">
      <TransactionForm key={tx.id} mode="expense" initial={tx} onDone={onDone} />
      {tx.kind === 'expense' && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <ConfirmButton label="Not paid yet (undo)" confirmLabel="Tap again to undo payment" className="btn-secondary" icon="repeat" onConfirm={undo} />
        </div>
      )}
    </div>
  );
}
