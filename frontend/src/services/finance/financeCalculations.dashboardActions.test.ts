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
      monthKey: month,
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
      monthKey: "2020-01",
    });

    const goalAction = actions.find((a) => a.icon === "goal");
    expect(goalAction).toBeDefined();
    expect(goalAction?.ctaRoute).toBe(buildGoalsHref({ goalId: "g1" }));
    expect(goalAction?.ctaRoute).toBe("/goals?goalId=g1");
  });
});

/**
 * FINANCE-CORRECTNESS-1: the over-budget advisor action must evaluate the
 * caller-supplied `monthKey` (the Dashboard's SELECTED period), never an
 * internal wall-clock "real current month" guess. `HISTORICAL_MONTH` is a
 * fixed past month standing in for "whatever the Dashboard has selected,
 * which may not be the real current month"; `currentMonthKey()` stands in
 * for "the real current month" at whatever date these tests actually run.
 */
describe("generateDashboardActions — period context (FINANCE-CORRECTNESS-1)", () => {
  const HISTORICAL_MONTH = "2020-03";

  const wallets: Wallet[] = [
    { id: "w1", name: "Cash", type: "cash", balance: 1_000_000 },
  ];
  const categories: Category[] = [
    { id: "c1", name: "Food", type: "expense", planningGroup: "variable" },
  ];

  it("historical selected month wins: selected month over budget, real current month healthy — historical action appears", () => {
    const nowMonth = currentMonthKey();
    const budgets: Budget[] = [
      { id: "historical-budget", categoryId: "c1", month: HISTORICAL_MONTH, limitAmount: 100_000 },
      { id: "current-budget", categoryId: "c1", month: nowMonth, limitAmount: 1_000_000 },
    ];
    const transactions: Transaction[] = [
      {
        id: "t-historical",
        type: "expense",
        amount: 200_000, // over the historical budget's 100,000 limit
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${HISTORICAL_MONTH}-05`,
      },
      {
        id: "t-current",
        type: "expense",
        amount: 10_000, // well under the current-month budget's 1,000,000 limit
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${nowMonth}-05`,
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
      monthKey: HISTORICAL_MONTH,
    });

    const budgetAction = actions.find((a) => a.icon === "budget");
    expect(budgetAction).toBeDefined();
    expect(budgetAction?.ctaRoute).toBe(
      buildBudgetsHref({ budgetId: "historical-budget" }),
    );
  });

  it("current real month must not leak into a historical Dashboard view: selected month healthy, real current month over budget — no action", () => {
    const nowMonth = currentMonthKey();
    const budgets: Budget[] = [
      { id: "historical-budget", categoryId: "c1", month: HISTORICAL_MONTH, limitAmount: 1_000_000 },
      { id: "current-budget", categoryId: "c1", month: nowMonth, limitAmount: 100_000 },
    ];
    const transactions: Transaction[] = [
      {
        id: "t-historical",
        type: "expense",
        amount: 10_000, // well under the historical budget's limit
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${HISTORICAL_MONTH}-05`,
      },
      {
        id: "t-current",
        type: "expense",
        amount: 200_000, // over the current-month budget's limit
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${nowMonth}-05`,
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
      monthKey: HISTORICAL_MONTH,
    });

    expect(actions.find((a) => a.icon === "budget")).toBeUndefined();
  });

  it("no budget configured for the selected month must not fall back to the real current month's budget", () => {
    const nowMonth = currentMonthKey();
    const budgets: Budget[] = [
      // Only the real-current-month budget exists — none for HISTORICAL_MONTH.
      { id: "current-budget", categoryId: "c1", month: nowMonth, limitAmount: 100_000 },
    ];
    const transactions: Transaction[] = [
      {
        id: "t-current",
        type: "expense",
        amount: 200_000, // over budget, but for the WRONG (non-selected) month
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${nowMonth}-05`,
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
      monthKey: HISTORICAL_MONTH,
    });

    expect(actions.find((a) => a.icon === "budget")).toBeUndefined();
  });

  it("legitimate zero spending in the selected month yields no false over-budget warning (not confused with missing data)", () => {
    const budgets: Budget[] = [
      { id: "historical-budget", categoryId: "c1", month: HISTORICAL_MONTH, limitAmount: 100_000 },
    ];

    const actions = generateDashboardActions({
      transactions: [], // no spending at all
      wallets,
      budgets,
      goals: [],
      debts: [],
      investments: [],
      categories,
      monthKey: HISTORICAL_MONTH,
    });

    expect(actions.find((a) => a.icon === "budget")).toBeUndefined();
  });

  it("wrong budget entity cannot leak: different budgets in different months, selecting one month must never surface the other month's budgetId", () => {
    const nowMonth = currentMonthKey();
    const budgets: Budget[] = [
      { id: "budget-historical", categoryId: "c1", month: HISTORICAL_MONTH, limitAmount: 100_000 },
      { id: "budget-current", categoryId: "c1", month: nowMonth, limitAmount: 100_000 },
    ];
    const transactions: Transaction[] = [
      {
        id: "t-historical",
        type: "expense",
        amount: 200_000,
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${HISTORICAL_MONTH}-05`,
      },
      {
        id: "t-current",
        type: "expense",
        amount: 200_000,
        categoryId: "c1",
        walletId: "w1",
        note: "",
        date: `${nowMonth}-05`,
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
      monthKey: HISTORICAL_MONTH,
    });

    const budgetAction = actions.find((a) => a.icon === "budget");
    expect(budgetAction?.ctaRoute).toBe(
      buildBudgetsHref({ budgetId: "budget-historical" }),
    );
    expect(budgetAction?.ctaRoute).not.toContain("budget-current");
  });

  it("current-month compatibility: selecting the real current month behaves exactly as before this patch", () => {
    const month = currentMonthKey();
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
      monthKey: month,
    });

    expect(actions.find((a) => a.icon === "budget")).toBeDefined();
  });

  it("unrelated action types (emergency fund, goal, saving-rate, debt) are preserved with a historical monthKey — the patch doesn't suppress unrelated candidates", () => {
    const goals: Goal[] = [
      { id: "slow-goal", name: "Nhà", targetAmount: 1_000_000, currentAmount: 100_000 },
    ];

    const actions = generateDashboardActions({
      transactions: [
        {
          id: "income",
          type: "income",
          amount: 1_000_000,
          categoryId: "c1",
          walletId: "w1",
          note: "",
          date: `${HISTORICAL_MONTH}-01`,
        },
      ],
      wallets,
      budgets: [],
      goals,
      debts: [], // intentionally empty — this test targets the goal/saving-rate branches only
      investments: [],
      categories,
      monthKey: HISTORICAL_MONTH,
    });

    // savingRate branch and slow-goal branch are both snapshot/aggregate —
    // unaffected by monthKey — and must still fire.
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.find((a) => a.icon === "goal")).toBeDefined();
  });
});
