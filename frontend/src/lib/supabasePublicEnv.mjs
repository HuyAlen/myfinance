/**
 * SUPABASE-BOOTSTRAP-ENV-1
 *
 * Browser-safe validation shared by the runtime Supabase singleton and the
 * Node preflight command. Keep this module free of Node-only imports so Next
 * can include it in client bundles.
 */

/**
 * @typedef {{
 *   NEXT_PUBLIC_SUPABASE_URL?: string;
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
 * }} SupabasePublicEnvInput
 */

/**
 * @typedef {{
 *   variable: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY";
 *   message: string;
 * }} SupabasePublicEnvIssue
 */

export const REQUIRED_SUPABASE_PUBLIC_ENV = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

function normalized(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {SupabasePublicEnvInput} env
 * @returns {{
 *   ok: boolean;
 *   issues: SupabasePublicEnvIssue[];
 *   values: { supabaseUrl: string; supabaseAnonKey: string } | null;
 * }}
 */
export function validateSupabasePublicEnv(env) {
  const supabaseUrl = normalized(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = normalized(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  /** @type {SupabasePublicEnvIssue[]} */
  const issues = [];

  if (!supabaseUrl) {
    issues.push({
      variable: "NEXT_PUBLIC_SUPABASE_URL",
      message: "is missing or empty",
    });
  } else {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        issues.push({
          variable: "NEXT_PUBLIC_SUPABASE_URL",
          message: "must use http:// or https://",
        });
      }
    } catch {
      issues.push({
        variable: "NEXT_PUBLIC_SUPABASE_URL",
        message: "must be a valid absolute URL",
      });
    }
  }

  if (!supabaseAnonKey) {
    issues.push({
      variable: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      message: "is missing or empty",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    values:
      issues.length === 0
        ? {
            supabaseUrl,
            supabaseAnonKey,
          }
        : null,
  };
}

/**
 * Never include actual environment values in this message. In particular, the
 * browser publishable/anon key should not be echoed into CI/build logs.
 *
 * @param {SupabasePublicEnvIssue[]} issues
 */
export function formatSupabasePublicEnvError(issues) {
  const details = issues
    .map((issue) => `- ${issue.variable} ${issue.message}`)
    .join("\n");

  return [
    "Invalid Supabase public environment:",
    details,
    "",
    "Create frontend/.env.local from frontend/.env.example for local development,",
    "or configure the same variables in the deployment environment.",
    "Run `npm run env:check` from frontend/ to verify configuration.",
  ].join("\n");
}

/**
 * @param {SupabasePublicEnvInput} env
 * @returns {{ supabaseUrl: string; supabaseAnonKey: string }}
 */
export function requireSupabasePublicEnv(env) {
  const result = validateSupabasePublicEnv(env);

  if (!result.ok || !result.values) {
    throw new Error(formatSupabasePublicEnvError(result.issues));
  }

  return result.values;
}