import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const authProvider = read("src/components/auth/AuthProvider.tsx");
const householdProvider = read(
  "src/components/household/HouseholdProvider.tsx",
);
const realtimeProvider = read(
  "src/components/realtime/RealtimeProvider.tsx",
);
const layout = read("app/layout.tsx");

describe("PRODUCTION-BOOT-RECOVERY-AUDIT-1 — P1", () => {
  it("keeps both auth and household bootstrap bounded instead of allowing permanent loading", () => {
    expect(authProvider).toContain("AUTH_SESSION_TIMEOUT_MS");
    expect(authProvider).toContain("settleBootstrapFailure");

    expect(householdProvider).toContain(
      "const HOUSEHOLD_BOOTSTRAP_TIMEOUT_MS = 12_000;",
    );
    expect(householdProvider).toContain(
      "loadHouseholdContextWithTimeout",
    );
    expect(householdProvider).toContain(
      "window.setTimeout(() =>",
    );
    expect(householdProvider).toContain(
      "HOUSEHOLD_BOOTSTRAP_TIMEOUT_MESSAGE",
    );
  });

  it("uses latest-request-wins semantics for overlapping household refreshes", () => {
    expect(householdProvider).toContain(
      "const refreshRevisionRef = useRef(0);",
    );
    expect(householdProvider).toContain(
      "const requestRevision = ++refreshRevisionRef.current;",
    );
    expect(householdProvider).toMatch(
      /await loadHouseholdContextWithTimeout\(\)[\s\S]*refreshRevisionRef\.current !== requestRevision/,
    );
    expect(householdProvider).toMatch(
      /catch \(loadError\)[\s\S]*refreshRevisionRef\.current !== requestRevision/,
    );
    expect(householdProvider).toMatch(
      /finally[\s\S]*refreshRevisionRef\.current === requestRevision[\s\S]*setLoading\(false\)/,
    );
  });

  it("invalidates pending household refreshes when the provider unmounts", () => {
    expect(householdProvider).toMatch(
      /useEffect\(\(\) => \{[\s\S]*return \(\) => \{[\s\S]*refreshRevisionRef\.current \+= 1/,
    );
  });

  it("does not let background invite/focus refreshes race the initial household bootstrap", () => {
    expect(householdProvider).toContain(
      "contextAuthUserId !== authUserId",
    );
    expect(householdProvider).toContain(
      "[authEmail, authUserId, contextAuthUserId, refresh]",
    );
    expect(householdProvider).toContain(
      "[authUserId, contextAuthUserId, refresh]",
    );
  });

  it("keeps startup visually continuous by reusing the shared shell skeleton", () => {
    expect(householdProvider).toContain(
      'import StartupShellSkeleton from "@/src/components/layout/StartupShellSkeleton"',
    );
    expect(householdProvider).toContain(
      "return <StartupShellSkeleton />;",
    );
    expect(householdProvider).not.toContain(
      "Đang tải không gian tài chính...",
    );
  });

  it("provides explicit household recovery without exposing arbitrary backend error text", () => {
    expect(householdProvider).toContain(
      "HOUSEHOLD_BOOTSTRAP_ERROR_MESSAGE",
    );
    expect(householdProvider).toContain(
      "message.slice(0, 240)",
    );
    expect(householdProvider).toContain(
      "Không thể tải không gian tài chính",
    );
    expect(householdProvider).toContain(
      "onClick={() => void refresh()}",
    );
    expect(householdProvider).toContain(
      "onClick={() => window.location.reload()}",
    );
    expect(householdProvider).toContain('role="alert"');
  });

  it("preserves provider ordering so realtime still starts only after household finance scope resolves", () => {
    expect(layout.indexOf("<HouseholdProvider>")).toBeGreaterThan(-1);
    expect(layout.indexOf("<RealtimeProvider>")).toBeGreaterThan(
      layout.indexOf("<HouseholdProvider>"),
    );
    expect(realtimeProvider).toContain("financeOwnerUserId");
    expect(realtimeProvider).toMatch(
      /if \(!user\?\.id \|\| !financeOwnerUserId\) \{[\s\S]*statusRef\.current = "INITIAL";[\s\S]*return;[\s\S]*\}/,
    );
  });
});