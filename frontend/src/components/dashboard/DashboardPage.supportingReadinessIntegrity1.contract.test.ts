import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

describe("DASHBOARD-SUPPORTING-READINESS-INTEGRITY-1", () => {
  it("composes supporting readiness from existing validated domains instead of array length", () => {
    expect(source).toContain("const recurringPanelReady = isRecurringSupportReady(");
    expect(source).toContain("const recentActivityReady = isRecentActivityReady(");
    expect(source).toContain("const dataHealthReady = isDataHealthReady(");
    expect(source).toContain("const monthEndCloseoutReady = isMonthEndCloseoutReady(");
    expect(source).not.toContain("const recentActivityReady = recentTxnGroups.length");
  });

  it("does not show a fake Recurring empty state before wallet and period inputs are ready", () => {
    const start = source.indexOf('title="Sắp đến hạn trong 30 ngày"');
    const end = source.indexOf('title="Danh mục chi tiêu lớn nhất"', start);
    const panel = source.slice(start, end);
    expect(panel).toContain("!recurringPanelReady ? (");
    expect(panel).toContain('data-dashboard-supporting-loading="recurring"');
    expect(panel).toContain("recurringPanelReady && recurringCashForecast.eventCount30 > 0");
    expect(panel).toContain("upcomingMoneyEvents.length === 0");
  });

  it("keeps Forex values behind forexReady instead of formatting initial zero state", () => {
    const start = source.indexOf('title="Tài khoản ngoại hối"');
    const end = source.indexOf('title="Mục tiêu tài chính"', start);
    const panel = source.slice(start, end);
    expect(panel).toContain("!forexReady ? (");
    expect(panel).toContain('data-dashboard-supporting-loading="forex"');
    expect(panel).toContain("formatVND(forexSnapshot.balance)");
  });

  it("keeps Goals subtitle and empty state behind goalsReady", () => {
    const start = source.indexOf('title="Mục tiêu tài chính"');
    const end = source.indexOf('title="Giao dịch gần đây"', start);
    const panel = source.slice(start, end);
    expect(panel).toContain("goalsReady");
    expect(panel).toContain('data-dashboard-supporting-loading="goals"');
    expect(panel).toContain("goalRows.length === 0");
    expect(panel).toContain("Đang tải dữ liệu mục tiêu");
  });

  it("does not present Recent Activity as legitimately empty until every merged domain is ready", () => {
    const start = source.indexOf('title="Giao dịch gần đây"');
    const end = source.indexOf("{/* UI-DASH-1: today's daily pulse", start);
    const panel = source.slice(start, end);
    expect(panel).toContain("!recentActivityReady ? (");
    expect(panel).toContain('data-dashboard-supporting-loading="recent-activity"');
    expect(panel).toContain("recentTxnGroups.length === 0");
  });

  it("gates Data Health and Month-End Closeout on their full supporting dependency sets", () => {
    expect(source).toContain(") : !dataHealthReady ? (");
    expect(source).toContain("!monthEndCloseoutReady ? (");
    expect(source).toContain('data-dashboard-supporting-loading="month-end-closeout"');
    expect(source).toContain("!monthEndCloseoutReady ||");
  });

  it("adds no finance query, mutation, or new readiness fetch state", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(2);
    expect(source.split("getBudgets(").length - 1).toBe(1);
    expect(source.split("getForexCashTransactions(").length - 1).toBe(1);
    expect(source.split("getNetWorthSnapshotsInRange(").length - 1).toBe(2);
    expect(source).not.toContain("setRecurringPanelReady(");
    expect(source).not.toContain("setRecentActivityReady(");
    expect(source).not.toContain("setMonthEndCloseoutReady(");
  });
});