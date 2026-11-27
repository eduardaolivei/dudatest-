import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { isSupabaseUrl, normalizeSupabaseUrl } from './src/domain/supabaseUrl';

/**
 * Supabase settings can come from Vercel environment variables under several names
 * (ours, or those created by the Vercel ↔ Supabase integration). Only the PUBLIC
 * values are read from an explicit allow-list and baked into the app; secret keys
 * (service_role / sb_secret_) are never included, even if set by mistake.
 */
const URL_NAMES = ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const KEY_NAMES = [
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
];

function isSecret(key: string): boolean {
  if (/^sb_secret_/.test(key)) return true;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string | undefined>;
  // First URL that is valid once cleaned up (extra slashes, /rest/v1, dashboard links, spaces...).
  const urlCandidates = URL_NAMES.filter((n) => env[n]).map((n) => ({ name: n, value: normalizeSupabaseUrl(env[n]!) }));
  const chosen = urlCandidates.find((c) => isSupabaseUrl(c.value)) ?? urlCandidates[0];
  const url = chosen?.value ?? '';
  const key = KEY_NAMES.map((n) => env[n]).find((v) => v && !isSecret(v)) ?? '';
  // Names only (never values) of Supabase-related variables, to help diagnose setup.
  const seen = Object.keys(env).filter((n) => /SUPABASE/i.test(n)).sort();
  return {
    plugins: [react()],
    base: './',
    define: {
      __SUPABASE_URL__: JSON.stringify(url.trim()),
      __SUPABASE_KEY__: JSON.stringify(key.trim()),
      __SUPABASE_ENV_NAMES__: JSON.stringify(seen),
      __SUPABASE_URL_SOURCE__: JSON.stringify(chosen?.name ?? ''),
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Split big libraries into their own cached files
          manualChunks(id: string) {
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory')) return 'charts';
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          },
        },
      },
    },
    test: { globals: true, environment: 'node' },
  } as any;
});
