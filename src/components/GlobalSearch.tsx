import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { formatDate } from '../domain/dates';
import { Modal, Money } from './ui';
import { MORE, NAV } from './Layout';

interface Hit {
  key: string;
  title: string;
  sub: string;
  amount?: number;
  to: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const nav = useNavigate();

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const m = (...xs: (string | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(s));
    const out: Hit[] = [];
    for (const p of [...NAV, ...MORE]) if (m(p.label)) out.push({ key: 'p' + p.to, title: p.label, sub: 'Page', to: p.to });
    for (const t of [...data.transactions].sort((a, b) => b.date.localeCompare(a.date))) {
      if (m(t.description, t.category, t.subcategory, t.notes, t.incomeSource)) {
        out.push({ key: t.id, title: t.description, sub: `${formatDate(t.date)} · ${t.subcategory ?? t.category}`, amount: t.kind === 'income' ? t.amount : -t.amount, to: `/transactions?edit=${t.id}` });
      }
    }
    for (const r of data.recurring) if (m(r.description, r.category)) out.push({ key: r.id, title: r.description, sub: `Recurring · ${r.frequency}`, amount: r.kind === 'income' ? r.amount : -r.amount, to: '/recurring' });
    for (const c of data.cards) if (m(c.name, c.bank)) out.push({ key: c.id, title: c.name, sub: `Card · ${c.bank}`, to: '/cards' });
    for (const g of data.goals) if (m(g.name)) out.push({ key: g.id, title: g.name, sub: 'Goal', to: '/goals' });
    for (const p of data.purchases) if (m(p.name, p.category)) out.push({ key: p.id, title: p.name, sub: 'Planned purchase', to: '/planner' });
    for (const a of data.accounts) if (m(a.name)) out.push({ key: a.id, title: a.name, sub: 'Account', to: '/accounts' });
    return out.slice(0, 40);
  }, [q, data]);

  const go = (to: string) => {
    nav(to);
    onClose();
    setQ('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Search">
      <input autoFocus className="input mb-3" placeholder="Search transactions, bills, cards, goals…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search everything" />
      {q && hits.length === 0 && <p className="py-6 text-center text-sm muted">No matches for “{q}”.</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {hits.map((h) => (
          <li key={h.key}>
            <button className="flex w-full items-center justify-between gap-3 py-2.5 text-left" onClick={() => go(h.to)}>
              <div className="min-w-0">
                <div className="truncate font-medium">{h.title}</div>
                <div className="truncate text-xs muted">{h.sub}</div>
              </div>
              {h.amount !== undefined && <Money cents={h.amount} className={h.amount > 0 ? 'text-emerald-600' : ''} signed />}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
