import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Person, PersonFilter } from '../domain/types';
import { today } from '../domain/dates';
import { emptyData, localAdapter, type StorageAdapter } from './storage';

/**
 * React Context = a way to share state with every component without passing
 * props down manually. Here it holds all financial data plus UI state.
 */
interface Store {
  data: AppData;
  /** Apply a pure change function, then persist. */
  update: (fn: (d: AppData) => AppData, message?: string) => void;
  replaceAll: (d: AppData) => void;
  storage: StorageAdapter;
  saveError: string | null;
  // UI state
  person: PersonFilter;
  setPerson: (p: PersonFilter) => void;
  month: string; // ISO date inside the selected month
  setMonth: (m: string) => void;
  toast: { id: number; text: string; tone: 'ok' | 'error' } | null;
  notify: (text: string, tone?: 'ok' | 'error') => void;
  quickAdd: QuickAddMode | null;
  openQuickAdd: (m: QuickAddMode) => void;
  closeQuickAdd: () => void;
  personName: (p: Person) => string;
  isDark: boolean;
}

export type QuickAddMode = 'expense' | 'income' | 'bill' | 'card' | 'payment' | 'transfer';

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, adapter = localAdapter }: { children: ReactNode; adapter?: StorageAdapter }) {
  const [data, setData] = useState<AppData>(() => adapter.load() ?? emptyData());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonFilter>('all');
  const [month, setMonth] = useState<string>(today());
  const [toast, setToast] = useState<Store['toast']>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddMode | null>(null);
  const toastTimer = useRef<number>();

  // Persist on every change. useEffect runs after React renders.
  useEffect(() => {
    try {
      adapter.save(data);
      setSaveError(null);
    } catch (e) {
      setSaveError('Could not save — storage may be full or blocked. Export a backup now.');
    }
  }, [data, adapter]);

  // Theme: follow the device when set to "system", otherwise the chosen mode.
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const isDark = data.settings.theme === 'dark' || (data.settings.theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const notify = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ id: Date.now(), text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const update = useCallback(
    (fn: (d: AppData) => AppData, message?: string) => {
      setData((d) => fn(d));
      if (message) notify(message);
    },
    [notify],
  );

  const value = useMemo<Store>(
    () => ({
      data,
      update,
      replaceAll: setData,
      storage: adapter,
      saveError,
      person,
      setPerson,
      month,
      setMonth,
      toast,
      notify,
      quickAdd,
      openQuickAdd: setQuickAdd,
      closeQuickAdd: () => setQuickAdd(null),
      personName: (p: Person) => (p === 'me' ? data.settings.myName : p === 'patrick' ? data.settings.partnerName : 'Joint'),
      isDark,
    }),
    [data, update, adapter, saveError, person, month, toast, notify, quickAdd, isDark],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
