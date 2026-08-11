import { describe, expect, it } from "vitest";
import {
  toDomainBudget,
  toDomainCategory,
  toDomainTransaction,
} from "./aiFinanceContext.server";
import { calculateBudgetSpending } from "@/src/services/finance/financeCalculations";

/**
 * Regression coverage for INTEGRATION-1.3's pre-commit AI consistency patch:
 * the AI chat context's Budget summary must share the exact canonical
 * spent/remaining/usagePercent the AI get_budget_status tool and BudgetsPage
 * compute for the same inputs, not a separate expenseByCategory formula.
 */

function categoryRow(planningGroup: "saving" | "investment" | "variable") {
  return {
    id: "cat-1",
    user_id: "u1",
    name: "Test Category",
    type: "expense" as const,
    planning_group: planningGroup,
  };
}

function transactionRow(overrides: {
  id: string;
  type: "income" | "expense" | "transfer" | "saving" | "investment";
  amount: number;
  date: string;
}) {
  return {
    id: overrides.id,
    user_id: "u1",
    type: overrides.type,
    amount: overrides.amount,
    categoryId: "cat-1",
    walletId: "w1",
    note: "",
    date: overrides.date,
    transferToWalletId: null,
    isRecurring: null,
    recurrence: null,
    nextRunDate: null,
  };
}

function budgetRow(limitAmount: number) {
  return {
    id: "b1",
    user_id: "u1",
    categoryId: "cat-1",
    month: "2026-08",
    limitAmount,
    rolloverAmount: null,
    warningThreshold: null,
    criticalThreshold: null,
  };
}

describe("aiFinanceContext row -> domain adapters agree with the canonical engine", () => {
  it("computes the same spent/remaining/usagePercent as calculateBudgetSpending for a saving planning-group budget", () => {
    const budget = toDomainBudget(budgetRow(10_000));
    const category = toDomainCategory(categoryRow("saving"));
    const transactions = [
      toDomainTransaction(
        transactionRow({
          id: "t1",
          type: "saving",
          amount: 4_000,
          date: "2026-08-10",
        }),
      ),
    ];

    const result = calculateBudgetSpending({
      budget,
      transactions,
      categories: [category],
    });

    expect(result.spent).toBe(4_000);
    expect(result.remaining).toBe(6_000);
    expect(result.usagePercent).toBe(40);
  });

  it("excludes a Savings Finance Engine transfer transaction (regression)", () => {
    const budget = toDomainBudget(budgetRow(10_000));
    const category = toDomainCategory(categoryRow("saving"));
    const transactions = [
      toDomainTransaction(
        transactionRow({
          id: "t1",
          type: "transfer",
          amount: 5_000,
          date: "2026-08-10",
        }),
      ),
    ];

    const result = calculateBudgetSpending({
      budget,
      transactions,
      categories: [category],
    });

    expect(result.spent).toBe(0);
  });

  it("matches BudgetsPage-equivalent output for the identical budget/transaction/category input (cross-consumer consistency)", () => {
    const budget = toDomainBudget(budgetRow(4_000_000));
    const category = toDomainCategory(categoryRow("variable"));
    const rawTransactions = [
      transactionRow({
        id: "t1",
        type: "expense",
        amount: 1_000_000,
        date: "2026-08-15",
      }),
      transactionRow({
        id: "t2",
        type: "expense",
        amount: 3_500_000,
        date: "2026-08-16",
      }),
    ];

    const aiContextResult = calculateBudgetSpending({
      budget,
      transactions: rawTransactions.map(toDomainTransaction),
      categories: [category],
    });

    // A page consuming the same domain shapes directly (e.g. BudgetsPage)
    // would build an identical Budget/Transaction/Category set and get the
    // exact same result from the same canonical function.
    const directResult = calculateBudgetSpending({
      budget: { id: "b1", categoryId: "cat-1", month: "2026-08", limitAmount: 4_000_000 },
      transactions: rawTransactions.map((row) => ({
        id: row.id,
        type: row.type,
        amount: row.amount,
        categoryId: row.categoryId,
        walletId: row.walletId,
        note: row.note,
        date: row.date,
      })),
      categories: [
        { id: "cat-1", name: "Test Category", type: "expense", planningGroup: "variable" },
      ],
    });

    expect(aiContextResult).toEqual(directResult);
    expect(aiContextResult.spent).toBe(4_500_000);
    expect(aiContextResult.isOverBudget).toBe(true);
  });
});
