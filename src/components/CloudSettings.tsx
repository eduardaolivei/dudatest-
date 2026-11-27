import { useState, type FormEvent } from 'react';
import { useCloud } from '../store/CloudContext';
import { buildDiagnostics } from '../store/cloud';
import { Field, Section } from './ui';
import { Icon } from './Icon';

/** Step-by-step cloud setup: 1) connect project 2) account 3) household. */
export function CloudSettings() {
  const cloud = useCloud();

  return (
    <Section title="☁️ Cloud sync (Supabase)">
      {cloud.status === 'off' && <ConnectStep />}
      {cloud.status === 'starting' && !cloud.state.householdId && <p className="text-sm muted">Connecting…</p>}
      {cloud.status === 'signed-out' && <AccountStep />}
      {cloud.pending ? <PendingStep /> : cloud.status === 'no-household' && <HouseholdStep />}
      {!cloud.pending && cloud.state.householdId && cloud.email && <Connected />}
      {cloud.config && !cloud.fromBuild && (
        <button className="mt-3 text-xs muted underline" onClick={() => void cloud.disconnect()}>Turn off cloud sync on this device</button>
      )}
    </Section>
  );
}

function Steps({ n }: { n: 1 | 2 | 3 }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-medium">
      {['Connect', 'Account', 'Household'].map((s, i) => (
        <span key={s} className={`rounded-full px-2.5 py-1 ${i + 1 === n ? 'bg-brand-600 text-white' : i + 1 < n ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
          {i + 1 < n ? '✓' : i + 1}. {s}
        </span>
      ))}
    </div>
  );
}

function ConnectStep() {
  const { connect } = useCloud();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const res = connect(url, key);
    if (res) setErr(res);
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Steps n={1} />
      <p className="text-sm muted">Keep both phones and the computer in sync, with a backup in the cloud. In Supabase open <b>Project Settings → API</b> (or the <b>Connect</b> button) and copy these two values:</p>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <Field label="Project URL"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcdefgh.supabase.co" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></Field>
      <Field label="anon public key (or publishable key)"><input className="input font-mono text-xs" value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi… or sb_publishable_…" autoCapitalize="off" autoCorrect="off" spellCheck={false} /></Field>
      <p className="text-xs muted">🔒 Never paste the <b>service_role</b> / secret key here.</p>
      <button className="btn-primary w-full">Connect</button>
      <BuildCheck />
    </form>
  );
}

/** Shows which Supabase variables the hosted build received (names only), to fix auto-connect. */
function BuildCheck() {
  const d = buildDiagnostics();
  return (
    <details className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
      <summary className="cursor-pointer font-medium">Why do I have to type this? (setup check)</summary>
      <div className="mt-2 space-y-1 muted">
        <p>To connect automatically on every phone, the hosting (Vercel) needs the Supabase URL and public key as environment variables, then a Redeploy.</p>
        <p>This version received: Project URL {d.hasUrl ? '✅' : '❌'} · public key {d.hasKey ? '✅' : '❌'}{d.problem ? ` · ⚠️ ${d.problem}` : ''}</p>
        <p>Supabase variables seen (names only): {d.names.length ? <code>{d.names.join(', ')}</code> : 'none — add them in Vercel → Settings → Environment Variables, then Redeploy'}</p>
      </div>
    </details>
  );
}

function AccountStep() {
  const { signIn, signUp } = useCloud();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ text: 'Enter a valid email' });
    if (password.length < 6) return setMsg({ text: 'Password must be at least 6 characters' });
    setBusy(true);
    const res = mode === 'signup' ? await signUp(email, password) : await signIn(email, password);
    setBusy(false);
    if (res === 'CHECK_EMAIL') setMsg({ ok: true, text: 'Account created! Check your email and click the confirmation link, then come back and Sign in. (Or turn off “Confirm email” in Supabase → Authentication.)' });
    else if (res) setMsg({ text: res });
  }
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Steps n={2} />
      <p className="text-sm muted">Each of you has your own login. Patrick creates his on his phone.</p>
      <div className="flex gap-2">
        <button type="button" className={mode === 'signup' ? 'btn-primary text-xs' : 'btn-secondary text-xs'} onClick={() => setMode('signup')}>New account</button>
        <button type="button" className={mode === 'signin' ? 'btn-primary text-xs' : 'btn-secondary text-xs'} onClick={() => setMode('signin')}>I have an account</button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600'}`} role="alert">{msg.text}</p>}
      <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password (min. 6 characters)"><input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
    </form>
  );
}

function HouseholdStep() {
  const { create, join, email, signOut } = useCloud();
  const [name, setName] = useState('Our Household');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res) setErr(res);
  };
  return (
    <div className="space-y-4">
      <Steps n={3} />
      <p className="text-sm muted">Signed in as <b>{email}</b>. <button className="underline" onClick={() => void signOut()}>Sign out</button></p>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <div className="rounded-xl border-2 border-brand-500/40 bg-brand-50/60 p-3 dark:bg-brand-600/10">
        <div className="mb-1 font-medium">Joining your partner? Use their invite code</div>
        <p className="mb-2 text-xs muted">Ask them to open Settings → Cloud sync on their device and copy the code.</p>
        <div className="flex gap-2">
          <input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 4F9A1C2B7D" aria-label="Invite code" />
          <button className="btn-primary shrink-0" disabled={busy || code.trim().length < 6} onClick={() => void run(() => join(code))}>Join</button>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <div className="mb-1 font-medium">First person only: create a new household</div>
        <p className="mb-2 text-xs muted">Only if nobody has created one yet. Uploads everything on this device and gives you a code for your partner. ⚠️ If your partner already created one, use Join above instead.</p>
        <div className="flex gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Household name" />
          <button className="btn-secondary shrink-0" disabled={busy} onClick={() => void run(() => create(name))}>Create</button>
        </div>
      </div>
    </div>
  );
}

