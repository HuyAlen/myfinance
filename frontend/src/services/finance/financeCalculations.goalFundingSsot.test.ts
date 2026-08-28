import { describe, expect, it } from "vitest";
import type { Goal, SavingAccount, Transaction } from "@/src/types/finance";
import {
  calculateDashboardSummary,
  calculateGoalFundingSnapshot,
  resolveGoalFundingLinks,
} from "@/src/services/finance/financeCalculations";

const tx = (
  id: string,
  categoryId: string,
  amount: number,
  type: Transaction["type"] = "expense",
): Transaction => ({
  id,
  categoryId,
  walletId: "wallet-1",
  amount,
  type,
  note: "",
  date: "2026-08-01",
});

const saving = (
  id: string,
  name: string,
  balance: number,
  type: SavingAccount["type"] = "savings_account",
): SavingAccount => ({ id, name, balance, type });

const baseGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "goal-1",
  name: "Quỹ khẩn cấp",
  targetAmount: 10_000_000,
  currentAmount: 1_000_000,
  ...overrides,
});

describe("GOAL-SAVINGS-SSOT-1 canonical Goal funding", () => {
  it("keeps an explicit Saving link authoritative even when its balance is zero", () => {
    const goal = baseGoal({ linkedSavingIds: ["saving-zero"] });
    const savings = [
      saving("saving-zero", "Sổ đã chọn", 0),
      saving("saving-heuristic", "Quỹ khẩn cấp", 9_000_000, "emergency_fund"),
    ];

    const result = calculateGoalFundingSnapshot({ goal, savings, transactions: [] });

    expect(result.source).toBe("linked-saving");
    expect(result.linkedSavingAmount).toBe(0);
    expect(result.heuristicSavingAmount).toBe(0);
    expect(result.effectiveCurrentAmount).toBe(1_000_000);
    expect(result.progressPercent).toBe(10);
  });

  it("migrates an old unprefixed Saving ID in savingCategoryIds by matching the live Savings snapshot", () => {
    const goal = baseGoal({ savingCategoryIds: ["saving-old"] });
    const savings = [saving("saving-old", "Quỹ khẩn cấp", 4_000_000)];

    const links = resolveGoalFundingLinks({ goal, savings });
    const result = calculateGoalFundingSnapshot({ goal, savings, transactions: [] });

    expect(links.linkedSavingIds).toEqual(["saving-old"]);
    expect(links.legacyCategoryIds).toEqual([]);
    expect(result.source).toBe("linked-saving");
    expect(result.effectiveCurrentAmount).toBe(5_000_000);
  });

  it("understands namespaced persisted Saving links without requiring storage-layer decoding", () => {
    const goal = baseGoal({ savingCategoryIds: ["saving:s1"] });
    const savings = [saving("s1", "Emergency", 3_000_000)];

    const result = calculateGoalFundingSnapshot({ goal, savings, transactions: [] });

    expect(result.linkedSavingIds).toEqual(["s1"]);
    expect(result.source).toBe("linked-saving");
    expect(result.effectiveCurrentAmount).toBe(4_000_000);
  });

  it("keeps a legacy category rule authoritative over the old name heuristic", () => {
    const goal = baseGoal({ savingCategoryIds: ["cat-saving"] });
    const savings = [saving("s1", "Quỹ khẩn cấp", 8_000_000, "emergency_fund")];
    const transactions = [tx("t1", "cat-saving", 2_000_000)];

    const result = calculateGoalFundingSnapshot({ goal, savings, transactions });

    expect(result.source).toBe("legacy-category");
    expect(result.legacyCategoryAmount).toBe(2_000_000);
    expect(result.heuristicSavingAmount).toBe(0);
    expect(result.effectiveCurrentAmount).toBe(3_000_000);
  });

  it("uses the historical name heuristic only when no explicit or legacy links exist", () => {
    const goal = baseGoal();
    const savings = [saving("s1", "Quỹ khẩn cấp", 6_000_000, "emergency_fund")];

    const result = calculateGoalFundingSnapshot({ goal, savings, transactions: [] });

    expect(result.source).toBe("heuristic-saving");
    expect(result.autoFundedAmount).toBe(6_000_000);
    expect(result.effectiveCurrentAmount).toBe(7_000_000);
    expect(result.progressPercent).toBe(70);
  });

  it("keeps unknown/deleted legacy IDs as category links so migration never drops history", () => {
    const goal = baseGoal({ savingCategoryIds: ["deleted-or-category-id"] });

    expect(resolveGoalFundingLinks({ goal, savings: [] })).toEqual({
      linkedSavingIds: [],
      legacyCategoryIds: ["deleted-or-category-id"],
    });
  });

  it("keeps Dashboard goal score cumulative when the visible transaction period excludes older Goal funding", () => {
    const goal = baseGoal({
      currentAmount: 0,
      savingCategoryIds: ["cat-saving"],
    });
    const historicalFunding = [tx("t-old", "cat-saving", 8_000_000, "saving")];

    const summary = calculateDashboardSummary({
      wallets: [],
      savings: [],
      investments: [],
      debts: [],
      transactions: [],
      goalFundingTransactions: historicalFunding,
      categories: [],
      goals: [goal],
    });

    expect(summary.goalScore).toBe(80);
  });
});
