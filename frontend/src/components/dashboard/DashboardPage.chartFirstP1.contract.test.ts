import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("MYFINANCE DASHBOARD CHART FIRST P1", () => {
  const page = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
  const visuals = readFileSync(path.resolve(__dirname, "DashboardVisualOverview.tsx"), "utf8");

  it("defaults to charts, with a full-detail switch without removing existing sections", () => {
    expect(page).toContain('useState<"charts" | "details">("charts")');
    expect(page).toContain('data-dashboard-view-switch="true"');
    expect(page).toContain('data-dashboard-detail-mode="true"');
    expect(page).toContain('data-dashboard-customization-zone="supporting-sections"');
    expect(page).toContain('data-dashboard-action-center="true"');
  });

  it("keeps operating income and expenses separated from capital movement", () => {
    expect(page).toContain("buildMonthlyCashFlowData");
    expect(page).toContain("nonTransferFilteredTransactions");
    expect(page).toContain("budgetSpending={budgetSpendingSnapshot}");
    expect(visuals).toContain("buildCategorySpendingData(transactions, categories)");
    expect(visuals).toContain("budgetSpending: BudgetSpending[]");
  });

  it("keeps clear readiness and empty data states for every chart", () => {
    expect(visuals).toContain("cashFlowReady");
    expect(visuals).toContain("spendingReady");
    expect(visuals).toContain("budgetReady");
    expect(visuals).toContain("walletsReady");
    expect(visuals).toContain("Chưa có khoản chi thực tế");
    expect(visuals).toContain("Chọn bộ lọc Tháng");
  });
});