function PendingStep() {
  const { pending, resolvePending } = useCloud();
  if (!pending) return null;
  return (
    <div className="space-y-3 text-sm">
      <Steps n={3} />
      <p>Found <b>{pending.name}</b> in the cloud. This device also has its own data. What should we do?</p>
      <button className="btn-primary w-full" onClick={() => resolvePending('merge')}>Combine both (recommended)</button>
      <button className="btn-secondary w-full" onClick={() => resolvePending('use-household')}>Use only the household's data</button>
      <p className="text-xs muted">Either way, a copy of this device's current data is kept as a safety backup.</p>
    </div>
  );
}

/** Move this account to another household (e.g. you created one by mistake and want your partner's). */
function SwitchHousehold() {
  const { join, state } = useCloud();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="text-xs font-medium text-brand-600 underline" onClick={() => setOpen(true)}>Join a different household (your partner's code)</button>;
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="font-medium">Join a different household</div>
      <p className="text-xs muted">Use this if you and your partner ended up in two separate households. Enter <b>their</b> invite code (not {state.inviteCode}). You'll choose what to do with this device's data next.</p>
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <div className="flex gap-2">
        <input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Partner's code" aria-label="Partner invite code" />
        <button
          className="btn-primary shrink-0"
          disabled={busy || code.trim().length < 6}
          onClick={async () => {
            if (code.trim().toUpperCase() === state.inviteCode) return setErr('That is the code of the household you are already in.');
            setBusy(true);
            const res = await join(code);
            setBusy(false);
            if (res) setErr(res);
          }}
        >
          Join
        </button>
      </div>
      <button className="text-xs muted underline" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

const STATUS: Record<string, { text: string; cls: string }> = {
  synced: { text: 'All changes saved to the cloud', cls: 'text-emerald-700 dark:text-emerald-300' },
  syncing: { text: 'Syncing…', cls: 'text-sky-700 dark:text-sky-300' },
  starting: { text: 'Connecting…', cls: 'text-sky-700 dark:text-sky-300' },
  offline: { text: 'Offline — changes are saved on this device and will upload when you are back online', cls: 'text-amber-700 dark:text-amber-300' },
  error: { text: 'Sync problem', cls: 'text-red-600' },
};

function Connected() {
  const cloud = useCloud();
  const [copied, setCopied] = useState(false);
  const s = STATUS[cloud.status] ?? STATUS.starting;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cloud.state.inviteCode ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <div className={`flex items-start gap-2 font-medium ${s.cls}`}>
        <Icon name={cloud.status === 'synced' ? 'check' : cloud.status === 'error' ? 'alert' : 'repeat'} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{s.text}{cloud.error && cloud.status === 'error' ? `: ${cloud.error}` : ''}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="muted">Household</dt><dd className="font-medium">{cloud.state.householdName}</dd>
        <dt className="muted">Signed in as</dt><dd>{cloud.email}</dd>
        <dt className="muted">Last synced</dt><dd>{cloud.state.lastSyncedAt ? new Date(cloud.state.lastSyncedAt).toLocaleString('en-AU') : '—'}</dd>
      </dl>
      <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-600/15">
        <div className="text-xs muted">Invite code — share it with your partner</div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold tracking-widest">{cloud.state.inviteCode}</span>
          <button className="btn-secondary px-2 py-1 text-xs" onClick={() => void copy()}><Icon name="copy" className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className="mt-1 text-xs muted">On the other phone: open the app → Settings → Cloud sync → New account (their own email) → Join with this code.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary text-xs" onClick={cloud.syncNow}><Icon name="repeat" className="h-3.5 w-3.5" />Sync now</button>
        <button className="btn-ghost text-xs" onClick={() => void cloud.signOut()}>Sign out</button>
      </div>
      <SwitchHousehold />
    </div>
  );
}

/** Small status icon for the top bar. */
export function CloudBadge({ onClick }: { onClick: () => void }) {
  const { status } = useCloud();
  if (status === 'off') return null;
  const map: Record<string, { label: string; cls: string }> = {
    synced: { label: 'Synced', cls: 'text-emerald-600 dark:text-emerald-400' },
    syncing: { label: 'Syncing', cls: 'text-sky-600 animate-pulse' },
    starting: { label: 'Connecting', cls: 'text-sky-600 animate-pulse' },
    offline: { label: 'Offline — saved on this device', cls: 'text-amber-600' },
    error: { label: 'Sync problem', cls: 'text-red-600' },
    'signed-out': { label: 'Cloud: signed out', cls: 'text-slate-400' },
    'no-household': { label: 'Cloud: finish setup', cls: 'text-slate-400' },
  };
  const m = map[status] ?? map.starting;
  return (
    <button className={`btn-secondary px-2.5 ${m.cls}`} onClick={onClick} aria-label={m.label} title={m.label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.3 13 3.5 3.5 0 0 0 6.5 19z" />
        {status === 'synced' && <path d="M9 14l2 2 4-4" />}
        {(status === 'error' || status === 'offline') && <path d="M12 11v3M12 16.5h.01" />}
      </svg>
    </button>
  );
}
