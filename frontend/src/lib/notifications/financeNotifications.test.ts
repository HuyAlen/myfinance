import { describe, expect, it } from "vitest";
import {
  buildFinanceNotifications,
  getCurrentLocalMonthKey,
} from "./financeNotifications";
import type {
  Budget,
  Category,
  Debt,
  Goal,
  SavingAccount,
  Transaction,
} from "@/src/types/finance";

/**
 * NOTIF-CORRECTNESS-1 — Notification Logic Audit & Hardening.
 *
 * Genuine behavioral tests (this module is pure and framework-free — no
 * React/Supabase — so, unlike Header.tsx itself, it can be imported and
 * exercised directly, not merely source-inspected).
 *
 * These tests lock in the ACTUAL, cross-referenced product contract this
 * audit established (not the illustrative 80% example some earlier specs
 * used): "near" is >= 85% of the limit and "over" requires spending to
 * STRICTLY exceed the limit (spent > limit, so exactly 100% is "near", not
 * "over") — the exact same threshold `deriveBudgetSpendingStatus` in
 * financeCalculations.ts already applies, and the same one
 * dashboardBudgetAttention.ts and BudgetsPage.tsx's own inline
 * classification independently use. Header previously reimplemented this
 * with a DIFFERENT (80%/>=100, rounded-percentage-based) contract that
 * could disagree with what Budgets/Dashboard show for the identical data —
 * these tests would fail if that drift reappeared.
 */

// Budget-focused tests use bare expense fixtures with no offsetting income,
// which legitimately also fires the (unrelated, correctly-firing) negative-
// cash-flow notification. This helper isolates budget notifications so
// those tests assert on exactly what they're about, without needing every
// fixture to also balance out income vs expense.
function budgetNotificationsOf(
  result: ReturnType<typeof buildFinanceNotifications>,
) {
  return result.filter(
    (n) => n.id.startsWith("bover-") || n.id.startsWith("bnear-"),
  );
}

function makeCategory(over: Partial<Category> = {}): Category {
  return {
    id: "cat-food",
    name: "Ăn uống",
    type: "expense",
    planningGroup: "variable",
    ...over,
  };
}

function makeBudget(over: Partial<Budget> = {}): Budget {
  return {
    id: "budget-1",
    categoryId: "cat-food",
    month: "2026-08",
    limitAmount: 1_000_000,
    ...over,
  };
}

function makeExpense(over: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    type: "expense",
    amount: 100_000,
    categoryId: "cat-food",
    walletId: "wallet-1",
    note: "",
    date: "2026-08-15",
    ...over,
  };
}

