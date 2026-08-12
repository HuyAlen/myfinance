import { describe, expect, it } from "vitest";
import { generateDashboardActions } from "./financeCalculations";
import { buildBudgetsHref, buildGoalsHref } from "@/src/lib/navigation/financeNavigation";
import type { Budget, Category, Goal, Transaction, Wallet } from "@/src/types/finance";

/**
 * INTEGRATION-2 regression: Dashboard action cards that are actually about a
 * specific Budget/Goal must carry that entity's id in `ctaRoute`, not a bare
 * `/budgets` or `/goals` path — see the canonical navigation contract in
 * src/lib/navigation/financeNavigation.ts.
 */

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

describe("generateDashboardActions — contextual navigation", () => {
  it("an over-budget action's ctaRoute carries the specific budgetId", () => {
    const month = currentMonthKey();
    const wallets: Wallet[] = [{ id: "w1", name: "Cash", type: "cash", balance: 1_000_000 }];
    const categories: Category[] = [
      { id: "c1", name: "Food", type: "expense", planningGroup: "variable" },
    ];
    const budgets: Budget[] = [
      { id: "b1", categoryId: "c1", month, limitAmount: 100_000 },
    ];
    const transactions: Transaction[] = [
      {
        id: "t1",
        type: "expense",
        amount: 200_000,
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${month}-05`,
      },
    ];

    const actions = generateDashboardActions({
      transactions,
      wallets,
      budgets,
      goals: [],
      debts: [],
      investments: [],
      categories,
    });

    const budgetAction = actions.find((a) => a.icon === "budget");
    expect(budgetAction).toBeDefined();
    expect(budgetAction?.ctaRoute).toBe(buildBudgetsHref({ budgetId: "b1" }));
    expect(budgetAction?.ctaRoute).toBe("/budgets?budgetId=b1");
    // Must never encode spent/limitAmount/usagePercent into the URL.
    expect(budgetAction?.ctaRoute).not.toContain("spent");
    expect(budgetAction?.ctaRoute).not.toContain("limitAmount");
  });

  it("a slow-goal action's ctaRoute carries the specific goalId", () => {
    const goals: Goal[] = [
      { id: "g1", name: "Emergency Fund", targetAmount: 100_000, currentAmount: 10_000 },
    ];

    const actions = generateDashboardActions({
      transactions: [
        {
          id: "t1",
          type: "income",
          amount: 1,
          categoryId: "c1",
          walletId: "w1",
          note: "",
          date: "2020-01-01",
        },
      ],
      wallets: [{ id: "w1", name: "Cash", type: "cash", balance: 1 }],
      budgets: [],
      goals,
      debts: [],
      investments: [],
      categories: [],
    });

    const goalAction = actions.find((a) => a.icon === "goal");
    expect(goalAction).toBeDefined();
    expect(goalAction?.ctaRoute).toBe(buildGoalsHref({ goalId: "g1" }));
    expect(goalAction?.ctaRoute).toBe("/goals?goalId=g1");
  });
});
