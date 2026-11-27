import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '../domain/types';
import type { CloudApi } from './sync';

/**
 * Supabase connection details. The "anon public" key is designed to be used in
 * browsers — the database's Row Level Security decides what each signed-in
 * person may see. Never put the "service_role" key here.
 */
export interface CloudConfig {
  url: string;
  anonKey: string;
}

export interface CloudState {
  householdId?: string;
  householdName?: string;
  inviteCode?: string;
  version?: number;
  lastSyncedAt?: number;
  pendingLocal?: boolean; // changes made here that haven't reached the cloud yet
}

const CONFIG_KEY = 'our-money-dashboard:cloud-config';
const STATE_KEY = 'our-money-dashboard:cloud-state';

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

/** Config set at build time (e.g. on Vercel) wins; otherwise what was typed in Settings. */
export function loadConfig(): CloudConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return { url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY };
  return read<CloudConfig>(CONFIG_KEY);
}
export const configFromBuild = () => {
  const env = import.meta.env as Record<string, string | undefined>;
  return !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
};
export const saveConfig = (c: CloudConfig | null) => write(CONFIG_KEY, c);
export const loadState = (): CloudState => read<CloudState>(STATE_KEY) ?? {};
export const saveState = (s: CloudState | null) => write(STATE_KEY, s);

/** Basic checks so a typo is caught before trying to connect. */
export function validateConfig(url: string, key: string): string | null {
  const u = url.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(u)) return 'The Project URL should look like https://abcdefgh.supabase.co';
  const k = key.trim();
  if (k.length < 30) return 'The key looks too short — copy the whole "anon public" key';
  try {
    const payload = JSON.parse(atob(k.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? ''));
    if (payload?.role === 'service_role') return 'That is the secret service_role key. Use the "anon public" key instead.';
  } catch {
    // New-style publishable keys (sb_publishable_...) are not JWTs — that's fine.
    if (/^sb_secret_/.test(k)) return 'That is a secret key. Use the publishable / "anon public" key instead.';
  }
  return null;
}

let client: SupabaseClient | null = null;
let clientFor = '';
export function getClient(c: CloudConfig): SupabaseClient {
  const id = c.url + c.anonKey;
  if (!client || clientFor !== id) {
    client = createClient(c.url.trim().replace(/\/$/, ''), c.anonKey.trim(), {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'our-money-dashboard:auth' },
    });
    clientFor = id;
  }
  return client;
}

interface HouseholdRow {
  id: string;
  name: string;
  invite_code: string;
  data: unknown;
  version: number;
}

/** Turn Supabase/Postgres errors into plain messages. */
export function friendlyError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return 'Email or password is incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first (check your inbox), or turn off “Confirm email” in Supabase.';
  if (/User already registered/i.test(m)) return 'This email already has an account — use Sign in instead.';
  if (/Password should be at least/i.test(m)) return 'Password must be at least 6 characters.';
  if (/Invite code not found/i.test(m)) return 'That invite code was not found. Check it and try again.';
  if (/function .* does not exist|Could not find the function|relation .* does not exist|schema cache/i.test(m)) return 'The database is not set up yet. Run the setup script in Supabase → SQL Editor.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach Supabase. Check the internet connection and the Project URL.';
  if (/Invalid API key|No API key/i.test(m)) return 'The API key is not valid. Copy the “anon public” key again.';
  return m;
}

export async function createHousehold(c: CloudConfig, name: string, data: AppData): Promise<HouseholdRow> {
  const { data: row, error } = await getClient(c).rpc('create_household', { p_name: name, p_data: data });
  if (error) throw error;
  return row as HouseholdRow;
}

export async function joinHousehold(c: CloudConfig, code: string): Promise<HouseholdRow> {
  const { data: row, error } = await getClient(c).rpc('join_household', { p_code: code });
  if (error) throw error;
  return row as HouseholdRow;
}

/**
 * Find the household this user belongs to (e.g. after signing in on a new device).
 * If they belong to more than one, prefer the shared one (most members), then the most recently used.
 */
export async function findMyHousehold(c: CloudConfig): Promise<HouseholdRow | null> {
  const { data, error } = await getClient(c)
    .from('households')
    .select('id,name,invite_code,data,version,updated_at,household_members(count)')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  const rows = (data ?? []) as (HouseholdRow & { household_members?: { count: number }[] })[];
  const members = (r: (typeof rows)[number]) => r.household_members?.[0]?.count ?? 1;
  rows.sort((a, b) => members(b) - members(a));
  return rows[0] ?? null;
}

/** The CloudApi used by the sync engine, backed by Supabase. */
export function supabaseApi(c: CloudConfig): CloudApi {
  const sb = getClient(c);
  return {
    async fetch(id) {
      const { data, error } = await sb.from('households').select('data,version').eq('id', id).single();
      if (error) throw error;
      return { data: data.data, version: Number(data.version) };
    },
    async fetchVersion(id) {
      const { data, error } = await sb.from('households').select('version').eq('id', id).single();
      if (error) throw error;
      return Number(data.version);
    },
    async save(id, data, expected) {
      const { data: v, error } = await sb.rpc('save_household', { p_id: id, p_data: data, p_expected_version: expected });
      if (error) throw error;
      return Number(v);
    },
    subscribe(id, onChange) {
      const channel = sb
        .channel(`household-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'households', filter: `id=eq.${id}` }, (payload) => {
          const v = Number((payload.new as { version?: number }).version);
          if (v) onChange(v);
        })
        .subscribe();
      return () => void sb.removeChannel(channel);
    },
  };
}
