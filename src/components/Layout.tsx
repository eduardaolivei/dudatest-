import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { addMonths, monthKey, monthLabel, today } from '../domain/dates';
import type { PersonFilter } from '../domain/types';
import { Icon } from './Icon';
import { GlobalSearch } from './GlobalSearch';
import { QuickAdd } from './QuickAdd';

export const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/transactions', label: 'Transactions', icon: 'list' },
  { to: '/bills', label: 'Bills', icon: 'calendar' },
  { to: '/cards', label: 'Cards', icon: 'card' },
  { to: '/goals', label: 'Goals', icon: 'target' },
];

export const MORE = [
  { to: '/week', label: 'Our Week', icon: 'week', desc: 'This week & how much we can spend' },
  { to: '/planner', label: 'Things We Want to Buy', icon: 'bag', desc: 'Planned purchases & affordability' },
  { to: '/budgets', label: 'Budgets', icon: 'wallet', desc: 'Monthly limits per category' },
  { to: '/recurring', label: 'Income & Recurring', icon: 'repeat', desc: 'Salaries, rent, subscriptions' },
  { to: '/reports', label: 'Reports', icon: 'chart', desc: 'Monthly, FY, CSV & PDF' },
  { to: '/assistant', label: 'Money Assistant', icon: 'chat', desc: 'Ask questions, see alerts' },
  { to: '/accounts', label: 'Accounts', icon: 'bank', desc: 'Bank, savings & cash' },
  { to: '/settings', label: 'Settings & Backup', icon: 'settings', desc: 'Theme, names, export, import' },
];

function NavItem({ to, label, icon, compact = false }: { to: string; label: string; icon: string; compact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        compact
          ? `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-brand-600 dark:text-brand-100' : 'text-slate-500'}`
          : `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
      }
    >
      <Icon name={icon} className={compact ? 'h-6 w-6' : 'h-5 w-5'} />
      {label}
    </NavLink>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { person, setPerson, month, setMonth, openQuickAdd, toast, saveError, personName } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const loc = useLocation();
  const moreActive = MORE.some((m) => loc.pathname.startsWith(m.to)) || loc.pathname === '/more';
  const isCurrentMonth = monthKey(month) === monthKey(today());

  const personOptions: { value: PersonFilter; label: string }[] = [
    { value: 'all', label: 'Everyone' },
    { value: 'me', label: personName('me') },
    { value: 'patrick', label: personName('patrick') },
    { value: 'joint', label: 'Joint' },
  ];

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 font-bold text-white">$</div>
          <div className="font-semibold leading-tight">Our Money<div className="text-xs font-normal muted">Dashboard</div></div>
        </div>
        <button className="btn-primary mb-4 w-full" onClick={() => openQuickAdd('expense')}>
          <Icon name="plus" className="h-4 w-4" /> Add Transaction
        </button>
        <nav className="flex flex-col gap-1 overflow-y-auto">
          {NAV.map((n) => <NavItem key={n.to} {...n} />)}
          <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide muted">More</div>
          {MORE.map((n) => <NavItem key={n.to} {...n} />)}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar: filters */}
        <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
            <div className="flex items-center rounded-xl bg-white shadow-sm dark:bg-slate-900">
              <button className="btn-ghost px-2" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1, 1))}>
                <Icon name="chevronLeft" className="h-4 w-4" />
              </button>
              <button className="min-w-[7.5rem] text-center text-sm font-medium" onClick={() => setMonth(today())} title="Back to this month">
                {monthLabel(monthKey(month))}
              </button>
              <button className="btn-ghost px-2" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1, 1))}>
                <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
            <select aria-label="Whose finances" className="input w-auto py-1.5 text-sm" value={person} onChange={(e) => setPerson(e.target.value as PersonFilter)}>
              {personOptions.map((o) => <option key={o.value} value={o.value}>{o.value === 'all' ? 'Everyone' : o.value === 'joint' ? 'Our Joint Finances' : o.value === 'me' ? 'My Finances' : `${o.label}'s Finances`}</option>)}
            </select>
            {!isCurrentMonth && <button className="text-xs font-medium text-brand-600" onClick={() => setMonth(today())}>Today</button>}
            <div className="flex-1" />
            <button className="btn-secondary px-2.5" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Icon name="search" className="h-4 w-4" /> <span className="hidden sm:inline">Search</span>
            </button>
          </div>
        </header>

        {saveError && <div className="bg-red-600 px-4 py-2 text-center text-sm text-white">{saveError}</div>}

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 lg:pb-10">{children}</main>
      </div>

      {/* Mobile floating Add button */}
      <button
        className="no-print fixed bottom-20 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 active:scale-95 lg:hidden"
        onClick={() => openQuickAdd('expense')}
        aria-label="Add transaction"
      >
        <Icon name="plus" className="h-7 w-7" />
      </button>

      {/* Mobile bottom nav */}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        {NAV.map((n) => <NavItem key={n.to} {...n} label={n.label === 'Transactions' ? 'Activity' : n.label} compact />)}
        <NavLink to="/more" className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${moreActive ? 'text-brand-600 dark:text-brand-100' : 'text-slate-500'}`}>
          <Icon name="more" className="h-6 w-6" /> More
        </NavLink>
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <QuickAdd />

      {toast && (
        <div key={toast.id} role="status" className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${toast.tone === 'error' ? 'bg-red-600' : 'bg-slate-900 dark:bg-slate-700'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
