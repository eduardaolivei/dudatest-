import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData } from '../domain/types';
import { useStore } from './StoreContext';
import { normalize } from './storage';
import { mergeData } from './merge';
import { SyncEngine, type SyncStatus } from './sync';
import {
  configFromBuild,
  createHousehold,
  findMyHousehold,
  friendlyError,
  getClient,
  joinHousehold,
  loadConfig,
  loadState,
  saveConfig,
  saveState,
  supabaseApi,
  validateConfig,
  type CloudConfig,
  type CloudState,
} from './cloud';

export type CloudStatus = 'off' | 'signed-out' | 'no-household' | SyncStatus;

/** A household found/joined that needs a decision about this device's existing data. */
export interface PendingHousehold {
  id: string;
  name: string;
  inviteCode: string;
  data: AppData;
  version: number;
}

interface Cloud {
  config: CloudConfig | null;
  fromBuild: boolean;
  email: string | null;
  state: CloudState;
  status: CloudStatus;
  error: string | null;
  pending: PendingHousehold | null;
  connect: (url: string, key: string) => string | null;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  create: (name: string) => Promise<string | null>;
  join: (code: string) => Promise<string | null>;
  resolvePending: (mode: 'use-household' | 'merge') => void;
  syncNow: () => void;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<Cloud | null>(null);
const PRE_SYNC_BACKUP = 'our-money-dashboard:pre-sync-backup';
const hasRecords = (d: AppData) => [d.accounts, d.cards, d.transactions, d.recurring, d.goals, d.purchases].some((l) => l.length > 0);

export function CloudProvider({ children }: { children: ReactNode }) {
  const { data, replaceAll, notify } = useStore();
  const [config, setConfig] = useState<CloudConfig | null>(() => loadConfig());
  const [state, setStateRaw] = useState<CloudState>(() => loadState());
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('starting');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingHousehold | null>(null);

  const engine = useRef<SyncEngine | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const lastApplied = useRef<AppData | null>(null);

  const setState = useCallback((patch: Partial<CloudState> | null) => {
    setStateRaw((s) => {
      const next = patch === null ? {} : { ...s, ...patch };
      saveState(patch === null ? null : next);
      return next;
    });
  }, []);

  // Auth session
  useEffect(() => {
    if (!config) {
      setAuthReady(true);
      return;
    }
    const sb = getClient(config);
    let alive = true;
    sb.auth.getSession().then(({ data: s }) => {
      if (!alive) return;
      setEmail(s.session?.user.email ?? null);
      setUserId(s.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      setUserId(session?.user.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [config]);

  // Signed in on a device that isn't linked yet: look for an existing household.
  useEffect(() => {
    if (!config || !userId || state.householdId || pending) return;
    findMyHousehold(config)
      .then((row) => {
        if (!row) return;
        const remote = normalize(row.data && Object.keys(row.data as object).length ? row.data : {});
        if (hasRecords(dataRef.current)) setPending({ id: row.id, name: row.name, inviteCode: row.invite_code, data: remote, version: row.version });
        else adopt({ id: row.id, name: row.name, inviteCode: row.invite_code, data: remote, version: row.version }, 'use-household');
      })
      .catch((e) => setError(friendlyError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, userId, state.householdId]);

  // Run the sync engine while signed in and linked to a household.
  useEffect(() => {
    if (!config || !userId || !state.householdId) return;
    const eng = new SyncEngine(supabaseApi(config), state.householdId, state.version ?? 0, {
      getData: () => dataRef.current,
      applyRemote: (d) => {
        lastApplied.current = d;
        dataRef.current = d;
        replaceAll(d);
      },
      onStatus: (s, info) => {
        setSyncStatus(s);
        setError(s === 'error' || s === 'offline' ? friendlyError(info?.error ?? '') : null);
        if (s === 'synced') setState({ lastSyncedAt: info?.at ?? Date.now(), pendingLocal: false });
      },
      onVersion: (v) => setState({ version: v }),
    });
    engine.current = eng;
    void eng.start().then(() => {
      if (loadState().pendingLocal) eng.localChanged();
    });
    const check = () => document.visibilityState === 'visible' && void eng.check();
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    const t = setInterval(check, 60000);
    return () => {
      eng.stop();
      engine.current = null;
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      clearInterval(t);
    };
  }, [config, userId, state.householdId, replaceAll, setState]);

  // Every local change gets uploaded (but not data that just came from the cloud).
  useEffect(() => {
    if (data === lastApplied.current) return;
    if (engine.current) {
      setState({ pendingLocal: true });
      engine.current.localChanged();
    }
  }, [data, setState]);

  const adopt = useCallback(
    (h: PendingHousehold, mode: 'use-household' | 'merge') => {
      // Keep a copy of this device's data, just in case.
      try {
        localStorage.setItem(PRE_SYNC_BACKUP, JSON.stringify(dataRef.current));
      } catch {
        /* ignore */
      }
      if (mode === 'use-household') {
        lastApplied.current = h.data;
        replaceAll(h.data);
        setState({ householdId: h.id, householdName: h.name, inviteCode: h.inviteCode, version: h.version, pendingLocal: false });
      } else {
        replaceAll(mergeData(dataRef.current, h.data));
        setState({ householdId: h.id, householdName: h.name, inviteCode: h.inviteCode, version: h.version, pendingLocal: true });
      }
      setPending(null);
      notify(`Connected to ${h.name}`);
    },
    [replaceAll, setState, notify],
  );

  const cloud = useMemo<Cloud>(() => {
    const status: CloudStatus = !config ? 'off' : !authReady ? 'starting' : !userId ? 'signed-out' : !state.householdId ? 'no-household' : syncStatus;
    return {
      config,
      fromBuild: configFromBuild(),
      email,
      state,
      status,
      error,
      pending,
      connect(url, key) {
        const err = validateConfig(url, key);
        if (err) return err;
        const c = { url: url.trim().replace(/\/$/, ''), anonKey: key.trim() };
        saveConfig(c);
        setConfig(c);
        return null;
      },
      async signUp(mail, password) {
        if (!config) return 'Connect the project first';
        const { data: res, error: e } = await getClient(config).auth.signUp({ email: mail.trim(), password });
        if (e) return friendlyError(e);
        if (!res.session) return 'CHECK_EMAIL';
        return null;
      },
      async signIn(mail, password) {
        if (!config) return 'Connect the project first';
        const { error: e } = await getClient(config).auth.signInWithPassword({ email: mail.trim(), password });
        return e ? friendlyError(e) : null;
      },
      async signOut() {
        if (config) await getClient(config).auth.signOut();
        setState({ householdId: undefined, householdName: undefined, inviteCode: undefined, version: undefined });
        notify('Signed out — this device keeps a local copy');
      },
      async create(name) {
        if (!config) return 'Connect the project first';
        try {
          const row = await createHousehold(config, name, dataRef.current);
          lastApplied.current = dataRef.current;
          setState({ householdId: row.id, householdName: row.name, inviteCode: row.invite_code, version: row.version, pendingLocal: false });
          notify('Household created — your data is now in the cloud');
          return null;
        } catch (e) {
          return friendlyError(e);
        }
      },
      async join(code) {
        if (!config) return 'Connect the project first';
        try {
          const row = await joinHousehold(config, code);
          const h = { id: row.id, name: row.name, inviteCode: row.invite_code, data: normalize(row.data ?? {}), version: row.version };
          if (hasRecords(dataRef.current)) setPending(h);
          else adopt(h, 'use-household');
          return null;
        } catch (e) {
          return friendlyError(e);
        }
      },
      resolvePending(mode) {
        if (pending) adopt(pending, mode);
      },
      syncNow() {
        void engine.current?.check();
      },
      async disconnect() {
        if (config) await getClient(config).auth.signOut().catch(() => {});
        saveConfig(null);
        saveState(null);
        setStateRaw({});
        setConfig(null);
        notify('Cloud sync turned off on this device');
      },
    };
  }, [config, authReady, userId, state, syncStatus, error, pending, email, adopt, notify, setState]);

  return <Ctx.Provider value={cloud}>{children}</Ctx.Provider>;
}

export function useCloud(): Cloud {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud must be used inside CloudProvider');
  return c;
}
