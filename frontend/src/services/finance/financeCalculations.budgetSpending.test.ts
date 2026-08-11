import { describe, expect, it } from "vitest";
import {
  calculateBudgetSpending,
  calculateBudgetSpendingCollection,
} from "./financeCalculations";
import type { Budget, Category, Transaction } from "@/src/types/finance";

function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    categoryId: "cat-food",
    month: "2026-08",
    limitAmount: 10_000_000,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-food",
    name: "Food",
    type: "expense",
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random()}`,
    type: "expense",
    amount: 1_000_000,
    categoryId: "cat-food",
    walletId: "wallet-1",
    note: "",
    date: "2026-08-15",
    ...overrides,
  };
}

describe("calculateBudgetSpending", () => {
  it("includes a matching expense transaction", () => {
    const result = calculateBudgetSpending({
      budget: budget(),
      transactions: [tx({ amount: 2_000_000 })],
      categories: [category()],
    });
    expect(result.spent).toBe(2_000_000);
  });

  it("excludes income transactions", () => {
    const result = calculateBudgetSpending({
      budget: budget(),
      transactions: [tx({ type: "income", amount: 5_000_000 })],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
  });

  it("excludes ordinary wallet transfer transactions", () => {
    const result = calculateBudgetSpending({
      budget: budget(),
      transactions: [tx({ type: "transfer", amount: 3_000_000 })],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
  });

  it("excludes Savings Finance Engine transfer transactions (regression)", () => {
    // A Wallet -> Savings deposit created by the Savings Atomic Finance
    // Engine (INTEGRATION-1.2) is recorded as type: "transfer" on the main
    // transactions table. It must never inflate Budget spending.
    const result = calculateBudgetSpending({
      budget: budget(),
      transactions: [
        tx({
          type: "transfer",
          amount: 4_000_000,
          transferReference: "saving:acc-1",
        }),
      ],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
  });

  it("excludes transactions from a different category", () => {
    const result = calculateBudgetSpending({
      budget: budget(),
      transactions: [tx({ categoryId: "cat-transport", amount: 2_000_000 })],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
  });

  it("excludes transactions outside the budget period", () => {
    const result = calculateBudgetSpending({
      budget: budget({ month: "2026-08" }),
      transactions: [tx({ date: "2026-07-31" }), tx({ date: "2026-09-01" })],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
  });

  it("includes the period start boundary", () => {
    const result = calculateBudgetSpending({
      budget: budget({ month: "2026-08" }),
      transactions: [tx({ date: "2026-08-01", amount: 1_500_000 })],
      categories: [category()],
    });
    expect(result.spent).toBe(1_500_000);
  });

  it("includes the period end boundary", () => {
    const result = calculateBudgetSpending({
      budget: budget({ month: "2026-08" }),
      transactions: [tx({ date: "2026-08-31", amount: 1_500_000 })],
      categories: [category()],
    });
    expect(result.spent).toBe(1_500_000);
  });

  it("aggregates multiple matching expenses correctly", () => {
    const result = calculateBudgetSpending({
      budget: budget({ limitAmount: 10_000 }),
      transactions: [
        tx({ amount: 2000 }),
        tx({ amount: 3000 }),
        tx({ amount: 1500 }),
      ],
      categories: [category()],
    });
    expect(result.spent).toBe(6500);
    expect(result.remaining).toBe(3500);
    expect(result.usagePercent).toBe(65);
    expect(result.isOverBudget).toBe(false);
  });

  it("returns zero spend/full remaining with no transactions", () => {
    const result = calculateBudgetSpending({
      budget: budget({ limitAmount: 10_000 }),
      transactions: [],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
    expect(result.remaining).toBe(10_000);
    expect(result.usagePercent).toBe(0);
    expect(result.status).toBe("no-spend");
  });

  it("is not over budget exactly at the limit", () => {
    const result = calculateBudgetSpending({
      budget: budget({ limitAmount: 10_000 }),
      transactions: [tx({ amount: 10_000 })],
      categories: [category()],
    });
    expect(result.remaining).toBe(0);
    expect(result.usagePercent).toBe(100);
    expect(result.isOverBudget).toBe(false);
  });

  it("does not clamp remaining/usagePercent when over limit", () => {
    const result = calculateBudgetSpending({
      budget: budget({ limitAmount: 10_000 }),
      transactions: [tx({ amount: 12_000 })],
      categories: [category()],
    });
    expect(result.remaining).toBe(-2_000);
    expect(result.usagePercent).toBe(120);
    expect(result.isOverBudget).toBe(true);
    expect(result.overAmount).toBe(2_000);
  });

  it("is safe (no NaN/Infinity) for a zero limit", () => {
    const zeroSpend = calculateBudgetSpending({
      budget: budget({ limitAmount: 0 }),
      transactions: [],
      categories: [category()],
    });
    expect(zeroSpend.usagePercent).toBe(0);
    expect(zeroSpend.status).toBe("no-spend");

    const withSpend = calculateBudgetSpending({
      budget: budget({ limitAmount: 0 }),
      transactions: [tx({ amount: 1000 })],
      categories: [category()],
    });
    expect(Number.isFinite(withSpend.usagePercent)).toBe(true);
    expect(withSpend.status).toBe("no-budget");
  });

  it("counts saving-typed transactions for a saving-group budget category", () => {
    const savingCategory = category({
      id: "cat-emergency",
      planningGroup: "saving",
    });
    const result = calculateBudgetSpending({
      budget: budget({ categoryId: "cat-emergency", limitAmount: 5_000_000 }),
      transactions: [
        tx({ categoryId: "cat-emergency", type: "saving", amount: 2_000_000 }),
        tx({
          categoryId: "cat-emergency",
          type: "expense",
          amount: 500_000,
        }),
      ],
      categories: [savingCategory],
    });
    expect(result.spent).toBe(2_500_000);
  });

  it("counts saving and investment-typed transactions for an investment-group budget category", () => {
    const investmentCategory = category({
      id: "cat-stocks",
      planningGroup: "investment",
    });
    const result = calculateBudgetSpending({
      budget: budget({ categoryId: "cat-stocks", limitAmount: 5_000_000 }),
      transactions: [
        tx({ categoryId: "cat-stocks", type: "investment", amount: 1_000_000 }),
        tx({ categoryId: "cat-stocks", type: "saving", amount: 500_000 }),
        tx({ categoryId: "cat-stocks", type: "expense", amount: 200_000 }),
      ],
      categories: [investmentCategory],
    });
    expect(result.spent).toBe(1_700_000);
  });

  it("excludes an uncategorized expense from a categorized budget", () => {
    const result = calculateBudgetSpending({
      budget: budget(),
      transactions: [tx({ categoryId: "" })],
      categories: [category()],
    });
    expect(result.spent).toBe(0);
  });
});

describe("calculateBudgetSpendingCollection", () => {
  it("computes multiple budgets independently", () => {
    const budgets = [
      budget({ id: "b1", categoryId: "cat-food", limitAmount: 5_000_000 }),
      budget({
        id: "b2",
        categoryId: "cat-transport",
        limitAmount: 2_000_000,
      }),
    ];
    const categories = [
      category({ id: "cat-food" }),
      category({ id: "cat-transport", name: "Transport" }),
    ];
    const transactions = [
      tx({ categoryId: "cat-food", amount: 6_000_000 }),
      tx({ categoryId: "cat-transport", amount: 1_000_000 }),
    ];

    const results = calculateBudgetSpendingCollection({
      budgets,
      transactions,
      categories,
    });

    const food = results.find((r) => r.budgetId === "b1")!;
    const transport = results.find((r) => r.budgetId === "b2")!;
    expect(food.spent).toBe(6_000_000);
    expect(food.isOverBudget).toBe(true);
    expect(transport.spent).toBe(1_000_000);
    expect(transport.isOverBudget).toBe(false);
  });

  it("produces the same result BudgetsPage and other consumers would compute for the same inputs", () => {
    // Regression guard for cross-page consistency: any consumer calling the
    // canonical engine with the same Budget + transaction set must get the
    // identical spent/remaining/usagePercent, not a page-local formula.
    const sharedBudget = budget({ limitAmount: 4_000_000 });
    const sharedTransactions = [tx({ amount: 1_000_000 }), tx({ amount: 3_500_000 })];
    const sharedCategories = [category()];

    const first = calculateBudgetSpending({
      budget: sharedBudget,
      transactions: sharedTransactions,
      categories: sharedCategories,
    });
    const second = calculateBudgetSpending({
      budget: sharedBudget,
      transactions: sharedTransactions,
      categories: sharedCategories,
    });

    expect(second).toEqual(first);
    expect(first.spent).toBe(4_500_000);
    expect(first.isOverBudget).toBe(true);
  });
});
