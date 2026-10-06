import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const normalized = source.replace(/\s+/g, " ");

describe("FINANCE-ACTION-CENTER-1 Dashboard canonical wiring", () => {
  it("builds work-to-do from the canonical notification/action layers instead of reviving the old Dashboard heuristic generators", () => {
    expect(source).toContain('from "@/src/lib/notifications/financeNotifications"');
    expect(source).toContain('from "@/src/lib/notifications/actionableFinanceAlerts"');
    expect(source).toContain('from "@/src/lib/dashboard/financeActionCenter"');
    expect(source).toContain("buildFinanceNotifications({");
    expect(source).toContain("buildActionableFinanceAlerts({");
    expect(source).toContain("buildFinanceActionCenter(actionCenterAlerts, 3)");

    expect(source).not.toContain("generateDashboardActions");
    expect(source).not.toContain("selectDashboardPriorityActions");
    expect(source).not.toContain("DashboardActionCandidate");
    expect(source).not.toContain("priorityActions");
  });

  it("is a real-today command center even when the Dashboard picker is showing another period", () => {
    expect(source).toContain("const actionCenterMonthKey = getCurrentLocalMonthKey();");
    expect(normalized).toContain(
      "transactions.filter((transaction) => transaction.date.startsWith(actionCenterMonthKey), )",
    );
    expect(source).toContain("currentMonth: actionCenterMonthKey");
  });

  it("reuses the canonical review acknowledgement semantics and recurring-due detector", () => {
    expect(source).toContain("rawActionCenterReviewInbox");
    expect(source).toContain("applyTransactionReviewAcknowledgements(");
    expect(source).toContain("buildRecurringDueActions({");
    expect(source).toContain("summarizeRecurringDueActions(");
    expect(source).toContain("recurringDueSummary:");
  });

  it("gates validated-looking Action Center content until snapshot, cash-flow and budgets are all ready", () => {
    expect(normalized).toContain(
      "const financeActionCenterReady = isDashboardReady && cashFlowReady && budgetsLoaded;",
    );
    expect(source).toContain("!financeActionCenterReady ? (");
  });

  it("adds zero finance queries — it reuses the Dashboard snapshot already loaded in memory", () => {
    for (const fn of [
      "getWallets(",
      "getDebts(",
      "getInvestments(",
      "getGoals(",
      "getBudgets(",
      "getCategories(",
    ]) {
      expect(source.split(fn).length - 1).toBe(1);
    }
    expect(source).not.toContain("getActionCenter");
    expect(source).not.toContain("getFinanceActions");
  });

  it("renders a pinned three-item next-action surface after KPIs and before customizable supporting sections", () => {
    const kpiIndex = source.indexOf("{/* Operating KPIs */}");
    const actionIndex = source.indexOf('data-dashboard-action-center="true"');
    const toolbarIndex = source.indexOf('data-dashboard-customization-toolbar="true"');

    expect(kpiIndex).toBeGreaterThan(-1);
    expect(actionIndex).toBeGreaterThan(kpiIndex);
    expect(toolbarIndex).toBeGreaterThan(actionIndex);
    expect(source).toContain("Việc cần làm");
    expect(source).toContain("Tối đa 3 việc tài chính cần xử lý trước");
    expect(source).toContain("financeActionCenter.items.map((item) => {");
  });

  it("each card has one semantic next action and exposes priority/kind for QA", () => {
    expect(source).toContain("onClick={() => router.push(item.href)}");
    expect(source).toContain("data-dashboard-action-kind={item.kind}");
    expect(source).toContain("data-dashboard-action-priority={item.priority}");
    expect(source).toContain("{item.actionLabel}");
    expect(source).toContain("getActionableAlertPriorityLabel(item.priority)");
  });

  it("does not fabricate goal pace advice until the Goal model has a deadline/pace contract", () => {
    const start = source.indexOf("buildFinanceNotifications({", source.indexOf("actionCenterBaseNotifications"));
    const end = source.indexOf("}),", start);
    const region = source.slice(start, end);
    expect(region).toContain("goals: []");
  });
});