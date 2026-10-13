import { describe, expect, it } from "vitest";
import { buildFinanceNotifications } from "./financeNotifications";
import type { Budget, Category, Transaction } from "@/src/types/finance";

// The P0 bell must observe all active finance IDs for read-state continuity,
// even though the canonical engine's default consumer cap remains eight.
describe("notification settings SSOT - finance cap and full active set", () => {
  it("preserves 8-item default while allowing Header to track alerts beyond the cap", () => {
    const categories: Category[] = Array.from({length: 12}, (_, index) => ({
      id: `cat-${index}`, name: `Category ${index}`, type: "expense" as const,
      planningGroup: "variable" as const,
    }));
    const budgets: Budget[] = categories.map((item, index) => ({
      id: `budget-${index}`,
      categoryId: item.id,
      month: "2026-10",
      limitAmount: 1000,
    }));
    const transactions: Transaction[] = categories.map((item, index) => ({
      id: `transaction-${index}`,
      categoryId: item.id,
      type: "expense" as const,
      amount: 1000,
      walletId: "wallet-1",
      note: "",
      date: "2026-10-13",
    }));
    const input = {budgets, transactions, categories, goals: [], debts: [], currentMonth: "2026-10"};
    const capped = buildFinanceNotifications(input);
    const complete = buildFinanceNotifications({...input,maxNotifications: Number.MAX_SAFE_INTEGER});
    expect(capped).toHaveLength(8);
    const budgetAlerts = complete.filter(item => item.id.startsWith("batlimit-"));
    expect(budgetAlerts).toHaveLength(12);
    expect(complete.length).toBeGreaterThan(8);
    expect(complete.map(item => item.id).slice(0,8)).toEqual(capped.map(item => item.id));
  });
});
