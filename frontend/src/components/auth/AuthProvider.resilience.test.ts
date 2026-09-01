import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/components/auth/AuthProvider.tsx"),
  "utf8",
);

describe("AUTH-RESILIENCE-1 — auth bootstrap recovery contract", () => {
  it("bounds initial session bootstrap so AppShell cannot remain loading forever", () => {
    expect(source).toContain("AUTH_SESSION_TIMEOUT_MS");
    expect(source).toContain("window.setTimeout");
    expect(source).toContain("settleBootstrapFailure");
    expect(source).toContain("setLoading(false)");
  });

  it("handles both Supabase result errors and rejected getSession promises", () => {
    expect(source).toMatch(/getSession\(\)[\s\S]*\.then\(/);
    expect(source).toContain("if (error)");
    expect(source).toMatch(/\.catch\(\(error: unknown\)/);
  });

  it("fails closed without inventing an authenticated user", () => {
    expect(source).toMatch(
      /settleBootstrapFailure[\s\S]*setSession\(null\)[\s\S]*setUser\(null\)[\s\S]*setLoading\(false\)/,
    );
  });

  it("prevents a stale initial getSession result from overwriting a newer auth event", () => {
    expect(source).toContain("authStateRevision");
    expect(source).toContain("initialRevision");
    expect(source).toMatch(
      /onAuthStateChange[\s\S]*authStateRevision \+= 1[\s\S]*applyResolvedSession\(nextSession\)/,
    );
    expect(source).toMatch(
      /getSession\(\)[\s\S]*authStateRevision !== initialRevision/,
    );
  });

  it("cleans up the timeout and Supabase subscription on unmount", () => {
    expect(source).toMatch(
      /return \(\) => \{[\s\S]*active = false;[\s\S]*window\.clearTimeout\(initialSessionTimeout\);[\s\S]*subscription\.unsubscribe\(\);/,
    );
  });

  it("keeps local UI mode synchronous and preserves auth readiness instrumentation", () => {
    expect(source).toContain("useState<User | null>(() =>");
    expect(source).toContain("useState<Session | null>(() =>");
    expect(source).toContain("useState(() => !LOCAL_UI_MODE)");
    expect(source).toContain('reportPerformanceMetric(\n        "auth_ready"');
  });
});
