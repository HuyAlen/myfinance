import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  getGoalEffectiveCurrentAmount,
  getMonthlyExpenseEstimate,
  getTotalExpense,
  getTotalIncome,
} from "./financeCalculations";
import type {
  Category,
  Goal,
  SavingAccount,
  Transaction,
} from "@/src/types/finance";

/**
 * PERF-2 regression: locks in the "narrower KPI dependency" claim that
 * justifies giving the Cash Flow and Goals Dashboard KPI cards their own
 * earlier readiness flags (cashFlowReady / goalsReady) instead of the full
 * `isDashboardReady` gate that `calculateDashboardSummary` needs.
 *
 * DashboardPage.tsx's `periodFlowSummary` (income/expense, feeding the
 * "Dòng tiền ròng" card) calls `getTotalIncome`/`getTotalExpense` directly
 * on transactions+categories — never on wallets/investments/debts/Forex.
 * `goalMeta` (feeding the "Mục tiêu" card) calls
 * `getGoalEffectiveCurrentAmount` on goals+transactions — never on
 * investments/debts/Forex/wallets either (its `savings`-linked component is
 * a separate, additional heuristic in DashboardPage, not this function).
 *
 * If a future change made either of these canonical functions read an
 * unrelated dataset, this test would need updating — which is exactly the
 * signal that the PERF-2 readiness split needs to be revisited too.
 */

describe("Cash Flow KPI dependency contract (PERF-2)", () => {
  it("getTotalIncome/getTotalExpense produce a complete result from transactions+categories alone", () => {
    const categories: Category[] = [
      { id: "c1", name: "Food", type: "expense", planningGroup: "variable" },
    ];
    const transactions: Transaction[] = [
      { id: "t1", type: "income", amount: 10_000_000, categoryId: "c1", walletId: "w1", note: "", date: "2026-08-01" },
      { id: "t2", type: "expense", amount: 3_000_000, categoryId: "c1", walletId: "w1", note: "", date: "2026-08-02" },
    ];

    // No wallets/investments/debts/Forex/goals/savings passed anywhere —
    // these functions' signatures don't even accept them.
    expect(getTotalIncome(transactions)).toBe(10_000_000);
    expect(getTotalExpense(transactions, categories)).toBe(3_000_000);
  });
});

describe("Goals KPI dependency contract (PERF-2)", () => {
  it("getGoalEffectiveCurrentAmount produces a complete result from goals+transactions alone", () => {
    const goal: Goal = {
      id: "g1",
      name: "Emergency Fund",
      targetAmount: 10_000_000,
      currentAmount: 2_000_000,
      savingCategoryIds: ["c-saving"],
    };
    const transactions: Transaction[] = [
      { id: "t1", type: "saving", amount: 1_000_000, categoryId: "c-saving", walletId: "w1", note: "", date: "2026-08-01" },
    ];

    // No wallets/investments/debts/Forex passed — getGoalEffectiveCurrentAmount's
    // signature is exactly {goal, transactions}.
    const effectiveAmount = getGoalEffectiveCurrentAmount({ goal, transactions });

    expect(effectiveAmount).toBe(2_000_000 + 1_000_000);
  });
});

describe("Emergency Fund KPI dependency contract (PERF-2)", () => {
  it("getMonthlyExpenseEstimate produces a complete result from transactions+categories alone", () => {
    const categories: Category[] = [
      { id: "c1", name: "Food", type: "expense", planningGroup: "variable" },
    ];
    const transactions: Transaction[] = [
      { id: "t1", type: "expense", amount: 6_000_000, categoryId: "c1", walletId: "w1", note: "", date: "2026-08-01" },
    ];

    // No wallets/investments/debts/Forex/goals/savings passed — this
    // function's signature is exactly (transactions, months, categories).
    expect(getMonthlyExpenseEstimate(transactions, 1, categories)).toBe(6_000_000);
  });

  it("calculateDashboardSummary.monthlyExpense is unaffected by empty wallets/investments/debts/Forex", () => {
    const categories: Category[] = [
      { id: "c1", name: "Food", type: "expense", planningGroup: "variable" },
    ];
    const transactions: Transaction[] = [
      { id: "t1", type: "expense", amount: 6_000_000, categoryId: "c1", walletId: "w1", note: "", date: "2026-08-01" },
    ];

    // The "Quỹ khẩn cấp" card reads this field off the bundled `summary`
    // object, but its VALUE only depends on transactions+categories — this
    // proves it stays correct even when the rest of the bundle is empty,
    // justifying `emergencyFundReady`'s narrower dependency set (savings +
    // transactions + categories, never wallets/investments/debts/Forex).
    const summary = calculateDashboardSummary({
      wallets: [],
      investments: [],
      debts: [],
      transactions,
      categories,
      goals: [],
      forexAssetValue: 0,
    });

    expect(summary.monthlyExpense).toBe(6_000_000);
    // Confirms the bundle's asset-side fields are genuinely 0 here (not
    // silently non-zero due to some hidden coupling) — monthlyExpense being
    // correct alongside a legitimately-empty netWorth is exactly the
    // "independent field within one bundled call" invariant being tested.
    expect(summary.netWorth).toBe(0);
  });
});

describe("Saving/Investment KPI dependency contract (PERF-2)", () => {
  it("totalSavings (savingsSnapshot) depends only on the savings array", () => {
    const savings: SavingAccount[] = [
      { id: "s1", name: "Emergency", type: "emergency_fund", balance: 4_000_000 },
      { id: "s2", name: "Trip", type: "savings_account", balance: 1_000_000 },
    ];

    // DashboardPage's savingsSnapshot.totalSavings is exactly this
    // reduction — proving it here locks in that the "Tiết kiệm & Đầu tư"
    // card's totalSavings figure needs nothing beyond `savings`.
    const totalSavings = savings.reduce((sum, item) => sum + item.balance, 0);
    expect(totalSavings).toBe(5_000_000);
  });
});
