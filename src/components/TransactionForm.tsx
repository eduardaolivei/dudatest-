import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useStore, type QuickAddMode } from '../store/StoreContext';
import type { Frequency, Person, RecurringRule, Transaction, TxKind } from '../domain/types';
import { EXPENSE_CATEGORIES, INCOME_SOURCES, PAYMENT_METHODS, categoryNames } from '../domain/categories';
import { centsToInput, formatMoney, parseMoney } from '../domain/money';
import { today } from '../domain/dates';
import { cardStatement } from '../domain/finance';
import { addInstalments, payCard, settleOccurrence, upsert } from '../store/actions';
import { uid } from '../store/id';
import { Field, Segmented } from './ui';

const kindToMode: Record<TxKind, QuickAddMode> = {
  income: 'income', expense: 'expense', transfer: 'transfer', card_purchase: 'card', card_charge: 'card', card_payment: 'payment',
};

export const MODE_TITLES: Record<QuickAddMode, string> = {
  expense: 'Add Expense', income: 'Add Income', bill: 'Add Bill', card: 'Credit Card Purchase', payment: 'Record Card Payment', transfer: 'Transfer Between Accounts',
};

interface Props {
  mode: QuickAddMode;
  initial?: Transaction;
  onDone: () => void;
  presetCardId?: string;
  initialCardKind?: 'card_purchase' | 'card_charge';
}

