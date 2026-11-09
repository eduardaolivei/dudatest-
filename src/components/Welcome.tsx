import { Link } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { buildDemo } from '../store/demo';
import { today } from '../domain/dates';

/** First-run screen: start fresh (real data) or explore with clearly-labelled demo data. */
export function Welcome() {
  const { update } = useStore();
  const loadDemo = () =>
    update((d) => {
      const demo = buildDemo(today());
      return {
        ...d,
        accounts: [...d.accounts, ...demo.accounts],
        cards: [...d.cards, ...demo.cards],
        transactions: [...d.transactions, ...demo.transactions],
        recurring: [...d.recurring, ...demo.recurring],
        goals: [...d.goals, ...demo.goals],
        purchases: [...d.purchases, ...demo.purchases],
      };
    }, 'Demo data loaded — remove it anytime in Settings');

  return (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <div className="card text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl font-bold text-white">$</div>
        <h1 className="text-2xl font-bold">Welcome to Our Money Dashboard</h1>
        <p className="mt-2 text-sm muted">Track income, bills, credit cards and goals together — in a couple of minutes a day.</p>
      </div>
      <div className="card space-y-3">
        <h2 className="font-semibold">Start with your real numbers</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm muted">
          <li>Add your bank accounts with today's balances (no account numbers needed).</li>
          <li>Add your credit cards with their current balance.</li>
          <li>Add salaries and recurring bills under Income &amp; Recurring.</li>
        </ol>
        <Link to="/accounts" className="btn-primary w-full">Add our first account</Link>
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">Just exploring?</h2>
        <p className="text-sm muted">Load fictional demo data. Every demo record is labelled “(demo)” and can be removed in one click from Settings.</p>
        <button className="btn-secondary w-full" onClick={loadDemo}>Load demo data</button>
      </div>
    </div>
  );
}
