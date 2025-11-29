import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialized client to avoid build-time errors
let _supabase: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  return key;
}

// Client-side supabase instance (lazy initialized)
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return _supabase;
}

// For backwards compatibility - use getter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSupabase() as any)[prop];
  }
});

// Server-side client - use service role if available, otherwise anon key
export function createServerClient(): SupabaseClient {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Use service role key if it's properly configured (not placeholder)
  if (serviceRoleKey && serviceRoleKey !== 'your_service_role_key_here') {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  // Fall back to anon key - will work if RLS policies allow
  return createClient(supabaseUrl, getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
