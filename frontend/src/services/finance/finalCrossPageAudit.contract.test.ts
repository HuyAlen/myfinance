import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) =>
  readFileSync(path.resolve(__dirname, relative), "utf8");

describe("FINAL-CROSSPAGE-AUDIT-1 source adoption contract", () => {
  it("keeps Categories planning-group semantics on the canonical classifier", () => {
    const categories = source("../../components/categories/CategoriesPage.tsx");
    expect(categories).toContain("getCategoryPlanningGroup");
    expect(categories).toContain(
      "const group = getCategoryPlanningGroup(category);",
    );
  });

  it("keeps user-entered/current-day finance dates on local calendar semantics", () => {
    const calculations = source("./financeCalculations.ts");
    const savings = source("../../components/savings/SavingsPage.tsx");
    const dashboard = source("../../components/dashboard/DashboardPage.tsx");

    expect(calculations).toContain("const today = formatLocalISODate();");
    expect(savings).toContain("const todayInputValue = () => formatLocalISODate();");
    expect(savings).not.toContain('toISOString().slice(0, 10)');
    expect(dashboard).toContain("toLocalDateKey(new Date())");
  });

  it("keeps AI context and transaction search on canonical real-expense semantics", () => {
    const serverContext = source(
      "./ai-agent/server/aiFinanceContext.server.ts",
    );
    const relevantContext = source(
      "./ai-agent/context/aiRelevantContext.server.ts",
    );
    const readTools = source(
      "./ai-agent/tools/read/financeReadTools.server.ts",
    );

    expect(serverContext).toContain("buildCategorySpendingData(");
    expect(serverContext).not.toContain('if (item.type !== "expense") continue');
    expect(relevantContext).toContain(
      "getTotalExpense(domainTransactions, domainCategories)",
    );
    expect(relevantContext).toContain(
      "summarizeTransactions(transactions, categories)",
    );
    expect(relevantContext).toContain("intent.needsRecentTransactions ||");
    expect(readTools).toContain("isRealExpenseTransaction(");
    expect(readTools).toContain("categories: CategoryRow[];");
  });

  it("keeps server-side current-month semantics pinned to the finance timezone", () => {
    const serverContext = source(
      "./ai-agent/server/aiFinanceContext.server.ts",
    );
    const readTools = source(
      "./ai-agent/tools/read/financeReadTools.server.ts",
    );

    expect(serverContext).toContain(
      "formatYearMonthInTimeZone(date, FINANCE_TIMEZONE)",
    );
    expect(readTools).toContain(
      "formatYearMonthInTimeZone(new Date(), FINANCE_TIMEZONE)",
    );
    expect(readTools).not.toContain('new Date().toISOString().slice(0, 7)');
  });

  it("keeps secondary analytics aligned with real-expense and Budget Spending SSOT", () => {
    const health = source("./analytics/healthScore.ts");
    const anomalies = source("./analytics/spendingAnalytics.ts");
    const smartBudget = source("./analytics/smartBudget.ts");

    expect(health).toContain("buildCategorySpendingData(transactions, categories)");
    expect(anomalies).toContain(
      "getRealExpenseTransactions(transactions, categories)",
    );
    expect(smartBudget).toContain("`${cat.id}-${month}-history`");
    expect(smartBudget).toContain("`${c.categoryId}-${month}-recommendation`");
    expect(smartBudget).not.toContain(
      't.type === "expense" && t.categoryId === cat.id',
    );
  });
  it("keeps storage and Budgets planning-group fallbacks on the canonical classifier", () => {
    const storage = source("./financeStorage.ts");
    const budgets = source("../../components/budgets/BudgetsPage.tsx");

    expect(storage).toContain("return inferCategoryPlanningGroup(category);");
    expect(storage).not.toContain('name.includes("tiết kiệm")');
    expect(budgets).toContain("const categoryGroup = getCategoryPlanningGroup(category);");
    expect(budgets).not.toContain('categoryName.includes("tiết kiệm")');
    expect(budgets).not.toContain('categoryName.includes("đầu tư")');
  });

});
