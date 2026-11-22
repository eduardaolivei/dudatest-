import { useEffect, useState, type ReactNode } from 'react';
import { formatMoney } from '../domain/money';
import type { BillStatus } from '../domain/finance';
import type { Cents } from '../domain/types';
import { Icon } from './Icon';

export function Money({ cents, className = '', signed = false, short = false }: { cents: Cents; className?: string; signed?: boolean; short?: boolean }) {
  const s = formatMoney(Math.abs(cents), { short });
  const prefix = cents < 0 ? '−' : signed && cents > 0 ? '+' : '';
  return <span className={`tabular-nums ${className}`}>{prefix}{s}</span>;
}

export function Stat({ label, value, hint, tone = 'default', icon, display }: { label: string; value: Cents; hint?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn'; icon?: string; display?: string }) {
  const color = { default: '', good: 'text-emerald-600 dark:text-emerald-400', bad: 'text-red-600 dark:text-red-400', warn: 'text-amber-600 dark:text-amber-400' }[tone];
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium muted">
        {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
        {label}
      </div>
      {display !== undefined ? <span className={`text-xl font-semibold tabular-nums sm:text-2xl ${color}`}>{display}</span> : <Money cents={value} className={`text-xl font-semibold sm:text-2xl ${color}`} />}
      {hint && <div className="text-xs muted">{hint}</div>}
    </div>
  );
}

export function Section({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="h-section">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Empty({ icon = 'list', title, text, action }: { icon?: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <div className="rounded-full bg-brand-50 p-3 text-brand-600 dark:bg-brand-600/15 dark:text-brand-100">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="font-medium">{title}</div>
      <p className="max-w-sm text-sm muted">{text}</p>
      {action}
    </div>
  );
}

const statusStyle: Record<BillStatus | 'pending', string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  'due-today': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  upcoming: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};
const statusLabel: Record<BillStatus | 'pending', string> = {
  overdue: 'Overdue', 'due-today': 'Due today', upcoming: 'Upcoming', paid: 'Paid', pending: 'Pending',
};

export function StatusBadge({ status }: { status: BillStatus | 'pending' }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle[status]}`}>{statusLabel[status]}</span>;
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 ${className}`}>{children}</span>;
}

export function Progress({ value, tone = 'brand', barClass, trackClass }: { value: number; tone?: 'brand' | 'good' | 'warn' | 'bad'; barClass?: string; trackClass?: string }) {
  const c = barClass ?? { brand: 'bg-brand-500', good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' }[tone];
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full ${trackClass ?? 'bg-slate-100 dark:bg-slate-800'}`} role="progressbar" aria-valuenow={Math.round(value * 100)}>
      <div className={`h-full rounded-full ${c} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-medium transition ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            value === o.value ? 'bg-white shadow-sm dark:bg-slate-950' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-xl dark:bg-slate-900 sm:rounded-2xl sm:pb-5 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, children, className = '' }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

/** Two-step delete to avoid accidents. */
export function ConfirmButton({ onConfirm, label = 'Delete', confirmLabel = 'Confirm', className = 'btn-danger', icon = 'trash' }: { onConfirm: () => void; label?: string; confirmLabel?: string; className?: string; icon?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className} onClick={() => (armed ? onConfirm() : setArmed(true))} aria-label={armed ? confirmLabel : label}>
      <Icon name={icon} className="h-4 w-4" />
      <span className={label ? '' : 'sr-only'}>{armed ? confirmLabel : label}</span>
    </button>
  );
}
