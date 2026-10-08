import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(frontendRoot, "..");

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const packageJson = JSON.parse(read("frontend/package.json")) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};
const packageLock = read("frontend/package-lock.json");
const gate = read("frontend/scripts/release-gate.mjs");
const preflight = read("frontend/scripts/validate-env.mjs");
const runtime = read("frontend/src/lib/supabase.ts");
const envExample = read("frontend/.env.example");
const rootGitignore = read(".gitignore");
const frontendGitignore = read("frontend/.gitignore");
const docs = read("docs/SUPABASE_SETUP.md");

describe("SUPABASE-BOOTSTRAP-ENV-1 — P1", () => {
  it("tracks one safe environment template without embedding real credentials", () => {
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_URL=");
    expect(envExample).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY=");
    expect(envExample).toContain("AI_SETTINGS_ENCRYPTION_KEY=");
    expect(envExample).not.toMatch(/supabase\.co\/?\S+/);
    expect(rootGitignore).toContain("!frontend/.env.example");
    expect(frontendGitignore).toContain("!.env.example");
  });

  it("uses Next's own environment loader instead of inspecting only shell variables", () => {
    expect(packageJson.dependencies["@next/env"]).toBe("16.3.3");
    expect(packageLock).toContain('"node_modules/@next/env"');
    expect(preflight).toContain('import nextEnv from "@next/env"');
    expect(preflight).toContain("const { loadEnvConfig } = nextEnv");
    expect(preflight).toContain("loadEnvConfig(");
    expect(preflight).toContain("mode === \"development\"");
  });

  it("preflights dev, build, and start with the appropriate Next environment mode", () => {
    expect(packageJson.scripts["env:check"]).toBe(
      "node scripts/validate-env.mjs --mode=production",
    );
    expect(packageJson.scripts.dev).toBe(
      "node scripts/validate-env.mjs --mode=development && next dev",
    );
    expect(packageJson.scripts.build).toBe(
      "node scripts/validate-env.mjs --mode=production && next build",
    );
    expect(packageJson.scripts.start).toBe(
      "node scripts/validate-env.mjs --mode=production && next start",
    );
  });

  it("runs production env preflight before TypeScript in the canonical release gate", () => {
    const envIndex = gate.indexOf('"Environment preflight"');
    const typeScriptIndex = gate.indexOf('"TypeScript"');

    expect(envIndex).toBeGreaterThan(-1);
    expect(typeScriptIndex).toBeGreaterThan(envIndex);
    expect(gate).toContain('"scripts/validate-env.mjs"');
    expect(gate).toContain('args: ["--mode=production"]');
  });

  it("keeps direct NEXT_PUBLIC references in the client singleton for Next compile-time inlining", () => {
    expect(runtime).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL",
    );
    expect(runtime).toContain(
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
    expect(runtime).toContain("requireSupabasePublicEnv");
    expect(runtime).not.toContain('throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")');
  });

  it("documents the tracked template and explicit validation command", () => {
    expect(docs).toContain("frontend/.env.example");
    expect(docs).toContain("Copy-Item .env.example .env.local");
    expect(docs).toContain("npm run env:check");
    expect(docs).toContain("fails before `next build`");
  });
});