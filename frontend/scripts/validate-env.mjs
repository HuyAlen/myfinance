import path from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";

import {
  REQUIRED_SUPABASE_PUBLIC_ENV,
  requireSupabasePublicEnv,
} from "../src/lib/supabasePublicEnv.mjs";

const { loadEnvConfig } = nextEnv;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");

function resolveMode(argv) {
  const modeArgument = argv.find((argument) => argument.startsWith("--mode="));
  const requested = modeArgument?.slice("--mode=".length);

  if (requested && !["development", "production"].includes(requested)) {
    throw new Error(
      `Unsupported --mode=${requested}. Expected development or production.`,
    );
  }

  if (requested) return requested;
  return process.env.NODE_ENV === "development" ? "development" : "production";
}

function loadedSourceSummary(loadedEnvFiles) {
  if (!Array.isArray(loadedEnvFiles) || loadedEnvFiles.length === 0) {
    return "process environment";
  }

  return loadedEnvFiles.map((entry) => entry.path).join(", ");
}

try {
  const mode = resolveMode(process.argv.slice(2));
  process.env.NODE_ENV = mode;

  // Use the same loader Next.js uses so this preflight honors .env.local and
  // environment-specific file precedence instead of incorrectly inspecting
  // only the parent shell's process.env.
  const { loadedEnvFiles } = loadEnvConfig(
    frontendDir,
    mode === "development",
    console,
    true,
  );

  requireSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  console.log(
    `[env-preflight] PASS (${mode}; checked ${REQUIRED_SUPABASE_PUBLIC_ENV.join(
      ", ",
    )}; source: ${loadedSourceSummary(loadedEnvFiles)})`,
  );
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown environment error.";

  console.error("[env-preflight] FAIL");
  console.error(message);
  process.exitCode = 1;
}