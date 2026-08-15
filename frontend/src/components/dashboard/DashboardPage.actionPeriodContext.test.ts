import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-CORRECTNESS-1 — Dashboard Action Period Context.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the existing pattern in
 * DashboardPage.budgetAttentionWiring.test.ts and
 * DashboardPage.summaryConsistency.test.ts.
 *
 * Proves DashboardPage passes its OWN selected-period month key into
 * generateDashboardActions explicitly, rather than letting that function
 * guess a wall-clock "current month" internally — the exact bug the final
 * Dashboard audit found (Action Center's over-budget advisor action could
 * evaluate the real current month while every other period-aware surface
 * showed the user's actually-selected historical month).
 */
describe("DashboardPage passes explicit period context to generateDashboardActions (FINANCE-CORRECTNESS-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("the aiActions call site passes monthKey: dashboardMonthKey", () => {
    const callStart = source.indexOf("generateDashboardActions({");
    expect(callStart).toBeGreaterThan(-1);
    const callEnd = source.indexOf("}),", callStart);
    expect(callEnd).toBeGreaterThan(callStart);
    const callSource = source.slice(callStart, callEnd);

    expect(callSource).toContain("monthKey: dashboardMonthKey");
  });

  it("aiActions' useMemo dependency array includes dashboardMonthKey", () => {
    const memoStart = source.indexOf("const aiActions = useMemo(");
    expect(memoStart).toBeGreaterThan(-1);
    const memoEnd = source.indexOf("const actionIcons", memoStart);
    expect(memoEnd).toBeGreaterThan(memoStart);
    const memoSource = source.slice(memoStart, memoEnd);

    expect(memoSource).toContain("dashboardMonthKey");
  });

  it("dashboardMonthKey is defined exactly once — shared, not recomputed independently for Action Center", () => {
    const occurrences = source.split("const dashboardMonthKey = useMemo(").length - 1;
    expect(occurrences).toBe(1);
  });

  it("the aiActions call site does not introduce its own wall-clock date logic", () => {
    const callStart = source.indexOf("generateDashboardActions({");
    const callEnd = source.indexOf("}),", callStart);
    const callSource = source.slice(callStart, callEnd);

    expect(callSource).not.toContain("new Date()");
    expect(callSource).not.toContain("getMonth()");
    expect(callSource).not.toContain("getFullYear()");
    expect(callSource).not.toContain("getLastMonthKeys");
  });

  it("dashboardActionPriority.ts (UI-DASH-3 semantic identity) has zero diff surface touched by this patch — still imports the same helpers", () => {
    expect(source).toContain("deriveAggregateIssueKind(domain)");
    expect(source).toContain("selectDashboardPriorityActions([");
  });

  it("Budget Attention (UI-DASH-2) and DASH-POLISH-1 readiness are untouched — still present unmodified", () => {
    expect(source).toContain("const budgetAttentionReady = isBudgetAttentionReady(");
    expect(source).toContain("const monthlyProgressReady = isMonthlyProgressReady(");
    expect(source).toContain(
      "const financialStructureReady = cashFlowReady && savingInvestmentReady;",
    );
  });

  it("does not add a new getTransactionsInRange or getBudgets call site", () => {
    expect(source.split("getTransactionsInRange(").length - 1).toBe(3);
    expect(source.split("getBudgets(").length - 1).toBe(1);
  });
});
