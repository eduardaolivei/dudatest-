import { useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import type { Account, Person } from '../domain/types';
import { accountBalance } from '../domain/finance';
import { centsToInput, parseMoney } from '../domain/money';
import { remove, upsert } from '../store/actions';
import { uid } from '../store/id';
import { Badge, ConfirmButton, Empty, Field, Modal, Money, PageHeader } from '../components/ui';
import { Icon } from '../components/Icon';

export default function Accounts() {
  const { data, update, personName, openQuickAdd } = useStore();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const used = (id: string) => data.transactions.some((t) => t.accountId === id || t.toAccountId === id);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Bank, savings and cash. Balances are calculated from your opening balance plus every transaction."
        actions={
          <>
            <button className="btn-secondary" onClick={() => openQuickAdd('transfer')}><Icon name="swap" className="h-4 w-4" />Transfer</button>
            <button className="btn-primary" onClick={() => setEditing('new')}>+ Add account</button>
          </>
        }
      />
      <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        💳 Your <b>debit card</b> belongs here: it spends from this account. Credit cards go under Cards.<br />
        🔒 Never store account numbers, BSBs, card numbers or passwords here. A nickname is all the app needs.
      </p>
      {data.accounts.length === 0 ? (
        <div className="card">
          <Empty icon="bank" title="No accounts yet" text="Add your everyday, joint and savings accounts with today's balance to get started." action={<button className="btn-primary" onClick={() => setEditing('new')}>Add account</button>} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.accounts.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="mt-1 flex gap-1.5">
                    <Badge>{a.type}</Badge>
                    <Badge>{personName(a.owner)}</Badge>
                    {a.demo && <Badge className="bg-amber-100 text-amber-800">demo</Badge>}
                  </div>
                </div>
                <button className="btn-ghost p-2" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}><Icon name="edit" className="h-4 w-4" /></button>
              </div>
              <Money cents={accountBalance(a, data.transactions)} className="mt-3 block text-2xl font-semibold" />
              <div className="text-xs muted">Opening balance <Money cents={a.openingBalance} /></div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add account' : 'Edit account'}>
        {editing && (
          <AccountForm
            initial={editing === 'new' ? undefined : editing}
            onSave={(a) => {
              update((d) => upsert(d, 'accounts', a), 'Account saved');
              setEditing(null);
            }}
            onDelete={
              editing !== 'new'
                ? () => {
                    if (used(editing.id)) return;
                    update((d) => remove(d, 'accounts', editing.id), 'Account deleted');
                    setEditing(null);
                  }
                : undefined
            }
            inUse={editing !== 'new' && used(editing.id)}
          />
        )}
      </Modal>
    </div>
  );
}

function AccountForm({ initial, onSave, onDelete, inUse }: { initial?: Account; onSave: (a: Account) => void; onDelete?: () => void; inUse: boolean }) {
  const { personName } = useStore();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<Account['type']>(initial?.type ?? 'bank');
  const [owner, setOwner] = useState<Person>(initial?.owner ?? 'joint');
  const [balance, setBalance] = useState(initial ? centsToInput(initial.openingBalance) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    const cents = parseMoney(balance || '0');
    if (!name.trim()) err.name = 'Give the account a nickname';
    if (cents === null) err.balance = 'Enter a valid amount, e.g. 1520.35';
    setErrors(err);
    if (Object.keys(err).length) return;
    onSave({ id: initial?.id ?? uid(), name: name.trim(), type, owner, openingBalance: cents!, demo: initial?.demo });
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Nickname" error={errors.name}><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CommBank Everyday" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as Account['type'])}>
            <option value="bank">Bank (everyday)</option>
            <option value="savings">Savings</option>
            <option value="cash">Cash</option>
          </select>
        </Field>
        <Field label="Owner">
          <select className="input" value={owner} onChange={(e) => setOwner(e.target.value as Person)}>
            <option value="me">{personName('me')}</option>
            <option value="patrick">{personName('patrick')}</option>
            <option value="joint">Joint</option>
          </select>
        </Field>
      </div>
      <Field label={initial ? 'Opening balance' : "Today's balance"} error={errors.balance}>
        <input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
      </Field>
      {type === 'savings' && <p className="text-xs muted">Savings accounts are shown as Savings and are not counted as money available to spend.</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1">Save</button>
        {onDelete && (inUse ? <span className="self-center text-xs muted">Has transactions — can't delete</span> : <ConfirmButton onConfirm={onDelete} />)}
      </div>
    </form>
  );
}
