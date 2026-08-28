import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ReportsPage realtime dependency integrity", () => {
  const source = readFileSync(path.resolve(__dirname, "ReportsPage.tsx"), "utf8");

  it("registers every table consumed by the canonical report snapshot", () => {
    const start = source.indexOf("useRealtimeTable(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    const call = source.slice(start, end);

    for (const table of [
      "wallets",
      "investments",
      "categories",
      "transactions",
      "debts",
      "goals",
      "budgets",
      "forex_accounts",
      "forex_cash_transactions",
      "savings",
      "saving_transactions",
    ]) {
      expect(call).toContain(`"${table}"`);
    }
    expect(call).toContain("requestReportsRealtimeRefresh");
  });

  it("debounces event bursts and clears the timer on unmount", () => {
    expect(source).toContain("REPORTS_REALTIME_REFRESH_DEBOUNCE_MS = 120");
    expect(source).toContain("reportsRealtimeTimerRef");
    expect(source).toContain("window.clearTimeout(reportsRealtimeTimerRef.current)");
  });

  it("uses single-flight with a trailing reload so an in-flight refresh never loses a later event", () => {
    expect(source).toContain("if (isReportsReloadingRef.current) {");
    expect(source).toContain("hasPendingReportsReloadRef.current = true;");
    expect(source).toContain("do {");
    expect(source).toContain("await load();");
    expect(source).toContain("} while (hasPendingReportsReloadRef.current);");
  });
});
