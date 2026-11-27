import { describe, expect, it } from 'vitest';
import { isSupabaseUrl, normalizeSupabaseUrl, projectRef } from './supabaseUrl';

describe('normalizeSupabaseUrl', () => {
  it.each([
    ['https://bbydcvhtkulxabcdefg.supabase.co', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    [' https://bbydcvhtkulxabcdefg.supabase.co/ ', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    ['https://bbydcvhtkulxabcdefg.supabase.co/rest/v1/', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    ['bbydcvhtkulxabcdefg.supabase.co', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    ['"https://bbydcvhtkulxabcdefg.supabase.co"', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    ['https://supabase.com/dashboard/project/bbydcvhtkulxabcdefg/settings/api', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    ['bbydcvhtkulxabcdefg', 'https://bbydcvhtkulxabcdefg.supabase.co'],
    ['HTTPS://BBYDCVHTKULXABCDEFG.SUPABASE.CO', 'https://bbydcvhtkulxabcdefg.supabase.co'],
  ])('%s', (input, out) => {
    expect(normalizeSupabaseUrl(input)).toBe(out);
    expect(isSupabaseUrl(normalizeSupabaseUrl(input))).toBe(true);
  });
  it('leaves real mistakes invalid', () => {
    expect(isSupabaseUrl(normalizeSupabaseUrl('https://example.com'))).toBe(false);
    expect(isSupabaseUrl(normalizeSupabaseUrl('sb_publishable_abc'))).toBe(false);
  });
  it('extracts the project id', () => {
    expect(projectRef('https://bbydcvhtkulxabcdefg.supabase.co')).toBe('bbydcvhtkulxabcdefg');
  });
});
