import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surface this clearly in both browser console and server logs.
  const missing = [
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]
    .filter(Boolean)
    .join(", ");
  console.error(
    `[supabase] Missing environment variable(s): ${missing}.\n` +
      "Set them in .env.local (dev) or Vercel Dashboard → Settings → Environment Variables (production).\n" +
      "All database operations will fail until this is fixed.",
  );
}

export const supabase = createClient<Database>(
  supabaseUrl ?? "",
  supabaseAnonKey ?? "",
);
