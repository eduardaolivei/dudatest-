import { useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import type { Bill } from '../domain/finance';
import type { RecurringRule } from '../domain/types';
import { centsToInput, formatMoney, parseMoney } from '../domain/money';
import { formatDate, today } from '../domain/dates';
import { markPaid, settleOccurrence } from '../store/actions';
import { Field, Modal } from './ui';
import { TransactionForm } from './TransactionForm';

export type SettleTarget =
  | { type: 'bill'; bill: Bill }
  | { type: 'income'; rule: RecurringRule; occurrence: string };

/**
 * Confirm a payment / receipt. The user can adjust the real amount and date
 * (actual vs forecast). Nothing is ever settled automatically.
 */
export function SettleDialog({ target, onClose }: { target: SettleTarget | null; onClose: () => void }) {
  if (!target) return null;
  if (target.type === 'bill' && target.bill.source === 'card') {
    return (
      <Modal open onClose={onClose} title="Pay card statement">
        <TransactionForm mode="payment" presetCardId={target.bill.cardId} onDone={onClose} />
      </Modal>
    );
  }
  return <SettleForm target={target} onClose={onClose} />;
}

function SettleForm({ target, onClose }: { target: SettleTarget; onClose: () => void }) {
  const { data, update } = useStore();
  const isIncome = target.type === 'income';
  const rule = target.type === 'income' ? target.rule : data.recurring.find((r) => r.id === target.bill.ruleId);
  const tx = target.type === 'bill' && target.bill.txId ? data.transactions.find((t) => t.id === target.bill.txId) : undefined;
  const expected = target.type === 'income' ? target.rule.amount : target.bill.amount;
  const onCard = target.type === 'bill' && target.bill.onCard;

  const [amount, setAmount] = useState(centsToInput(expected));
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(rule?.accountId ?? tx?.accountId ?? data.accounts.find((a) => a.type !== 'savings')?.id ?? '');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return setError('Enter a valid amount');
    if (!onCard && !accountId) return setError('Choose an account (add one in Accounts first)');
    if (target.type === 'income') {
      update((d) => settleOccurrence(d, target.rule, target.occurrence, { amount: cents, date, accountId }), `Received ${formatMoney(cents)}`);
    } else if (target.bill.source === 'recurring' && rule) {
      update((d) => settleOccurrence(d, rule, target.bill.occurrence!, { amount: cents, date, accountId: onCard ? undefined : accountId }), 'Marked as paid');
    } else if (target.bill.txId) {
      update((d) => {
        const next = markPaid(d, target.bill.txId!, date, accountId);
        return { ...next, transactions: next.transactions.map((t) => (t.id === target.bill.txId ? { ...t, amount: cents } : t)) };
      }, 'Marked as paid');
    }
    onClose();
  }

  const title = target.type === 'income' ? target.rule.description : target.bill.description;
  const due = target.type === 'income' ? target.occurrence : target.bill.dueDate;

  return (
    <Modal open onClose={onClose} title={isIncome ? 'Confirm income received' : 'Mark bill as paid'}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <div className="font-medium">{title}</div>
          <div className="muted">{isIncome ? 'Expected' : 'Due'} {formatDate(due)} · {formatMoney(expected)}</div>
        </div>
        <Field label={isIncome ? 'Amount actually received' : 'Amount actually paid'} error={error}>
          <input autoFocus className="input text-xl font-semibold" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={isIncome ? 'Received on' : 'Paid on'}>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {onCard ? (
            <div className="self-end pb-2 text-xs muted">Charged to {data.cards.find((c) => c.id === target.bill.cardId)?.name ?? 'card'}</div>
          ) : (
            <Field label={isIncome ? 'Into account' : 'From account'}>
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <button className="btn-primary w-full py-3">{isIncome ? 'Confirm received' : 'Confirm paid'}</button>
      </form>
    </Modal>
  );
}
