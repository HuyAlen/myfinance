import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

type SupabaseGlobal = typeof globalThis & {
  __myFinanceSupabaseClient?: SupabaseClient;
};

const globalForSupabase = globalThis as SupabaseGlobal;

/**
 * Shared browser Supabase singleton.
 *
 * Every client component must import this instance instead of calling
 * createClient() again. This prevents multiple GoTrueClient instances from
 * using the same auth storage key in one browser context.
 */
export const supabase =
  globalForSupabase.__myFinanceSupabaseClient ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

globalForSupabase.__myFinanceSupabaseClient = supabase;

export function getSupabaseBrowserClient(): SupabaseClient {
  return supabase;
}

export const getSupabaseClient = getSupabaseBrowserClient;

export default supabase;
