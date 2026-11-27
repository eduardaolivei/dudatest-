/**
 * Turn whatever was pasted into a proper Supabase API URL:
 *  " https://abc.supabase.co/rest/v1/ " -> "https://abc.supabase.co"
 *  "abc.supabase.co"                     -> "https://abc.supabase.co"
 *  "https://supabase.com/dashboard/project/abc..." (dashboard link) -> "https://abc.supabase.co"
 *  "abcdefghijklmnopqrst" (project ref)  -> "https://abcdefghijklmnopqrst.supabase.co"
 * Returns the cleaned text even if it still isn't valid, so the error can explain it.
 */
export function normalizeSupabaseUrl(raw: string): string {
  let s = (raw ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();
  const dash = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{10,})/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  if (/^[a-z0-9]{15,30}$/i.test(s)) return `https://${s.toLowerCase()}.supabase.co`;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (/\.supabase\.(co|in)$/i.test(u.hostname)) return `https://${u.hostname.toLowerCase()}`;
  } catch {
    /* not a URL */
  }
  return s;
}

export const isSupabaseUrl = (s: string) => /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(s);

/** The project id is the first part of the host (public, safe to show). */
export const projectRef = (url: string) => url.match(/^https:\/\/([a-z0-9-]+)\./i)?.[1] ?? '';
