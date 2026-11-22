import type { AppData } from '../domain/types';

/**
 * Storage adapter: the rest of the app never touches localStorage directly.
 * To move to a hosted database (e.g. Supabase) with login + sync between
 * phones and computers, implement this same interface against the server.
 */
export interface StorageAdapter {
  readonly kind: 'local' | 'cloud';
  load(): AppData | null;
  save(data: AppData): void;
  clear(): void;
}

const KEY = 'our-money-dashboard:data:v1';

export const emptyData = (): AppData => ({
  version: 1,
  accounts: [],
  cards: [],
  transactions: [],
  recurring: [],
  goals: [],
  purchases: [],
  settings: { myName: 'Me', partnerName: 'Patrick', theme: 'system', budgets: {} },
});

/** Fill in any missing fields so older/partial backups still load safely. */
export function normalize(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Not a valid backup file');
  const r = raw as Partial<AppData>;
  const base = emptyData();
  const arrays = ['accounts', 'cards', 'transactions', 'recurring', 'goals', 'purchases'] as const;
  for (const k of arrays) if (r[k] !== undefined && !Array.isArray(r[k])) throw new Error(`"${k}" must be a list`);
  return {
    version: 1,
    accounts: r.accounts ?? [],
    cards: r.cards ?? [],
    transactions: r.transactions ?? [],
    recurring: r.recurring ?? [],
    goals: r.goals ?? [],
    purchases: r.purchases ?? [],
    settings: { ...base.settings, ...(r.settings ?? {}), budgets: { ...(r.settings?.budgets ?? {}) } },
    deletedIds: Array.isArray(r.deletedIds) ? r.deletedIds.filter((x) => typeof x === 'string') : [],
  };
}

export const localAdapter: StorageAdapter = {
  kind: 'local',
  load() {
    try {
      const s = localStorage.getItem(KEY);
      return s ? normalize(JSON.parse(s)) : null;
    } catch (e) {
      console.error('Could not read saved data', e);
      return null;
    }
  },
  save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
