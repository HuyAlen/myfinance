import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASHBOARD-DATA-READINESS-1 — Recoverable Initial Load & Stale Skeleton Guard.
 *
 * Source-inspection contracts are intentional in this repository: they protect
 * the orchestration/readiness invariants without adding a browser mounting
 * dependency to the Dashboard test suite.
 */
describe("DashboardPage recoverable initial load contract (DASHBOARD-DATA-READINESS-1)", () => {
  const dashboardSource = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    path.resolve(__dirname, "../realtime/RealtimeProvider.tsx"),
    "utf8",
  );

  it("bounds Dashboard query waits so a never-resolving request cannot hold skeleton readiness forever", () => {
    expect(dashboardSource).toContain("const DASHBOARD_QUERY_TIMEOUT_MS = 10_000;");
    expect(dashboardSource).toContain("function withDashboardTimeout<T>(");
    expect(dashboardSource).toContain("timed out after ${timeoutMs}ms");
    expect(dashboardSource).toContain("const bounded = <T,>(label: string, promise: PromiseLike<T>) =>");
  });

  it("applies the timeout boundary to Hero-critical and secondary full-reload domains", () => {
    for (const label of [
      '"wallets"',
      '"investments"',
      '"forex_accounts"',
      '"forex_equity"',
      '"forex_ledger"',
      '"categories"',
      '"transactions"',
      '"goal_funding_transactions"',
      '"net_worth_history"',
      '"debts"',
      '"goals"',
      '"savings"',
      '"saving_transactions"',
      '"budgets"',
    ]) {
      expect(dashboardSource).toContain(`bounded(\n      ${label}`);
    }
  });

  it("bounds pure period reloads too, preventing year switches from hanging forever", () => {
    expect(dashboardSource).toContain('"period_transactions"');
    expect(dashboardSource).toContain('"period_net_worth_history"');
    expect(dashboardSource).toContain("const transactionsRequest = withDashboardTimeout(");
    expect(dashboardSource).toContain("const historyRequest = withDashboardTimeout(");
  });

  it("returns critical readiness from reloadData and keeps the existing no-overlap trailing reload guard", () => {
    expect(dashboardSource).toContain(
      "return hasLoadedNetWorthRef.current && hasLoadedCashFlowRef.current;",
    );
    expect(dashboardSource).toContain("const isReloadingRef = useRef(false);");
    expect(dashboardSource).toContain("hasPendingReloadRef.current = true;");
    expect(dashboardSource).toContain("} while (hasPendingReloadRef.current);");
  });

  it("automatically retries one failed initial load after the bounded first attempt", () => {
    expect(dashboardSource).toContain("DASHBOARD_INITIAL_RETRY_DELAY_MS = 750");
    expect(dashboardSource).toContain('runReloadRef.current("initial")');
    expect(dashboardSource).toContain("const firstAttemptReady = await");
    expect(dashboardSource).toContain("const retryReady = await runReloadRef.current(\"initial\")");
    expect(dashboardSource).toContain("setIsDashboardRecoveryRetrying(true)");
  });

  it("surfaces a recoverable error instead of leaving only indefinite skeletons after both initial attempts fail", () => {
    expect(dashboardSource).toContain("dashboardRecoveryError");
    expect(dashboardSource).toContain("Chưa thể đồng bộ Dashboard");
    expect(dashboardSource).toContain("Dữ liệu chưa tải được. Kiểm tra kết nối rồi thử lại.");
    expect(dashboardSource).toContain("Thử lại");
    expect(dashboardSource).toContain("retryDashboardLoad");
  });

  it("retries when the app returns to foreground or the browser comes back online", () => {
    expect(dashboardSource).toContain('document.addEventListener("visibilitychange", onVisibilityChange)');
    expect(dashboardSource).toContain('document.visibilityState === "visible"');
    expect(dashboardSource).toContain('window.addEventListener("online", recover)');
    expect(dashboardSource).toContain('runReloadRef.current("realtime")');
  });

  it("clears recovery UI after a later successful recovery without clearing last-known-good finance state", () => {
    expect(dashboardSource).toContain("if (ready) {");
    expect(dashboardSource).toContain("setDashboardRecoveryError(null);");
    expect(dashboardSource).toContain("if (hasLoadedNetWorthRef.current) {");
    expect(dashboardSource).toContain("if (hasLoadedCashFlowRef.current) {");
    expect(dashboardSource).not.toContain("setWallets([])");
    expect(dashboardSource).not.toContain("setTransactions([])");
  });

  it("Dashboard listens to every finance table whose changes affect the visible snapshot/readiness domains", () => {
    const registrationStart = dashboardSource.indexOf("useRealtimeTable(");
    expect(registrationStart).toBeGreaterThan(-1);
    const registration = dashboardSource.slice(registrationStart, registrationStart + 700);
    for (const table of [
      '"wallets"',
      '"categories"',
      '"transactions"',
      '"savings"',
      '"saving_transactions"',
      '"investments"',
      '"net_worth_snapshots"',
      '"forex_accounts"',
      '"forex_cash_transactions"',
      '"debts"',
      '"goals"',
      '"budgets"',
    ]) {
      expect(registration).toContain(table);
    }
  });

  it("RealtimeProvider actually subscribes savings, saving_transactions, and net_worth_snapshots instead of only typing them", () => {
    for (const table of ["savings", "saving_transactions", "net_worth_snapshots"]) {
      const occurrences = realtimeSource.split(`\"${table}\"`).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }
    expect(realtimeSource).toContain('filter: `user_id=eq.${user.id}`');
  });
});