describe("budget threshold contract (near = >=85% of limit, over = spent > limit strictly)", () => {
  it("79.99% of limit: healthy, no notification", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [makeExpense({ amount: 799_900 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(result)).toHaveLength(0);
  });

  it("exactly 85% (the near-limit boundary): near, not healthy", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [makeExpense({ amount: 850_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Gần vượt ngân sách");
  });

  it("99.99% of limit: still near, not over", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [makeExpense({ amount: 999_900 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Gần vượt ngân sách");
  });

  it("exactly 100% (spent === limit): near, NOT over — 'at limit' is not yet 'exceeded'", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [makeExpense({ amount: 1_000_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Gần vượt ngân sách");
    expect(budgetNotifs[0].title).not.toContain("Vượt ngân sách");
  });

  it("100.01% of limit: over budget", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [makeExpense({ amount: 1_000_100 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Vượt ngân sách");
  });

  it("127% of limit: over budget with the correct percentage in the message", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 2_000_000 })],
      transactions: [makeExpense({ amount: 2_540_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Vượt ngân sách");
    expect(budgetNotifs[0].body).toBe("Đã chi 127% ngân sách tháng này.");
  });

  it("ROUNDING-BOUNDARY REGRESSION: 99.7% raw (spent < limit) rounds to a displayed 100%, but must still classify as near, not over", () => {
    // spent=997,000 / limit=1,000,000 = 99.7% raw — genuinely under the
    // limit — but Math.round(99.7) = 100. Classifying from the rounded
    // percentage (Header's old bug) would incorrectly fire "Vượt ngân
    // sách" here; classifying from the raw spent>limit comparison (the
    // fix) correctly keeps this "near".
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [makeExpense({ amount: 997_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Gần vượt ngân sách");
    expect(budgetNotifs[0].body).toBe("Đã dùng 100% giới hạn tháng này.");
  });

  it("invalid (zero) budget limit produces no notification at all — never a bogus Infinity%/NaN% or contradictory 'over, 0%' alert", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 0 })],
      transactions: [makeExpense({ amount: 500_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(result)).toHaveLength(0);
  });
});

describe("budget-spending transaction classification (income/transfer/saving exclusion)", () => {
  it("expense counts toward budget spending", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ amount: 2_000_000 })], // 200% -> over
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].title).toContain("Vượt ngân sách");
  });

  it("income is excluded from budget spending", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [
        makeExpense({ id: "tx-income", type: "income", amount: 5_000_000 }),
      ],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });

  it("an internal wallet transfer is excluded from budget spending (transfer !== expense)", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [
        makeExpense({
          id: "tx-transfer",
          type: "transfer",
          amount: 5_000_000,
          transferToWalletId: "wallet-2",
        }),
      ],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });

  it("a saving-type transaction is excluded from an ordinary (non-saving-planning-group) budget", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [
        makeExpense({ id: "tx-saving", type: "saving", amount: 3_000_000 }),
      ],
      categories: [makeCategory({ planningGroup: "variable" })],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });

  it("a saving-type transaction DOES count toward a saving-planning-group budget", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ categoryId: "cat-saving", limitAmount: 1_000_000 })],
      transactions: [
        makeExpense({
          id: "tx-saving",
          type: "saving",
          categoryId: "cat-saving",
          amount: 1_500_000,
        }),
      ],
      categories: [
        makeCategory({ id: "cat-saving", name: "Tiết kiệm", planningGroup: "saving" }),
      ],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Vượt ngân sách");
  });

  it("a transaction outside the budget's month is excluded", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ date: "2026-07-31", amount: 2_000_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });

  it("a transaction on the first day of the budget month is included", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ date: "2026-08-01", amount: 900_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(result)).toHaveLength(1);
  });

  it("a transaction on the last day of the budget month is included", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ date: "2026-08-31", amount: 900_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(result)).toHaveLength(1);
  });

  it("CASE C (manual walkthrough): expense 1.5M + transfer 5M against a 2M budget -> 75%, NOT 325%", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 2_000_000 })],
      transactions: [
        makeExpense({ id: "tx-expense", amount: 1_500_000 }),
        makeExpense({
          id: "tx-transfer",
          type: "transfer",
          amount: 5_000_000,
          transferToWalletId: "wallet-2",
        }),
      ],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    // 75% is below the 85% near-limit boundary — no notification, and
    // critically the transfer must never have been added into `spent`.
    expect(budgetNotificationsOf(result)).toHaveLength(0);
  });
});

