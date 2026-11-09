import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import type { Transaction } from '../domain/types';
import { isIncome, isSpending, matchPerson, monthRange } from '../domain/finance';
import { formatDate, inRange, today } from '../domain/dates';
import { sum } from '../domain/money';
import { categoryNames } from '../domain/categories';
import { duplicateTx, remove } from '../store/actions';
import { Badge, ConfirmButton, Empty, Modal, Money, PageHeader, StatusBadge } from '../components/ui';
import { TransactionForm } from '../components/TransactionForm';
import { Icon } from '../components/Icon';
import { downloadCSV } from '../components/exporters';

type KindFilter = 'all' | 'income' | 'spending' | 'transfer' | 'card_payment' | 'pending';

const KIND_LABEL: Record<Transaction['kind'], string> = {
  income: 'Income', expense: 'Expense', transfer: 'Transfer', card_purchase: 'Card purchase', card_charge: 'Card interest/fee', card_payment: 'Card payment',
};

export default function Transactions() {
  const { data, update, person, month, openQuickAdd } = useStore();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [category, setCategory] = useState('');
  const [allTime, setAllTime] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Open edit dialog when arriving from search (?edit=<id>)
  useEffect(() => {
    const id = params.get('edit');
    if (id) {
      const t = data.transactions.find((x) => x.id === id);
      if (t) setEditing(t);
      params.delete('edit');
      setParams(params, { replace: true });
    }
  }, [params, setParams, data.transactions]);

  const accName = useMemo(() => new Map([...data.accounts.map((a) => [a.id, a.name] as const), ...data.cards.map((c) => [c.id, c.name] as const)]), [data]);

  const list = useMemo(() => {
    const r = monthRange(month);
    const s = q.trim().toLowerCase();
    return data.transactions
      .filter((t) => matchPerson(t.person, person))
      .filter((t) => allTime || inRange(t.date, r.start, r.end))
      .filter((t) => {
        switch (kind) {
          case 'income': return t.kind === 'income';
          case 'spending': return isSpending(t);
          case 'transfer': return t.kind === 'transfer';
          case 'card_payment': return t.kind === 'card_payment';
          case 'pending': return t.status === 'pending';
          default: return true;
        }
      })
      .filter((t) => !category || t.category === category)
      .filter((t) => !s || [t.description, t.notes, t.subcategory, t.category, t.incomeSource].some((x) => x?.toLowerCase().includes(s)) || (t.amount / 100).toFixed(2).includes(s))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data, person, month, q, kind, category, allTime]);

  const totals = { income: sum(list.filter(isIncome).map((t) => t.amount)), spending: sum(list.filter(isSpending).map((t) => t.amount)) };

  const groups = useMemo(() => {
    const g = new Map<string, Transaction[]>();
    for (const t of list) g.set(t.date, [...(g.get(t.date) ?? []), t]);
    return [...g.entries()];
  }, [list]);

  function exportCSV() {
    downloadCSV(
      `transactions-${allTime ? 'all' : month.slice(0, 7)}.csv`,
      ['Date', 'Type', 'Description', 'Category', 'Subcategory', 'Person', 'Account/Card', 'Status', 'Amount (AUD)', 'Notes'],
      list.map((t) => [formatDate(t.date), KIND_LABEL[t.kind], t.description, t.category, t.subcategory ?? '', t.person, accName.get(t.cardId ?? t.accountId ?? '') ?? '', t.status, (t.amount / 100).toFixed(2), t.notes ?? '']),
    );
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle={allTime ? 'All time' : 'Selected month'}
        actions={
          <>
            <button className="btn-secondary" onClick={exportCSV} disabled={!list.length}><Icon name="download" className="h-4 w-4" />CSV</button>
            <button className="btn-primary" onClick={() => openQuickAdd('expense')}>+ Add</button>
          </>
        }
      />

      <div className="card mb-3 space-y-2">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search description, notes, amount…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Type">
            <option value="all">All types</option>
            <option value="spending">Spending</option>
            <option value="income">Income</option>
            <option value="pending">Pending bills</option>
            <option value="transfer">Transfers</option>
            <option value="card_payment">Card payments</option>
          </select>
          <select className="input w-auto py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categoryNames.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> All time
          </label>
        </div>
        <div className="flex gap-4 text-sm">
          <span>In: <Money cents={totals.income} className="font-semibold text-emerald-600" /></span>
          <span>Spent: <Money cents={totals.spending} className="font-semibold" /></span>
          <span className="muted">{list.length} items</span>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty title="No transactions here" text={data.transactions.length ? 'Try another month, person or filter.' : 'Tap + to record your first expense or income. It takes under 20 seconds.'} action={<button className="btn-primary" onClick={() => openQuickAdd('expense')}>Add Transaction</button>} />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([date, txs]) => (
            <div key={date} className="card p-0">
              <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold muted dark:border-slate-800">{formatDate(date)}{date === today() ? ' · Today' : ''}</div>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {txs.map((t) => {
                  const positive = t.kind === 'income';
                  const neutral = t.kind === 'transfer' || t.kind === 'card_payment';
                  return (
                    <li key={t.id} className="flex items-center gap-2 px-4 py-2.5">
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{t.description}</span>
                          {t.status === 'pending' && <StatusBadge status="pending" />}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-xs muted">
                          <span>{t.subcategory ?? t.category}</span>·<span>{accName.get(t.cardId ?? t.accountId ?? '') ?? '—'}</span>
                          {t.kind !== 'expense' && t.kind !== 'income' && <Badge>{KIND_LABEL[t.kind]}</Badge>}
                          {t.recurringId && <Badge>recurring</Badge>}
                          {t.demo && <Badge className="bg-amber-100 text-amber-800">demo</Badge>}
                        </div>
                      </button>
                      <Money cents={positive ? t.amount : -t.amount} signed className={`font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : neutral ? 'muted' : ''}`} />
                      <div className="flex">
                        <button className="btn-ghost p-1.5" title="Duplicate" aria-label={`Duplicate ${t.description}`} onClick={() => update((d) => duplicateTx(d, t.id, today()), 'Duplicated with today’s date')}>
                          <Icon name="copy" className="h-4 w-4" />
                        </button>
                        <ConfirmButton label="" confirmLabel="Delete?" className="btn-ghost p-1.5 text-red-600" onConfirm={() => update((d) => remove(d, 'transactions', t.id), 'Deleted')} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit transaction">
        {editing && <TransactionForm key={editing.id} mode="expense" initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
