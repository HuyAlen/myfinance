import { describe, expect, it } from "vitest";
import type { FinanceContext } from "./aiFinanceContext.server";
import { buildLocalFinanceAnswer } from "./aiProviderRuntime.server";

function makeContext(
  budgetStatus: FinanceContext["budgetStatus"],
): FinanceContext {
  return {
    generatedAt: "2026-09-13T00:00:00.000Z",
    counts: {
      wallets: 0,
      categories: 0,
      transactions: 0,
      debts: 0,
      goals: 0,
      budgets: budgetStatus.length,
      investments: 0,
      savings: 0,
      forexAccounts: 0,
    },
    totals: {
      walletBalance: 0,
      savingsBalance: 0,
      investmentValue: 0,
      forexAssetValue: 0,
      totalAssets: 0,
      totalDebt: 0,
      netWorth: 0,
      currentMonthIncome: 0,
      currentMonthExpense: 0,
      currentMonthCashFlow: 0,
      savingRate: 0,
    },
    topExpenseCategories: [],
    budgetStatus,
    goals: [],
  };
}

describe("BUDGET-AT-LIMIT-INTEGRITY-1 local AI budget wording", () => {
  it("reports exact 100% as at-limit, not over-budget", () => {
    const result = buildLocalFinanceAnswer(
      "Ngân sách tháng này thế nào?",
      makeContext([
        {
          category: "Nhà ở",
          limit: 6_500_000,
          spent: 6_500_000,
          usagePercent: 100,
          status: "at-limit",
        },
      ]),
    );

    expect(result.answer).toContain("Ngân sách Nhà ở đã đạt giới hạn 100%.");
    expect(result.answer).not.toContain("Nhà ở đã vượt giới hạn");
  });

  it("trusts canonical near status even when display percentage rounds to 100%", () => {
    const result = buildLocalFinanceAnswer(
      "Ngân sách tháng này thế nào?",
      makeContext([
        {
          category: "Ăn uống",
          limit: 10_000,
          spent: 9_970,
          usagePercent: 100,
          status: "near",
        },
      ]),
    );

    expect(result.answer).toContain(
      "Ngân sách Ăn uống sắp đạt giới hạn, hiện dùng 100%.",
    );
    expect(result.answer).not.toContain("Ăn uống đã vượt giới hạn");
  });

  it("keeps true overspend distinct from at-limit", () => {
    const result = buildLocalFinanceAnswer(
      "Ngân sách tháng này thế nào?",
      makeContext([
        {
          category: "Điện",
          limit: 1_000_000,
          spent: 1_100_000,
          usagePercent: 110,
          status: "over",
        },
      ]),
    );

    expect(result.answer).toContain(
      "Ngân sách Điện đã vượt giới hạn, hiện dùng 110%.",
    );
  });
});