describe("multiple/overlapping budgets — identity and no duplicate counting", () => {
  it("healthy + near + over budgets in the same month produce exactly the 2 non-healthy notifications, correctly attributed", () => {
    const result = buildFinanceNotifications({
      budgets: [
        makeBudget({ id: "budget-healthy", categoryId: "cat-a", limitAmount: 1_000_000 }),
        makeBudget({ id: "budget-near", categoryId: "cat-b", limitAmount: 1_000_000 }),
        makeBudget({ id: "budget-over", categoryId: "cat-c", limitAmount: 1_000_000 }),
      ],
      transactions: [
        makeExpense({ id: "tx-a", categoryId: "cat-a", amount: 200_000 }), // 20% healthy
        makeExpense({ id: "tx-b", categoryId: "cat-b", amount: 900_000 }), // 90% near
        makeExpense({ id: "tx-c", categoryId: "cat-c", amount: 1_500_000 }), // 150% over
      ],
      categories: [
        makeCategory({ id: "cat-a", name: "A" }),
        makeCategory({ id: "cat-b", name: "B" }),
        makeCategory({ id: "cat-c", name: "C" }),
      ],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });

    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(2);
    const byId = new Map(budgetNotifs.map((n) => [n.id, n]));
    expect(byId.get("bnear-budget-near")?.title).toContain("Gần vượt ngân sách · B");
    expect(byId.get("bover-budget-over")?.title).toContain("Vượt ngân sách · C");
    expect(byId.has("bover-budget-healthy")).toBe(false);
    expect(byId.has("bnear-budget-healthy")).toBe(false);
  });

  it("two different budgets on the same category (overlapping budgets) each independently alert from the same transactions — this is legitimate, not duplication", () => {
    const sharedTransactions = [makeExpense({ amount: 1_500_000 })];
    const sharedCategories = [makeCategory()];

    const result = buildFinanceNotifications({
      budgets: [
        makeBudget({ id: "budget-x", categoryId: "cat-food", limitAmount: 1_000_000 }), // 150% -> over
        makeBudget({ id: "budget-y", categoryId: "cat-food", limitAmount: 2_000_000 }), // 75% -> healthy
      ],
      transactions: sharedTransactions,
      categories: sharedCategories,
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });

    // Two distinct budget entities, two distinct outcomes for the SAME
    // transaction set — not a duplicate of one condition.
    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(1);
    expect(budgetNotifs[0].id).toBe("bover-budget-x");
  });

  it("notification identity is entityId-based, not text-based — two same-named budgets never collide", () => {
    const result = buildFinanceNotifications({
      budgets: [
        makeBudget({ id: "budget-1", categoryId: "cat-a", limitAmount: 1_000_000 }),
        makeBudget({ id: "budget-2", categoryId: "cat-b", limitAmount: 1_000_000 }),
      ],
      transactions: [
        makeExpense({ id: "tx-a", categoryId: "cat-a", amount: 1_500_000 }),
        makeExpense({ id: "tx-b", categoryId: "cat-b", amount: 1_500_000 }),
      ],
      categories: [
        makeCategory({ id: "cat-a", name: "Ăn uống" }),
        makeCategory({ id: "cat-b", name: "Ăn uống" }), // identical display name
      ],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });

    const budgetNotifs = budgetNotificationsOf(result);
    expect(budgetNotifs).toHaveLength(2);
    expect(budgetNotifs.map((n) => n.id).sort()).toEqual([
      "bover-budget-1",
      "bover-budget-2",
    ]);
  });

  it("the same budget can never emit both a near and an over notification simultaneously", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ amount: 1_500_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(result)).toHaveLength(1);
  });
});

