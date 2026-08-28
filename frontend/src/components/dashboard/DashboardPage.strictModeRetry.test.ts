import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASHBOARD-RETRY-1 — StrictMode-safe Initial Load & False Retry Elimination.
 *
 * Regression contract for the Dashboard reload coordinator. React StrictMode
 * replays mount effects in development; the second initial caller must join
 * the active request rather than interpreting an in-flight load as failure.
 */
describe("Dashboard StrictMode-safe initial reload coordination", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  function extractReloadCoordinator() {
    const start = source.indexOf(
      "// Guards against overlapping Dashboard reloads.",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("// Realtime-only entry point:", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("tracks the active reload Promise instead of a boolean-only overlap guard", () => {
    const coordinator = extractReloadCoordinator();
    expect(coordinator).toContain(
      "const inFlightReloadPromiseRef = useRef<Promise<boolean> | null>(null);",
    );
    expect(coordinator).not.toContain("const isReloadingRef = useRef(false);");
  });

  it("makes an overlapping initial mount await the same in-flight result", () => {
    const coordinator = extractReloadCoordinator();
    expect(coordinator).toContain(
      "const inFlight = inFlightReloadPromiseRef.current;",
    );
    expect(coordinator).toContain('if (trigger !== "initial")');
    expect(coordinator).toContain("return inFlight;");
    expect(coordinator).not.toContain(
      "return hasLoadedNetWorthRef.current && hasLoadedCashFlowRef.current;",
    );
  });

  it("preserves one trailing reload for realtime overlap", () => {
    const coordinator = extractReloadCoordinator();
    expect(coordinator).toContain("hasPendingReloadRef.current = true;");
    expect(coordinator).toContain("pendingReloadTriggerRef.current = trigger;");
    expect(coordinator).toContain("} while (hasPendingReloadRef.current);");
  });

  it("releases the in-flight slot after the active cycle settles", () => {
    const coordinator = extractReloadCoordinator();
    expect(coordinator).toContain("const reloadPromise = (async () => {");
    expect(coordinator).toContain("inFlightReloadPromiseRef.current = null;");
    expect(coordinator).not.toContain(
      "if (inFlightReloadPromiseRef.current === reloadPromise)",
    );
  });

  it("keeps the bounded real-failure retry policy", () => {
    expect(source).toContain("DASHBOARD_INITIAL_RETRY_DELAY_MS = 750");
    expect(source).toContain(
      'const firstAttemptReady = await runReloadRef.current("initial");',
    );
    expect(source).toContain("if (cancelled || firstAttemptReady) return;");
    expect(source).toContain("setIsDashboardRecoveryRetrying(true);");
    expect(source).toContain(
      "await waitForDashboardRetry(DASHBOARD_INITIAL_RETRY_DELAY_MS);",
    );
  });

  it("does not weaken the Dashboard query timeout safety net", () => {
    expect(source).toContain("const DASHBOARD_QUERY_TIMEOUT_MS = 10_000;");
    expect(source).toContain("function withDashboardTimeout<T>(");
  });
});
