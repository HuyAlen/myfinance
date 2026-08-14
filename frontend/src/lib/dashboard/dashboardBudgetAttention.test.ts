import { describe, expect, it } from "vitest";
import { calculateBudgetSpendingCollection } from "@/src/services/finance/financeCalculations";
import type { Budget, Category, Transaction } from "@/src/types/finance";
import { buildDashboardBudgetAttention } from "./dashboardBudgetAttention";

function makeBudget(overrides: Partial<Budget>): Budget {
  return {
    id: "b1",
    categoryId: "c1",
    month: "2026-08",
    limitAmount: 1_000_000,
    ...overrides,
  } as Budget;
}

function makeCategory(overrides: Partial<Category>): Category {
  return {
    id: "c1",
    name: "Ăn uống",
    type: "expense",
    planningGroup: "variable",
    ...overrides,
  } as Category;
}

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "t1",
    type: "expense",
    amount: 0,
    categoryId: "c1",
    walletId: "w1",
    note: "",
    date: "2026-08-01",
    ...overrides,
  } as Transaction;
}

describe("buildDashboardBudgetAttention", () => {
  it("1. no budgets: everything zero, no worst offender", () => {
    const result = buildDashboardBudgetAttention({
      budgets: [],
      categories: [],
      transactions: [],
    });
    expect(result).toEqual({
      totalBudgets: 0,
      overBudgetCount: 0,
      warningCount: 0,
      healthyCount: 0,
      overBudgetItems: [],
      topWarning: null,
      worstOffender: null,
    });
  });

  it("2. all budgets healthy (well under the 85% near-threshold): everything counted as healthy, no worst offender", () => {
    const budgets = [
      makeBudget({ id: "b1", categoryId: "c1", limitAmount: 1_000_000 }),
      makeBudget({ id: "b2", categoryId: "c2", limitAmount: 2_000_000 }),
    ];
    const categories = [
      makeCategory({ id: "c1" }),
      makeCategory({ id: "c2", name: "Di lại" }),
    ];
    const transactions = [
      makeTransaction({ categoryId: "c1", amount: 100_000 }),
      makeTransaction({ categoryId: "c2", amount: 200_000 }),
    ];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.totalBudgets).toBe(2);
    expect(result.overBudgetCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.healthyCount).toBe(2);
    expect(result.worstOffender).toBeNull();
  });

  it("3. one over-budget: counted and identified as the worst offender", () => {
    const budgets = [makeBudget({ id: "b1", categoryId: "c1", limitAmount: 1_000_000 })];
    const categories = [makeCategory({ id: "c1", name: "Ăn uống" })];
    const transactions = [makeTransaction({ categoryId: "c1", amount: 1_200_000 })];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.overBudgetCount).toBe(1);
    expect(result.worstOffender).toMatchObject({
      budgetId: "b1",
      categoryName: "Ăn uống",
      spent: 1_200_000,
      limit: 1_000_000,
      overAmount: 200_000,
    });
    // §31-32: the count invariant — overBudgetCount always equals the
    // number of items actually exposed for rendering.
    expect(result.overBudgetItems).toHaveLength(1);
    expect(result.overBudgetItems[0]).toMatchObject({
      budgetId: "b1",
      categoryName: "Ăn uống",
    });
  });

  it("4. multiple over-budget: deterministic worst offender — controllable (variable) categories rank above non-controllable ones EVEN with a smaller absolute overAmount, matching generateDashboardActions' existing ranking", () => {
    // Food: fixed (non-controllable) planning group, larger overAmount (500k).
    // Entertainment: variable (controllable) planning group, smaller overAmount (400k).
    const budgets = [
      makeBudget({ id: "food", categoryId: "food-cat", limitAmount: 10_000_000 }),
      makeBudget({ id: "fun", categoryId: "fun-cat", limitAmount: 1_000_000 }),
    ];
    const categories = [
      makeCategory({ id: "food-cat", name: "Ăn uống", planningGroup: "fixed" }),
      makeCategory({ id: "fun-cat", name: "Giải trí", planningGroup: "variable" }),
    ];
    const transactions = [
      makeTransaction({ categoryId: "food-cat", amount: 10_500_000 }), // over by 500k, 105%
      makeTransaction({ categoryId: "fun-cat", amount: 1_400_000 }), // over by 400k, 140%
    ];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.overBudgetCount).toBe(2);
    expect(result.worstOffender?.budgetId).toBe("fun");
    expect(result.worstOffender?.categoryName).toBe("Giải trí");
    // §33: the ranking that used to only decide the single worst offender
    // must now be applied to the WHOLE list — controllable-first still
    // wins even though it has the smaller absolute overAmount.
    expect(result.overBudgetItems).toHaveLength(2);
    expect(result.overBudgetItems.map((item) => item.budgetId)).toEqual([
      "fun",
      "food",
    ]);
    expect(result.overBudgetCount).toBe(result.overBudgetItems.length);
  });

  it("4b. among equally (non-)controllable over-budget items, the larger absolute overAmount wins", () => {
    const budgets = [
      makeBudget({ id: "a", categoryId: "cat-a", limitAmount: 1_000_000 }),
      makeBudget({ id: "b", categoryId: "cat-b", limitAmount: 1_000_000 }),
    ];
    const categories = [
      makeCategory({ id: "cat-a", name: "A", planningGroup: "variable" }),
      makeCategory({ id: "cat-b", name: "B", planningGroup: "variable" }),
    ];
    const transactions = [
      makeTransaction({ categoryId: "cat-a", amount: 1_100_000 }), // over by 100k
      makeTransaction({ categoryId: "cat-b", amount: 1_300_000 }), // over by 300k
    ];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.worstOffender?.budgetId).toBe("b");
    expect(result.overBudgetItems.map((item) => item.budgetId)).toEqual([
      "b",
      "a",
    ]);
  });

  it("4c. five over-budget items: every item is exposed, none dropped, count matches the list length", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const budgets = ids.map((id) =>
      makeBudget({ id, categoryId: `cat-${id}`, limitAmount: 1_000_000 }),
    );
    const categories = ids.map((id) =>
      makeCategory({ id: `cat-${id}`, name: id.toUpperCase(), planningGroup: "variable" }),
    );
    const transactions = ids.map((id, index) =>
      makeTransaction({
        categoryId: `cat-${id}`,
        amount: 1_000_000 + (index + 1) * 100_000,
      }),
    );

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.overBudgetCount).toBe(5);
    expect(result.overBudgetItems).toHaveLength(5);
    // Largest overAmount (500k, id "e") ranks first among equally
    // controllable items.
    expect(result.overBudgetItems[0].budgetId).toBe("e");
    expect(result.overBudgetItems.at(-1)?.budgetId).toBe("a");
    // §36: no arbitrary slice/cap — all 5 must survive, not just top-N.
    expect(new Set(result.overBudgetItems.map((item) => item.budgetId))).toEqual(
      new Set(ids),
    );
  });

  it("5. warning-only state (canonical near-threshold, >=85% of limit): counted as warning, not over, and surfaced as the worst offender (priority tier 2) since nothing is actually over", () => {
    const budgets = [
      makeBudget({ id: "b1", categoryId: "c1", limitAmount: 1_000_000 }),
      makeBudget({ id: "b2", categoryId: "c2", limitAmount: 1_000_000 }),
    ];
    const categories = [
      makeCategory({ id: "c1", name: "Ăn uống" }),
      makeCategory({ id: "c2", name: "Di lại" }),
    ];
    const transactions = [
      makeTransaction({ categoryId: "c1", amount: 900_000 }), // 90% >= 85%
      makeTransaction({ categoryId: "c2", amount: 850_000 }), // 85%, exactly at threshold
    ];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.overBudgetCount).toBe(0);
    expect(result.warningCount).toBe(2);
    expect(result.healthyCount).toBe(0);
    // The higher usagePercent (90% > 85%) wins the tier-2 selection.
    expect(result.worstOffender?.status).toBe("near");
    expect(result.worstOffender?.categoryName).toBe("Ăn uống");
    expect(result.worstOffender?.usagePercent).toBe(90);
    // §34: near-only state is unchanged by this patch — no over-budget
    // items exist, and the single highest-usagePercent near item is
    // exposed via topWarning (mirrored by worstOffender for compatibility).
    expect(result.overBudgetItems).toEqual([]);
    expect(result.topWarning?.categoryName).toBe("Ăn uống");
    expect(result.topWarning?.usagePercent).toBe(90);
  });

  it("5b. mixed state — one over-budget AND one near-limit: only the over-budget item is exposed via overBudgetItems, near data stays available via topWarning but is not mixed into the over-budget list", () => {
    const budgets = [
      makeBudget({ id: "over", categoryId: "c1", limitAmount: 1_000_000 }),
      makeBudget({ id: "near", categoryId: "c2", limitAmount: 1_000_000 }),
    ];
    const categories = [
      makeCategory({ id: "c1", name: "Ăn uống" }),
      makeCategory({ id: "c2", name: "Di lại" }),
    ];
    const transactions = [
      makeTransaction({ categoryId: "c1", amount: 1_200_000 }), // over
      makeTransaction({ categoryId: "c2", amount: 900_000 }), // near (90%)
    ];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.overBudgetCount).toBe(1);
    expect(result.overBudgetItems).toHaveLength(1);
    expect(result.overBudgetItems[0].budgetId).toBe("over");
    // The near item is never smuggled into overBudgetItems.
    expect(result.overBudgetItems.some((item) => item.budgetId === "near")).toBe(
      false,
    );
    // topWarning still reflects the near item independent of over-budget
    // state — it is the DashboardPage render branch's job (not this
    // helper's) to decide not to display it alongside over-budget rows.
    expect(result.topWarning?.budgetId).toBe("near");
    // Backward-compatible worstOffender still prioritizes the over item.
    expect(result.worstOffender?.budgetId).toBe("over");
  });

  it("6. legitimate zero spending against a configured budget is a real, healthy zero — not a fake/missing value", () => {
    const budgets = [makeBudget({ id: "b1", categoryId: "c1", limitAmount: 1_000_000 })];
    const categories = [makeCategory({ id: "c1" })];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions: [], // no spending at all
    });

    expect(result.totalBudgets).toBe(1);
    expect(result.overBudgetCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.healthyCount).toBe(1);
  });

  it("7. the helper reflects exactly the collection it is given — period scoping is the caller's responsibility, not recomputed here", () => {
    const augustBudget = makeBudget({ id: "aug", categoryId: "c1", month: "2026-08" });
    const septemberBudget = makeBudget({ id: "sep", categoryId: "c1", month: "2026-09" });
    const categories = [makeCategory({ id: "c1" })];

    // Caller passes only the August budget — September must not leak in.
    const result = buildDashboardBudgetAttention({
      budgets: [augustBudget],
      categories,
      transactions: [],
    });

    expect(result.totalBudgets).toBe(1);
    expect(septemberBudget).toBeDefined(); // exists, but deliberately excluded by the caller
  });

  it("8. an unresolvable category falls back to the existing 'Khác' convention, not a raw ID", () => {
    const budgets = [makeBudget({ id: "b1", categoryId: "missing-category" })];
    const transactions = [
      makeTransaction({ categoryId: "missing-category", amount: 2_000_000 }),
    ];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories: [], // category not found
      transactions,
    });

    expect(result.worstOffender?.categoryName).toBe("Khác");
    expect(result.overBudgetItems[0]?.categoryName).toBe("Khác");
  });

  it("canonical-source enforcement: a 'saving' planning-group budget counts type=saving transactions as spend (matching calculateBudgetSpendingCollection's own matching rules) — this fails if a naive expense-only reduce replaces the canonical engine", () => {
    const budgets = [makeBudget({ id: "b1", categoryId: "c1", limitAmount: 1_000_000 })];
    const categories = [
      makeCategory({ id: "c1", name: "Tiết kiệm mục tiêu", planningGroup: "saving" }),
    ];
    const transactions = [
      makeTransaction({ categoryId: "c1", type: "saving", amount: 1_200_000 }),
    ];

    const direct = calculateBudgetSpendingCollection({
      budgets,
      categories,
      transactions,
    });
    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    // The canonical engine counts this saving-typed transaction as spend for
    // a saving-planning-group budget — a naive `type === "expense"` reduce
    // would see zero spend and miss the over-budget entirely.
    expect(direct[0].spent).toBe(1_200_000);
    expect(result.overBudgetCount).toBe(1);
    expect(result.worstOffender?.overAmount).toBe(200_000);
    expect(result.overBudgetItems[0]?.overAmount).toBe(200_000);
  });

  it("§2/§6 unchanged: all-healthy state has no over items and no top warning", () => {
    const budgets = [
      makeBudget({ id: "b1", categoryId: "c1", limitAmount: 1_000_000 }),
    ];
    const categories = [makeCategory({ id: "c1" })];
    const transactions = [makeTransaction({ categoryId: "c1", amount: 100_000 })];

    const result = buildDashboardBudgetAttention({
      budgets,
      categories,
      transactions,
    });

    expect(result.overBudgetItems).toEqual([]);
    expect(result.topWarning).toBeNull();
    expect(result.worstOffender).toBeNull();
  });

  it("§35 unchanged: no-budget state has empty overBudgetItems and null topWarning/worstOffender", () => {
    const result = buildDashboardBudgetAttention({
      budgets: [],
      categories: [],
      transactions: [],
    });

    expect(result.overBudgetItems).toEqual([]);
    expect(result.topWarning).toBeNull();
    expect(result.worstOffender).toBeNull();
  });
});
