import { useStore, type QuickAddMode } from '../store/StoreContext';
import { Modal } from './ui';
import { MODE_TITLES, TransactionForm } from './TransactionForm';

const SHORTCUTS: { mode: QuickAddMode; label: string }[] = [
  { mode: 'expense', label: 'Expense' },
  { mode: 'income', label: 'Income' },
  { mode: 'bill', label: 'Bill' },
  { mode: 'card', label: 'Card purchase' },
  { mode: 'payment', label: 'Card payment' },
  { mode: 'transfer', label: 'Transfer' },
];

/** Global "Add Transaction" sheet. Opened from the + button anywhere. */
export function QuickAdd() {
  const { quickAdd, openQuickAdd, closeQuickAdd } = useStore();
  if (!quickAdd) return null;
  return (
    <Modal open onClose={closeQuickAdd} title={MODE_TITLES[quickAdd]}>
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SHORTCUTS.map((s) => (
          <button
            key={s.mode}
            type="button"
            onClick={() => openQuickAdd(s.mode)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${quickAdd === s.mode ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {/* key forces a fresh form when switching mode */}
      <TransactionForm key={quickAdd} mode={quickAdd} onDone={closeQuickAdd} />
    </Modal>
  );
}
