import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, relativePath), "utf8");

describe("GOAL-SAVINGS-SSOT-1 cross-page adoption", () => {
  it("Goals, Dashboard and Reports all consume calculateGoalFundingSnapshot", () => {
    for (const file of [
      "../../components/goals/GoalsPage.tsx",
      "../../components/dashboard/DashboardPage.tsx",
      "../../components/reports/ReportsPage.tsx",
    ]) {
      expect(read(file)).toContain("calculateGoalFundingSnapshot({");
    }
  });


  it("Dashboard Goal progress is period-independent and uses the cumulative funding ledger", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    expect(dashboard).toContain("getGoalFundingTransactions()");
    expect(dashboard).toContain("transactions: goalFundingTransactions");
    expect(dashboard).toContain("goalFundingTransactions,");
  });

  it("removes the three page-local Savings matching implementations", () => {
    expect(read("../../components/goals/GoalsPage.tsx")).not.toContain(
      "getSupabaseSavingAmountForGoal",
    );
    expect(read("../../components/dashboard/DashboardPage.tsx")).not.toContain(
      "getDashboardGoalSavingAmount",
    );
    expect(read("../../components/reports/ReportsPage.tsx")).not.toContain(
      "getSupabaseSavingAmountForReportGoal",
    );
  });

  it("Header notifications receive Savings and subscribe to Savings changes", () => {
    const header = read("../../components/layout/Header.tsx");
    const notifications = read("../../lib/notifications/financeNotifications.ts");
    expect(header).toContain("getSavings()");
    expect(header).toContain("savings: data.savings");
    expect(header).toContain('"savings"');
    expect(notifications).toContain("calculateGoalFundingSnapshot({");
    expect(notifications).toContain("savings?: SavingAccount[]");
  });

  it("AI Insights loads Savings plus cumulative Goal funding transactions and passes both into the advisor Goal engine", () => {
    const page = read("../../components/ai-insights/AIInsightsPage.tsx");
    const advisor = read("analytics/aiAdvisorEngine.ts");
    const goalAnalytics = read("analytics/goalAnalytics.ts");
    expect(page).toContain("getSavings()");
    expect(page).toContain("getGoalFundingTransactions()");
    expect(page).toContain("goalFundingTransactions,");
    expect(page).toContain("savings,");
    expect(advisor).toContain("savings?: SavingAccount[]");
    expect(advisor).toContain("goalFundingTransactions?: Transaction[]");
    expect(advisor).toContain(
      "getGoalScore(goals, goalFundingTransactions, savings)",
    );
    expect(goalAnalytics).toContain(
      "transactions: goalFundingTransactions",
    );
  });

  it("every server AI goal context uses the same canonical funding snapshot", () => {
    expect(read("ai-agent/server/aiFinanceContext.server.ts")).toContain(
      "calculateGoalFundingSnapshot({",
    );
    expect(read("ai-agent/context/aiRelevantContext.server.ts")).toContain(
      "calculateGoalFundingSnapshot({ goal, transactions, savings })",
    );
    expect(read("ai-agent/context/aiRelevantContext.server.ts")).toContain(
      'table: "savings"',
    );
    expect(read("ai-agent/tools/read/financeReadTools.server.ts")).toContain(
      "calculateGoalFundingSnapshot({",
    );
  });
});
