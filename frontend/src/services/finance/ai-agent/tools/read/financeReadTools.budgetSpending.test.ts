import { describe, expect, it } from "vitest";
import {
  toDomainBudget,
  toDomainCategory,
  toDomainTransaction,
  toToolStatusLabel,
} from "./financeReadTools.server";
import { calculateBudgetSpending } from "@/src/services/finance/financeCalculations";

/**
 * Regression coverage for INTEGRATION-1.3's pre-commit AI consistency patch:
 * get_budget_status must no longer calculate Budget spending independently.
 * These tests exercise the exact row -> domain -> canonical-engine path the
 * tool uses, without needing a Supabase mock.
 */

describe("financeReadTools row -> domain adapters feeding calculateBudgetSpending", () => {
  it("counts saving-typed transactions for a saving planning-group budget (regression for the divergence this patch fixes)", () => {
    const budget = toDomainBudget({
      id: "b1",
      categoryId: "cat-emergency",
      month: "2026-08",
      limitAmount: 10_000,
    });
    const category = toDomainCategory({
      id: "cat-emergency",
      name: "Emergency Fund",
      type: "expense",
      planning_group: "saving",
    });
    const transactions = [
      toDomainTransaction({
        id: "t1",
        type: "saving",
        amount: 4_000,
        categoryId: "cat-emergency",
        note: null,
        date: "2026-08-10",
      }),
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

  it("counts saving and investment-typed transactions for an investment planning-group budget", () => {
    const budget = toDomainBudget({
      id: "b2",
      categoryId: "cat-stocks",
      month: "2026-08",
      limitAmount: 10_000,
    });
    const category = toDomainCategory({
      id: "cat-stocks",
      name: "Stocks",
      type: "expense",
      planning_group: "investment",
    });
    const transactions = [
      toDomainTransaction({
        id: "t1",
        type: "expense",
        amount: 1_000,
        categoryId: "cat-stocks",
        note: null,
        date: "2026-08-01",
      }),
      toDomainTransaction({
        id: "t2",
        type: "saving",
        amount: 2_000,
        categoryId: "cat-stocks",
        note: null,
        date: "2026-08-02",
      }),
      toDomainTransaction({
        id: "t3",
        type: "investment",
        amount: 3_000,
        categoryId: "cat-stocks",
        note: null,
        date: "2026-08-03",
      }),
    ];

    const result = calculateBudgetSpending({
      budget,
      transactions,
      categories: [category],
    });

    expect(result.spent).toBe(6_000);
  });

  it("excludes a Savings Finance Engine transfer transaction (regression)", () => {
    const budget = toDomainBudget({
      id: "b1",
      categoryId: "cat-emergency",
      month: "2026-08",
      limitAmount: 10_000,
    });
    const category = toDomainCategory({
      id: "cat-emergency",
      name: "Emergency Fund",
      type: "expense",
      planning_group: "saving",
    });
    const transactions = [
      toDomainTransaction({
        id: "t1",
        type: "transfer",
        amount: 5_000,
        categoryId: "cat-emergency",
        note: null,
        date: "2026-08-10",
      }),
    ];

    const result = calculateBudgetSpending({
      budget,
      transactions,
      categories: [category],
    });

    expect(result.spent).toBe(0);
  });

  it("preserves normal expense-category semantics: expense included, income/transfer excluded", () => {
    const budget = toDomainBudget({
      id: "b3",
      categoryId: "cat-food",
      month: "2026-08",
      limitAmount: 10_000,
    });
    const category = toDomainCategory({
      id: "cat-food",
      name: "Food",
      type: "expense",
      planning_group: "variable",
    });
    const transactions = [
      toDomainTransaction({
        id: "t1",
        type: "expense",
        amount: 3_000,
        categoryId: "cat-food",
        note: null,
        date: "2026-08-05",
      }),
      toDomainTransaction({
        id: "t2",
        type: "income",
        amount: 50_000,
        categoryId: "cat-food",
        note: null,
        date: "2026-08-05",
      }),
      toDomainTransaction({
        id: "t3",
        type: "transfer",
        amount: 1_000,
        categoryId: "cat-food",
        note: null,
        date: "2026-08-05",
      }),
    ];

    const result = calculateBudgetSpending({
      budget,
      transactions,
      categories: [category],
    });

    expect(result.spent).toBe(3_000);
  });

  it("falls back to the canonical planning-group inference when planning_group is absent, without a second classification scheme", () => {
    // No planning_group column value returned for this category -> the
    // canonical engine's own getCategoryPlanningGroup fallback applies,
    // exactly as it does for every other consumer. Not re-implemented here.
    const budget = toDomainBudget({
      id: "b4",
      categoryId: "cat-unknown",
      month: "2026-08",
      limitAmount: 10_000,
    });
    const category = toDomainCategory({
      id: "cat-unknown",
      name: "Random Shop",
      type: "expense",
    });
    const transactions = [
      toDomainTransaction({
        id: "t1",
        type: "expense",
        amount: 2_000,
        categoryId: "cat-unknown",
        note: null,
        date: "2026-08-05",
      }),
    ];

    const result = calculateBudgetSpending({
      budget,
      transactions,
      categories: [category],
    });

    expect(result.spent).toBe(2_000);
  });

  it("maps canonical status onto the tool's existing over/near/on_track contract", () => {
    expect(toToolStatusLabel("over")).toBe("over");
    expect(toToolStatusLabel("near")).toBe("near");
    expect(toToolStatusLabel("on-track")).toBe("on_track");
    expect(toToolStatusLabel("no-spend")).toBe("on_track");
    expect(toToolStatusLabel("no-budget")).toBe("on_track");
  });
});
