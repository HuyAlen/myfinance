import { describe, expect, it } from "vitest";
import type { Category, Transaction } from "@/src/types/finance";
import {
  calculateEmergencyCoverageSnapshot,
  calculateStableEmergencyExpenseBaseline,
} from "./emergencyCoverage";

const categories: Category[] = [
  { id: "living", name: "Sinh hoạt", type: "expense", planningGroup: "fixed" },
  { id: "saving", name: "Tiết kiệm", type: "expense", planningGroup: "saving" },
  { id: "invest", name: "Đầu tư", type: "expense", planningGroup: "investment" },
];

function tx(
  id: string,
  amount: number,
  date: string,
  categoryId = "living",
  type: Transaction["type"] = "expense",
): Transaction {
  return {
    id,
    type,
    amount,
    categoryId,
    walletId: "wallet-1",
    note: id,
    date,
  };
}

describe("DASH-EMERGENCY-FUND-BASELINE-1", () => {
  it("never lets a partial current month create the 85.4-month false-positive", () => {
    const snapshot = calculateEmergencyCoverageSnapshot({
      emergencyFundBalance: 13_069_990,
      asOfMonth: "2026-09",
      transactions: [
        tx("sep-partial", 153_000, "2026-09-01"),
        tx("aug", 12_000_000, "2026-08-15"),
        tx("jul", 10_000_000, "2026-07-15"),
        tx("jun", 8_000_000, "2026-06-15"),
      ],
      categories,
    });

    expect(snapshot.monthlyExpense).toBe(10_000_000);
    expect(snapshot.completedMonthCount).toBe(3);
    expect(snapshot.monthKeys).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(snapshot.coverageMonths).toBeCloseTo(1.306999, 5);
    expect(snapshot.coverageMonths).toBeLessThan(3);
    expect(snapshot.coverageMonths).not.toBeCloseTo(85.4, 1);
    expect(snapshot.minimumTargetAmount).toBe(30_000_000);
    expect(snapshot.minimumGap).toBe(16_930_010);
  });

  it("uses canonical real expenses and excludes transfers plus saving/investment allocations", () => {
    const baseline = calculateStableEmergencyExpenseBaseline({
      asOfMonth: "2026-09",
      categories,
      transactions: [
        tx("real", 5_000_000, "2026-08-10"),
        tx("saving", 50_000_000, "2026-08-11", "saving"),
        tx("invest", 60_000_000, "2026-08-12", "invest"),
        tx("transfer", 70_000_000, "2026-08-13", "living", "transfer"),
      ],
    });

    expect(baseline.monthlyExpense).toBe(5_000_000);
    expect(baseline.monthKeys).toEqual(["2026-08"]);
  });

  it("keeps completed-month evidence across a January year boundary", () => {
    const snapshot = calculateEmergencyCoverageSnapshot({
      emergencyFundBalance: 12_000_000,
      asOfMonth: "2027-01",
      transactions: [
        tx("jan-partial", 100_000, "2027-01-01"),
        tx("dec", 8_000_000, "2026-12-10"),
        tx("nov", 12_000_000, "2026-11-10"),
      ],
      categories,
    });

    expect(snapshot.monthKeys).toEqual(["2026-12", "2026-11"]);
    expect(snapshot.monthlyExpense).toBe(10_000_000);
    expect(snapshot.coverageMonths).toBeCloseTo(1.2, 5);
  });

  it("takes only the six most recent completed observed months", () => {
    const transactions = [
      ["2026-08", 8],
      ["2026-07", 7],
      ["2026-06", 6],
      ["2026-05", 5],
      ["2026-04", 4],
      ["2026-03", 3],
      ["2026-02", 200],
    ].map(([month, amount], index) =>
      tx(`m${index}`, Number(amount) * 1_000_000, `${month}-10`),
    );

    const baseline = calculateStableEmergencyExpenseBaseline({
      transactions,
      categories,
      asOfMonth: "2026-09",
      lookbackMonths: 6,
    });

    expect(baseline.monthKeys).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
    ]);
    expect(baseline.monthlyExpense).toBe(5_500_000);
  });

  it("fails closed when no completed month exists instead of declaring the fund sufficient", () => {
    const snapshot = calculateEmergencyCoverageSnapshot({
      emergencyFundBalance: 13_069_990,
      transactions: [tx("sep-only", 153_000, "2026-09-01")],
      categories,
      asOfMonth: "2026-09",
    });

    expect(snapshot.isReliable).toBe(false);
    expect(snapshot.monthlyExpense).toBe(0);
    expect(snapshot.coverageMonths).toBeNull();
    expect(snapshot.minimumGap).toBe(0);
  });
});
