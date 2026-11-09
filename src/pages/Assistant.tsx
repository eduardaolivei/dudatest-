import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useStore } from '../store/StoreContext';
import { SUGGESTIONS, alerts, answer, type Answer } from '../domain/assistant';
import { today } from '../domain/dates';
import { PageHeader, Section } from '../components/ui';
import { Icon } from '../components/Icon';

interface Msg { q: string; a: Answer }

const LEVEL = {
  critical: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
};
const LEVEL_ICON = { critical: '⛔', warning: '⚠️', info: 'ℹ️' };

export default function Assistant() {
  const { data, person } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const ref = today();
  const list = useMemo(() => alerts(data, ref, person), [data, ref, person]);

  const ask = (question: string) => {
    if (!question.trim()) return;
    setMsgs((m) => [...m, { q: question, a: answer(question, data, ref, person) }]);
    setQ('');
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Money Assistant" subtitle="Answers come only from your recorded data — nothing is guessed." />

      <Section title={`Smart alerts (${list.length})`}>
        {list.length === 0 ? (
          <p className="text-sm muted">✅ No alerts right now.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((a, i) => (
              <li key={i} className={`rounded-xl border px-3 py-2 text-sm ${LEVEL[a.level]}`}>
                <span className="mr-1.5" aria-label={a.level}>{LEVEL_ICON[a.level]}</span>{a.text}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ask a question">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
        <div className="space-y-3">
          {msgs.map((m, i) => (
            <div key={i} className="space-y-2">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-sm text-white">{m.q}</div>
              <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
                <p>{m.a.text}</p>
                {m.a.bullets && m.a.bullets.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{m.a.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>}
                {m.a.missing && <p className="mt-1.5 text-xs italic muted">Missing info: {m.a.missing}</p>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(q); }} className="mt-3 flex gap-2">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How much did we spend on coffee last month?" aria-label="Your question" />
          <button className="btn-primary" aria-label="Ask"><Icon name="chat" className="h-4 w-4" /></button>
        </form>
      </Section>
    </div>
  );
}