describe("period tests", () => {
  it("a budget for a different (historical) month is not evaluated against the current month's transactions", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget({ month: "2026-03" })], // historical, not currentMonth
      transactions: [makeExpense({ date: "2026-08-15", amount: 2_000_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(result)).toHaveLength(0);
  });

  it("a month with zero spending against an existing budget produces no notification", () => {
    const result = buildFinanceNotifications({
      budgets: [makeBudget()],
      transactions: [],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });

  it("getCurrentLocalMonthKey uses LOCAL date components, not a UTC conversion — a late-evening local time that is already the next UTC day still resolves to the correct LOCAL month", () => {
    // 23:30 on Jan 31 in a timezone 5 hours behind UTC is 04:30 UTC on Feb 1.
    // A UTC-based `toISOString().slice(0,7)` would incorrectly report
    // "2026-02"; the local-component-based implementation must report
    // "2026-01" for a Date constructed from local Jan-31 components.
    const localJan31Evening = new Date(2026, 0, 31, 23, 30, 0); // month is 0-indexed
    expect(getCurrentLocalMonthKey(localJan31Evening)).toBe("2026-01");
  });

  it("getCurrentLocalMonthKey defaults to the real wall clock when no date is passed", () => {
    expect(getCurrentLocalMonthKey()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("goal notifications use the canonical Goal funding snapshot", () => {
  const goal: Goal = {
    id: "goal-1",
    name: "Mua xe",
    targetAmount: 1_000_000,
    currentAmount: 400_000,
    savingCategoryIds: ["cat-goal-saving"],
  };

  it("raw currentAmount alone (60%) would be 'near', but linked saving contributions push it to done — done must win", () => {
    const linkedSavingTx: Transaction = {
      id: "tx-linked",
      type: "saving",
      amount: 700_000,
      categoryId: "cat-goal-saving",
      walletId: "wallet-1",
      note: "",
      date: "2026-08-10",
    };
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [linkedSavingTx],
      categories: [],
      goals: [goal],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Mục tiêu hoàn thành");
  });

  it("with no linked contributions, raw 40% correctly produces no notification (below the 75% near-goal threshold)", () => {
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [],
      categories: [],
      goals: [goal],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });

  it("uses an explicitly linked Saving balance for the same near-goal threshold as Goals/Dashboard/Reports", () => {
    const savingLinkedGoal: Goal = {
      ...goal,
      savingCategoryIds: [],
      linkedSavingIds: ["saving-car"],
    };
    const savings: SavingAccount[] = [
      { id: "saving-car", name: "Mua xe", type: "savings_account", balance: 400_000 },
    ];

    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [],
      categories: [],
      goals: [savingLinkedGoal],
      savings,
      debts: [],
      currentMonth: "2026-08",
    });

    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Sắp đạt mục tiêu");
  });

  it("keeps an explicit zero-balance Saving link authoritative instead of falling through to a same-name heuristic Saving", () => {
    const savingLinkedGoal: Goal = {
      ...goal,
      savingCategoryIds: [],
      linkedSavingIds: ["saving-zero"],
    };
    const savings: SavingAccount[] = [
      { id: "saving-zero", name: "Sổ đã chọn", type: "savings_account", balance: 0 },
      { id: "saving-other", name: "Mua xe", type: "savings_account", balance: 500_000 },
    ];

    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [],
      categories: [],
      goals: [savingLinkedGoal],
      savings,
      debts: [],
      currentMonth: "2026-08",
    });

    expect(result).toHaveLength(0);
  });
});

describe("debt notifications (unchanged — Debt has no separate canonical calculation to drift from)", () => {
  it("a debt with less than 15% repaid and a positive remaining balance alerts", () => {
    const debt: Debt = {
      id: "debt-1",
      name: "Vay mua nhà",
      totalAmount: 1_000_000,
      remainingAmount: 900_000, // 10% repaid
    };
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [],
      categories: [],
      goals: [],
      debts: [debt],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Nợ chưa thanh toán");
  });

  it("a fully repaid debt (remainingAmount 0) does not alert even if paidPct would technically be < 15%", () => {
    const debt: Debt = {
      id: "debt-1",
      name: "Vay mua nhà",
      totalAmount: 1_000_000,
      remainingAmount: 0,
    };
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [],
      categories: [],
      goals: [],
      debts: [debt],
      currentMonth: "2026-08",
    });
    expect(result).toHaveLength(0);
  });
});

describe("negative-cash-flow notification excludes saving/investment-tagged expense, matching getTotalExpense", () => {
  it("an expense tagged to a saving-planning-group category does not count as 'real' expense — must not falsely trigger negative cash flow", () => {
    const savingCategory = makeCategory({
      id: "cat-saving-alloc",
      name: "Tiết kiệm",
      planningGroup: "saving",
    });
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [
        makeExpense({ id: "tx-income", type: "income", amount: 1_000_000 }),
        // A large "expense" that is really a saving allocation — must be
        // excluded from the cash-flow calculation, same as
        // getTotalExpense/isRealExpenseTransaction does everywhere else.
        makeExpense({
          id: "tx-saving-expense",
          categoryId: "cat-saving-alloc",
          amount: 2_000_000,
        }),
      ],
      categories: [savingCategory],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result.find((n) => n.id === "cashflow")).toBeUndefined();
  });

  it("genuine expense exceeding income still triggers the negative-cash-flow notification", () => {
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [
        makeExpense({ id: "tx-income", type: "income", amount: 1_000_000 }),
        makeExpense({ id: "tx-expense", amount: 1_500_000 }),
      ],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result.find((n) => n.id === "cashflow")).toBeDefined();
  });

  it("no transactions this month: no cash-flow notification (not even a false positive from an empty comparison)", () => {
    const result = buildFinanceNotifications({
      budgets: [],
      transactions: [],
      categories: [],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(result.find((n) => n.id === "cashflow")).toBeUndefined();
  });
});

describe("edit/delete effect (recomputation, not stale derived state)", () => {
  it("editing an over-budget expense down to a healthy amount removes the alert on the next computation — no stale derived notification", () => {
    const overBudget = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ amount: 2_000_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(overBudget)).toHaveLength(1);

    // Same budget/category, transaction amount "edited" down to 200,000 —
    // this function is pure, so re-invoking it with the new transaction
    // set is exactly what a real recompute-on-edit looks like.
    const afterEdit = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [makeExpense({ amount: 200_000 })],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(budgetNotificationsOf(afterEdit)).toHaveLength(0);
  });

  it("deleting the over-budget expense entirely (transaction list empty) also resolves the alert", () => {
    const afterDelete = buildFinanceNotifications({
      budgets: [makeBudget({ limitAmount: 1_000_000 })],
      transactions: [],
      categories: [makeCategory()],
      goals: [],
      debts: [],
      currentMonth: "2026-08",
    });
    expect(afterDelete).toHaveLength(0);
  });
});
