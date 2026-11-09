import { useState } from 'react';
import type { SafeToSpend } from '../domain/finance';
import { affordability } from '../domain/finance';
import { formatMoney, parseMoney } from '../domain/money';
import { formatDate } from '../domain/dates';

/** "Can we afford this?" — compares a price with the safe-to-spend amount (never with credit limit). */
export function AffordCheck({ s2s, initialPrice = '' }: { s2s: SafeToSpend; initialPrice?: string }) {
  const [price, setPrice] = useState(initialPrice);
  const cents = parseMoney(price);
  const res = cents && cents > 0 ? affordability(s2s, cents) : null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted">$</span>
          <input className="input pl-7" inputMode="decimal" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price to check" />
        </div>
      </div>
      {res && (
        <div className={`rounded-xl p-3 text-sm ${res.verdict === 'yes' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : res.verdict === 'wait' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>
          {res.verdict === 'yes' && <>✅ <b>Yes.</b> After buying you'd still have {formatMoney(res.after)} safe to spend until {formatDate(s2s.range.end)}, with all bills and goal savings covered.</>}
          {res.verdict === 'wait' && <>⏳ <b>Wait for income.</b> Right now it would leave you {formatMoney(-res.after)} short for bills/goals. It fits once expected income of {formatMoney(s2s.expectedIncome)} arrives (leaving {formatMoney(res.afterProjected)}).</>}
          {res.verdict === 'no' && <>⛔ <b>Not this period.</b> Even with expected income you'd be {formatMoney(-res.afterProjected)} short for bills and goals. Consider saving for it first.</>}
        </div>
      )}
    </div>
  );
}
