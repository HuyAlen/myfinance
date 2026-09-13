import { describe, expect, it } from "vitest";
import type { Budget, Category, Transaction } from "@/src/types/finance";
import { computeSmartBudget } from "./smartBudget";

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

describe("BUDGET-AT-LIMIT-INTEGRITY-1 smart budget", () => {
  it("consumes the canonical at-limit status at exact equality instead of reclassifying it as near", () => {
    const month = currentMonthKey();
    const categories: Category[] = [
      { id: "cat-home", name: "Nhà ở", type: "expense", planningGroup: "fixed" },
    ];
    const budgets: Budget[] = [
      { id: "budget-home", categoryId: "cat-home", month, limitAmount: 6_500_000 },
    ];
    const transactions: Transaction[] = [
      {
        id: "tx-home",
        type: "expense",
        amount: 6_500_000,
        categoryId: "cat-home",
        walletId: "wallet-1",
        note: "",
        date: `${month}-01`,
      },
    ];

    const result = computeSmartBudget(transactions, categories, budgets);
    const home = result.categoryAnalysis.find((item) => item.categoryId === "cat-home");

    expect(home?.usagePercent).toBe(100);
    expect(home?.status).toBe("at-limit");
    expect(result.violations).toHaveLength(0);
    expect(result.adherenceScore).toBe(100);
    expect(result.recommendedBudgets[0]?.reasoning).toContain("Đã dùng hết ngân sách");
  });
});
