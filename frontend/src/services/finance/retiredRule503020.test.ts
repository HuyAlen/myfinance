import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RULE-503020-RETIRE-1 — App-wide retirement of the prescriptive 50/30/20 model.
 *
 * The product keeps the legacy `financial_group` storage field so existing rows
 * remain round-trippable, but no active screen, analytics result, AI insight, or
 * canonical calculation may compute or expose the retired rule.
 */
describe("50/30/20 is retired from active MyFinance behavior", () => {
  const read = (...segments: string[]) =>
    readFileSync(path.resolve(__dirname, ...segments), "utf8").replace(
      /\r\n/g,
      "\n",
    );

  const dashboard = read("../../components/dashboard/DashboardPage.tsx");
  const budgets = read("../../components/budgets/BudgetsPage.tsx");
  const categories = read("../../components/categories/CategoriesPage.tsx");
  const aiInsights = read("../../components/ai-insights/AIInsightsPage.tsx");
  const smartBudget = read("analytics/smartBudget.ts");
  const analyticsIndex = read("analytics/index.ts");
  const calculations = read("financeCalculations.ts");
  const financeTypes = read("../../types/finance.ts");
  const storage = read("financeStorage.ts");

  it("removes the rule name and canonical rule calculator from active product code", () => {
    for (const source of [
      dashboard,
      budgets,
      categories,
      aiInsights,
      smartBudget,
      calculations,
    ]) {
      expect(source).not.toMatch(/50\s*\/\s*30\s*\/\s*20/);
      expect(source).not.toContain("calculateRule503020");
      expect(source).not.toContain("Rule503020Summary");
    }
  });

  it("removes Dashboard allocation computation/UI while retaining canonical Financial Structure", () => {
    expect(dashboard).not.toContain("allocation5030");
    expect(dashboard).not.toContain("AllocationRow");
    expect(dashboard).toContain("calculateFinancialStructureSummary");
    expect(dashboard).toContain('title="Cấu trúc tài chính"');
  });

  it("removes the allocation model and 50%-needs insight from Smart Budget + AI Insights", () => {
    expect(smartBudget).not.toContain("AllocationBucket");
    expect(analyticsIndex).not.toContain("AllocationBucket");
    expect(smartBudget).not.toContain("needs-over-50");
    expect(smartBudget).not.toContain("allocation: {");
    expect(aiInsights).not.toContain("smartBudget.allocation");
    expect(aiInsights).not.toContain("Phân bổ thu nhập");

    // Budget-native analytics remain active.
    expect(smartBudget).toContain("adherenceScore");
    expect(smartBudget).toContain("violations");
    expect(smartBudget).toContain("recommendedBudgets");
  });

  it("removes allocation-only raw reads and dead v7Allocation state from Budgets", () => {
    expect(budgets).not.toContain("v7Allocation");
    expect(budgets).not.toContain("moduleFutureAllocation");
    expect(budgets).not.toContain('from("saving_transactions")');
    expect(budgets).not.toContain('from("forex_cash_transactions")');
    expect(budgets).not.toContain('channel("budgets-future-allocation")');

    expect(budgets).toContain("getBudgets()");
    expect(budgets).toContain("getCategories()");
    expect(budgets).toContain("getTransactions()");
    expect(budgets).toContain(
      "computeSmartBudget(transactions, categories, budgets)",
    );
  });

  it("removes category-facing classification UI but preserves old stored values on edit", () => {
    expect(categories).not.toContain("FINANCIAL_GROUP_OPTIONS");
    expect(categories).not.toContain("FINANCIAL_GROUP_LABELS");
    expect(categories).not.toContain("FINANCIAL_GROUP_BADGE");
    expect(categories).not.toContain("Nhóm 50/30/20");
    expect(categories).toContain(
      "legacyFinancialGroup: category.financialGroup,",
    );
    expect(categories).toContain("financialGroup: form.legacyFinancialGroup,");
    expect(categories).not.toContain(
      'financialGroup: group === "income" ? "income" : "",',
    );
  });

  it("keeps the database field only as an explicitly legacy compatibility surface", () => {
    expect(financeTypes).toContain(
      "Legacy classification field retained only for storage compatibility.",
    );
    expect(financeTypes).toContain("financialGroup?: FinancialGroup;");
    expect(storage).toContain("financial_group?: FinancialGroup | null;");
    expect(storage).toContain(
      "`financial_group` is retained only for backward-compatible row round-tripping.",
    );
    expect(financeTypes).not.toMatch(/50\s*\/\s*30\s*\/\s*20/);
    expect(storage).not.toMatch(/50\s*\/\s*30\s*\/\s*20/);
  });
});
