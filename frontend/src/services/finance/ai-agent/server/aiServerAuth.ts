import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  }

  return { url, anonKey };
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

export function createAuthenticatedSupabaseClient(accessToken: string) {
  const { url, anonKey } = getSupabaseConfig();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function requireAIUser(request: Request) {
  const accessToken = extractBearerToken(request);
  if (!accessToken) throw new Error("UNAUTHORIZED");

  const supabase = createAuthenticatedSupabaseClient(accessToken);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) throw new Error("UNAUTHORIZED");

  return { accessToken, supabase, user };
}