export function TransactionForm({ mode: initialMode, initial, onDone, presetCardId, initialCardKind }: Props) {
  const { data, update, personName } = useStore();
  const editing = !!initial;
  const mode = initial ? (initial.kind === 'expense' && initial.status === 'pending' ? 'bill' : kindToMode[initial.kind]) : initialMode;

  const bankAccounts = data.accounts;
  const defaultAccount = bankAccounts.find((a) => a.type !== 'savings')?.id ?? '';
  const defaultCard = presetCardId ?? data.cards[0]?.id ?? '';

  const [amount, setAmount] = useState(initial ? centsToInput(initial.amount) : '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState(initial?.category && initial.category in EXPENSE_CATEGORIES ? initial.category : 'Groceries');
  const [subcategory, setSubcategory] = useState(initial?.subcategory ?? '');
  const [person, setPerson] = useState<Person>(initial?.person ?? 'joint');
  const [date, setDate] = useState(initial?.date ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? today());
  // "source" = where money comes from: "acc:<id>" or "card:<id>"
  const [source, setSource] = useState(
    initial?.cardId && initial.kind !== 'card_payment' ? `card:${initial.cardId}` : initial?.accountId ? `acc:${initial.accountId}` : defaultAccount ? `acc:${defaultAccount}` : defaultCard ? `card:${defaultCard}` : '',
  );
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccount);
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? bankAccounts.find((a) => a.id !== defaultAccount)?.id ?? '');
  const [cardId, setCardId] = useState(initial?.cardId ?? defaultCard);
  // presetCardId (from a card page) wins over the first card
  const [cardKind, setCardKind] = useState<'card_purchase' | 'card_charge'>(initial?.kind === 'card_charge' ? 'card_charge' : (initialCardKind ?? 'card_purchase'));
  const [instalments, setInstalments] = useState('1');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? '');
  const [incomeSource, setIncomeSource] = useState(initial?.incomeSource ?? 'Salary');
  const [status, setStatus] = useState<'paid' | 'pending'>(initial?.status ?? (initialMode === 'bill' ? 'pending' : 'paid'));
  const [frequency, setFrequency] = useState<Frequency>('one-time');
  const [alreadyReceived, setAlreadyReceived] = useState(true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [more, setMore] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const statement = useMemo(() => {
    const c = data.cards.find((x) => x.id === cardId);
    return c ? cardStatement(c, data.transactions, today()) : null;
  }, [data, cardId]);

  const needsAccount = mode === 'income' || mode === 'transfer' || mode === 'payment';
  const needsCard = mode === 'card' || mode === 'payment';
  const missingSetup =
    (needsAccount && bankAccounts.length === 0) || (needsCard && data.cards.length === 0) || (mode === 'transfer' && bankAccounts.length < 2);

  if (missingSetup) {
    return (
      <div className="space-y-3 text-sm">
        <p className="muted">
          {needsCard && data.cards.length === 0
            ? 'Add a credit card first, then you can record purchases and payments on it.'
            : mode === 'transfer'
              ? 'You need at least two accounts to record a transfer.'
              : 'Add a bank account first so we know where the money goes.'}
        </p>
        <Link className="btn-primary" to={needsCard && data.cards.length === 0 ? '/cards' : '/accounts'} onClick={onDone}>
          {needsCard && data.cards.length === 0 ? 'Add a card' : 'Add an account'}
        </Link>
      </div>
    );
  }

  function validate() {
    const e: Record<string, string> = {};
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) e.amount = 'Enter an amount greater than $0 (e.g. 25.90)';
    if (mode !== 'payment' && mode !== 'transfer' && !description.trim()) e.description = 'Add a short description';
    if (mode === 'transfer' && accountId === toAccountId) e.toAccountId = 'Choose two different accounts';
    if ((mode === 'expense' || (mode === 'bill' && status === 'paid')) && !source) e.source = 'Choose how it was paid';
    if (mode === 'card') {
      const n = Number(instalments);
      if (!Number.isInteger(n) || n < 1 || n > 48) e.instalments = 'Between 1 and 48';
    }
    if (!date) e.date = 'Pick a date';
    setErrors(e);
    return Object.keys(e).length === 0 ? cents! : null;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const cents = validate();
    if (cents === null) return;
    const id = initial?.id ?? uid();
    const common = { id, amount: cents, person, notes: notes.trim() || undefined, createdAt: initial?.createdAt ?? new Date().toISOString(), recurringId: initial?.recurringId, occurrence: initial?.occurrence, groupId: initial?.groupId, instalment: initial?.instalment, demo: initial?.demo };

    // Recurring income / bill => create a rule (expected items, user confirms each one).
    if (!editing && frequency !== 'one-time' && (mode === 'income' || mode === 'bill' || mode === 'expense')) {
      const isCard = source.startsWith('card:');
      const rule: RecurringRule = {
        id: uid(),
        kind: mode === 'income' ? 'income' : 'expense',
        description: description.trim(),
        amount: cents,
        frequency: frequency as RecurringRule['frequency'],
        startDate: mode === 'income' ? date : dueDate,
        category: mode === 'income' ? 'Income' : category,
        subcategory: mode === 'income' ? undefined : subcategory || undefined,
        person,
        accountId: mode === 'income' ? accountId : isCard ? undefined : source.slice(4),
        cardId: mode !== 'income' && isCard ? source.slice(5) : undefined,
        incomeSource: mode === 'income' ? incomeSource : undefined,
        paymentMethod: paymentMethod || undefined,
        notes: notes.trim() || undefined,
      };
      update((d) => {
        let next = upsert(d, 'recurring', rule);
        const firstConfirmed = mode === 'income' ? alreadyReceived : status === 'paid' || mode === 'expense';
        if (firstConfirmed) next = settleOccurrence(next, rule, rule.startDate, { date: mode === 'income' ? date : status === 'paid' ? date : rule.startDate });
        return next;
      }, `Recurring ${mode === 'income' ? 'income' : 'bill'} saved`);
      onDone();
      return;
    }

    if (mode === 'payment') {
      const card = data.cards.find((c) => c.id === cardId)!;
      if (editing) {
        update((d) => upsert(d, 'transactions', { ...initial!, amount: cents, date, accountId, cardId, notes: notes.trim() || undefined }), 'Payment updated');
      } else {
        update((d) => payCard(d, card, cents, accountId, date), `Payment of ${formatMoney(cents)} recorded`);
      }
      onDone();
      return;
    }

    let tx: Transaction;
    if (mode === 'income') {
      tx = { ...common, kind: 'income', description: description.trim(), date, category: 'Income', accountId, incomeSource, status: 'paid' };
    } else if (mode === 'transfer') {
      tx = { ...common, kind: 'transfer', description: description.trim() || 'Transfer', date, category: 'Transfer', accountId, toAccountId, status: 'paid' };
    } else if (mode === 'card') {
      tx = { ...common, kind: cardKind, description: description.trim(), date, category: cardKind === 'card_charge' ? 'Financial' : category, subcategory: cardKind === 'card_charge' ? subcategory || 'Interest' : subcategory || undefined, cardId, status: 'paid', paymentMethod: 'Credit card' };
    } else {
      // expense or bill
      const isCard = source.startsWith('card:');
      const st = mode === 'bill' ? status : 'paid';
      tx = {
        ...common,
        kind: isCard && st === 'paid' ? 'card_purchase' : 'expense',
        description: description.trim(),
        date: mode === 'bill' && st === 'pending' ? dueDate : date,
        dueDate: mode === 'bill' ? dueDate : undefined,
        category,
        subcategory: subcategory || undefined,
        status: st,
        accountId: isCard ? undefined : source.slice(4) || undefined,
        cardId: isCard ? source.slice(5) : undefined,
        paymentMethod: paymentMethod || (isCard ? 'Credit card' : undefined),
      };
    }

    const n = Number(instalments);
    if (!editing && mode === 'card' && n > 1) {
      update((d) => addInstalments(d, tx, n), `${n} instalments of ~${formatMoney(Math.round(cents / n))} added`);
    } else {
      update((d) => upsert(d, 'transactions', tx), editing ? 'Changes saved' : 'Saved');
    }
    onDone();
  }

  const subcats = EXPENSE_CATEGORIES[category] ?? [];
  const sourceSelect = (
    <Field label={mode === 'bill' ? 'Pay from' : 'Paid with'} error={errors.source}>
      <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
        {bankAccounts.length === 0 && data.cards.length === 0 && <option value="">— add an account first —</option>}
        {bankAccounts.length > 0 && (
          <optgroup label="Bank / cash">
            {bankAccounts.map((a) => <option key={a.id} value={`acc:${a.id}`}>{a.name}</option>)}
          </optgroup>
        )}
        {data.cards.length > 0 && (
          <optgroup label="Credit card">
            {data.cards.map((c) => <option key={c.id} value={`card:${c.id}`}>{c.name}</option>)}
          </optgroup>
        )}
      </select>
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Amount (AUD)" error={errors.amount}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg muted">$</span>
          <input autoFocus inputMode="decimal" className="input pl-7 text-2xl font-semibold" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        </div>
      </Field>

      {mode === 'payment' && statement && (
        <div className="flex flex-wrap gap-2">
          {statement.minimumPayment > 0 && <button type="button" className="btn-secondary text-xs" onClick={() => setAmount(centsToInput(statement.minimumPayment))}>Minimum {formatMoney(statement.minimumPayment)}</button>}
          {statement.amountDue > 0 && <button type="button" className="btn-secondary text-xs" onClick={() => setAmount(centsToInput(statement.amountDue))}>Statement {formatMoney(statement.amountDue)}</button>}
          {statement.balance > 0 && <button type="button" className="btn-secondary text-xs" onClick={() => setAmount(centsToInput(statement.balance))}>Full balance {formatMoney(statement.balance)}</button>}
        </div>
      )}

      {mode !== 'payment' && (
        <Field label={mode === 'transfer' ? 'Description (optional)' : 'Description'} error={errors.description}>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={mode === 'income' ? 'e.g. My Salary' : mode === 'transfer' ? 'e.g. Weekly share to joint' : 'e.g. Woolworths'} />
        </Field>
      )}

      {mode === 'card' && (
        <Segmented value={cardKind} onChange={setCardKind} options={[{ value: 'card_purchase', label: 'Purchase' }, { value: 'card_charge', label: 'Interest / Fee' }]} size="sm" />
      )}

      {(mode === 'expense' || mode === 'bill' || (mode === 'card' && cardKind === 'card_purchase')) && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select className="input" value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }}>
              {categoryNames.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Subcategory">
            <select className="input" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
              <option value="">—</option>
              {subcats.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
      )}
      {mode === 'card' && cardKind === 'card_charge' && (
        <Field label="Type">
          <select className="input" value={subcategory || 'Interest'} onChange={(e) => setSubcategory(e.target.value)}>
            <option>Interest</option><option>Card Fees</option><option>Bank Fees</option>
          </select>
        </Field>
      )}

      {mode === 'income' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Income source">
            <select className="input" value={incomeSource} onChange={(e) => setIncomeSource(e.target.value)}>
              {INCOME_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Into account">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      )}

      {mode === 'transfer' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="To" error={errors.toAccountId}>
            <select className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      )}

      {(mode === 'card' || mode === 'payment') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Card">
            <select className="input" value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {data.cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {mode === 'payment' ? (
            <Field label="Paid from account">
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          ) : (
            !editing && (
              <Field label="Instalments" error={errors.instalments}>
                <input className="input" inputMode="numeric" value={instalments} onChange={(e) => setInstalments(e.target.value)} />
              </Field>
            )
          )}
        </div>
      )}

      {(mode === 'expense' || mode === 'bill') && sourceSelect}

      <div className="grid grid-cols-2 gap-3">
        {mode !== 'payment' && mode !== 'transfer' && (
          <Field label="Person">
            <select className="input" value={person} onChange={(e) => setPerson(e.target.value as Person)}>
              <option value="me">{personName('me')}</option>
              <option value="patrick">{personName('patrick')}</option>
              <option value="joint">Joint</option>
            </select>
          </Field>
        )}
        {mode === 'transfer' && (
          <Field label="Transferred by">
            <select className="input" value={person} onChange={(e) => setPerson(e.target.value as Person)}>
              <option value="me">{personName('me')}</option>
              <option value="patrick">{personName('patrick')}</option>
              <option value="joint">Joint</option>
            </select>
          </Field>
        )}
        {mode === 'bill' ? (
          <Field label="Due date">
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        ) : (
          <Field label={mode === 'income' ? 'Payment date' : 'Date'} error={errors.date}>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        {mode === 'payment' && <div />}
      </div>

      {mode === 'bill' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as 'paid' | 'pending')}>
              <option value="pending">Pending (not paid yet)</option>
              <option value="paid">Already paid</option>
            </select>
          </Field>
          {status === 'paid' && (
            <Field label="Paid on">
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      {!editing && (mode === 'income' || mode === 'bill' || mode === 'expense') && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frequency">
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              <option value="one-time">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
          {mode === 'income' && frequency !== 'one-time' && (
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={alreadyReceived} onChange={(e) => setAlreadyReceived(e.target.checked)} className="h-4 w-4" />
              This payment already received
            </label>
          )}
        </div>
      )}
      {!editing && frequency !== 'one-time' && (
        <p className="rounded-xl bg-brand-50 p-2.5 text-xs text-brand-700 dark:bg-brand-600/15 dark:text-brand-100">
          Future {mode === 'income' ? 'payments appear as "expected" income' : 'occurrences appear in Bills'}. Nothing is paid or received automatically — you confirm each one.
        </p>
      )}

      {!more ? (
        <button type="button" className="text-sm font-medium text-brand-600" onClick={() => setMore(true)}>+ More details</button>
      ) : (
        <>
          {(mode === 'expense' || mode === 'bill') && (
            <Field label="Payment method">
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">—</option>
                {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes">
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      )}

      {mode === 'payment' && (
        <p className="text-xs muted">A card payment lowers both your bank balance and the card debt. It is not counted as spending again — the purchases already were.</p>
      )}

      <div className="flex gap-2 pt-1">
        <button type="submit" className="btn-primary flex-1 py-3">{editing ? 'Save changes' : 'Save'}</button>
        <button type="button" className="btn-secondary py-3" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

