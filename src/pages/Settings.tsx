import { useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { emptyData, normalize } from '../store/storage';
import { hasDemo, removeDemo } from '../store/actions';
import { buildDemo } from '../store/demo';
import { formatDate, today } from '../domain/dates';
import { downloadCSV, downloadFile } from '../components/exporters';
import { ConfirmButton, Field, PageHeader, Section, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import type { AppData } from '../domain/types';

const BACKUP_KEY = 'our-money-dashboard:last-backup';

function lastBackup(): string | null {
  try { return localStorage.getItem(BACKUP_KEY); } catch { return null; }
}

export default function Settings() {
  const { data, update, replaceAll, notify, storage } = useStore();
  const [myName, setMyName] = useState(data.settings.myName);
  const [partnerName, setPartnerName] = useState(data.settings.partnerName);
  const [pending, setPending] = useState<AppData | null>(null);
  const [backupAt, setBackupAt] = useState(lastBackup());
  const fileRef = useRef<HTMLInputElement>(null);

  function exportJSON() {
    downloadFile(`our-money-backup-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    const d = today();
    try { localStorage.setItem(BACKUP_KEY, d); } catch { /* ignore */ }
    setBackupAt(d);
    notify('Backup downloaded — keep it somewhere safe (e.g. iCloud Drive)');
  }

  function exportAllCSV() {
    const name = new Map([...data.accounts.map((a) => [a.id, a.name] as const), ...data.cards.map((c) => [c.id, c.name] as const)]);
    downloadCSV(`our-money-transactions-${today()}.csv`, ['Date', 'Kind', 'Description', 'Category', 'Subcategory', 'Person', 'Account/Card', 'Status', 'Due date', 'Amount (AUD)', 'Notes'],
      [...data.transactions].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [formatDate(t.date), t.kind, t.description, t.category, t.subcategory ?? '', t.person, name.get(t.cardId ?? t.accountId ?? '') ?? '', t.status, formatDate(t.dueDate), (t.amount / 100).toFixed(2), t.notes ?? '']));
  }

  async function onFile(file: File) {
    try {
      const parsed = normalize(JSON.parse(await file.text()));
      setPending(parsed);
    } catch (e) {
      notify(`Could not read that file: ${(e as Error).message}`, 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const demo = hasDemo(data);

  return (
    <div className="space-y-4">
      <PageHeader title="Settings & Backup" />

      <Section title="Where your data lives">
        <div className="space-y-2 text-sm">
          <p>
            <b>{storage.kind === 'local' ? 'Saved on this device only' : 'Synced to the cloud'}</b> — {storage.kind === 'local'
              ? 'your data is stored in this browser (localStorage). It survives refreshes and restarts, but it is NOT synced between your phone, Patrick\'s phone and the computer.'
              : 'data is stored in your hosted database.'}
          </p>
          {storage.kind === 'local' && (
            <ul className="list-disc space-y-1 pl-5 muted">
              <li>To move data to another device: <b>Download backup</b> here, then <b>Restore backup</b> on the other device.</li>
              <li>Clearing Safari website data or deleting the home-screen app can erase it — keep regular backups.</li>
              <li>Real sync between devices needs a hosted database with login (see the README “Cloud sync” section).</li>
            </ul>
          )}
          <p className="text-xs muted">Last backup: {backupAt ? formatDate(backupAt) : 'never'}</p>
        </div>
      </Section>

      <Section title="Backup & export">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportJSON}><Icon name="download" className="h-4 w-4" />Download backup (JSON)</button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Icon name="upload" className="h-4 w-4" />Restore backup</button>
          <button className="btn-secondary" onClick={exportAllCSV} disabled={!data.transactions.length}><Icon name="download" className="h-4 w-4" />All transactions (CSV)</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} data-testid="restore-input" />
        </div>
        {pending && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p>This backup has <b>{pending.transactions.length}</b> transactions, <b>{pending.accounts.length}</b> accounts and <b>{pending.cards.length}</b> cards. Restoring will <b>replace</b> everything currently on this device.</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-primary" onClick={() => { replaceAll(pending); setPending(null); notify('Backup restored'); }}>Replace with backup</button>
              <button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Section>

      <Section title="People">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Your name"><input className="input" value={myName} onChange={(e) => setMyName(e.target.value)} /></Field>
          <Field label="Partner's name"><input className="input" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} /></Field>
          <div className="flex items-end">
            <button className="btn-primary w-full" onClick={() => update((d) => ({ ...d, settings: { ...d.settings, myName: myName.trim() || 'Me', partnerName: partnerName.trim() || 'Patrick' } }), 'Names saved')}>Save names</button>
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <Segmented
          value={data.settings.theme}
          onChange={(theme) => update((d) => ({ ...d, settings: { ...d.settings, theme } }))}
          options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Auto' }]}
        />
      </Section>

      <Section title="Install on iPhone">
        <ol className="list-decimal space-y-1 pl-5 text-sm muted">
          <li>Open this app in <b>Safari</b>.</li>
          <li>Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</li>
          <li>Open it from the home screen — it runs full-screen and works offline.</li>
        </ol>
      </Section>

      <Section title="Demo data">
        {demo ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Fictional demo records are loaded (marked “demo”).</span>
            <ConfirmButton label="Remove demo data" confirmLabel="Tap again to remove" onConfirm={() => update(removeDemo, 'Demo data removed — your own records were kept')} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="muted">No demo data loaded.</span>
            <button className="btn-secondary" onClick={() => update((d) => { const x = buildDemo(today()); return { ...d, accounts: [...d.accounts, ...x.accounts], cards: [...d.cards, ...x.cards], transactions: [...d.transactions, ...x.transactions], recurring: [...d.recurring, ...x.recurring], goals: [...d.goals, ...x.goals], purchases: [...d.purchases, ...x.purchases] }; }, 'Demo data loaded')}>Load demo data</button>
          </div>
        )}
      </Section>

      <Section title="Danger zone">
        <p className="mb-2 text-sm muted">Erase everything on this device. Download a backup first.</p>
        <ConfirmButton label="Erase all data" confirmLabel="Tap again to erase everything" onConfirm={() => { replaceAll(emptyData()); notify('All data erased'); }} />
      </Section>

      <Section title="Privacy">
        <p className="text-sm muted">This app never asks for bank passwords, full card numbers, CVVs or BSB/account numbers, and nothing is sent to any server. Use nicknames for accounts and cards.</p>
      </Section>
    </div>
  );
}
