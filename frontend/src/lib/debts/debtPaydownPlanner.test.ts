import { describe, expect, it } from "vitest";
import {
  buildDebtPaydownPlan,
  formatDebtPayoffDuration,
  getDebtPaydownImpact,
  sortDebtPaydownPriority,
} from "./debtPaydownPlanner";

const debts = [
  {
    id: "card",
    name: "Thẻ tín dụng",
    remainingAmount: 12_000_000,
    interestRate: 24,
    minimumPayment: 1_000_000,
  },
  {
    id: "bike",
    name: "Vay xe",
    remainingAmount: 6_000_000,
    interestRate: 8,
    minimumPayment: 800_000,
  },
  {
    id: "family",
    name: "Vay gia đình",
    remainingAmount: 3_000_000,
    minimumPayment: 500_000,
  },
];

describe("DEBT-PAYDOWN-PLANNER-1", () => {
  it("orders Snowball by smallest balance and Avalanche by highest known APR", () => {
    expect(sortDebtPaydownPriority(debts, "snowball").map((debt) => debt.id)).toEqual([
      "family",
      "bike",
      "card",
    ]);
    expect(sortDebtPaydownPriority(debts, "avalanche").map((debt) => debt.id)).toEqual([
      "card",
      "bike",
      "family",
    ]);
  });

  it("uses configured minimum payments plus the explicit extra payment as one monthly budget", () => {
    const plan = buildDebtPaydownPlan({
      debts,
      strategy: "avalanche",
      extraMonthlyPayment: 700_000,
    });
    expect(plan.baseMinimumPayment).toBe(2_300_000);
    expect(plan.extraMonthlyPayment).toBe(700_000);
    expect(plan.monthlyPayment).toBe(3_000_000);
    expect(plan.firstTargetId).toBe("card");
  });

  it("rolls the fixed monthly budget forward and reaches payoff without creating ledger data", () => {
    const plan = buildDebtPaydownPlan({
      debts: [
        { id: "a", name: "A", remainingAmount: 2_000_000, interestRate: 0, minimumPayment: 1_000_000 },
        { id: "b", name: "B", remainingAmount: 4_000_000, interestRate: 0, minimumPayment: 1_000_000 },
      ],
      strategy: "snowball",
      extraMonthlyPayment: 0,
    });
    expect(plan.status).toBe("ready");
    expect(plan.payoffMonths).toBe(3);
    expect(plan.totalInterest).toBe(0);
    expect(plan.totalPaid).toBe(6_000_000);
  });

  it("shows that an extra monthly payment can shorten payoff time and reduce modeled interest", () => {
    const baseline = buildDebtPaydownPlan({ debts, strategy: "avalanche" });
    const accelerated = buildDebtPaydownPlan({
      debts,
      strategy: "avalanche",
      extraMonthlyPayment: 1_000_000,
    });
    const impact = getDebtPaydownImpact(baseline, accelerated);
    expect(baseline.status).toBe("ready");
    expect(accelerated.status).toBe("ready");
    expect(impact.monthsSaved).not.toBeNull();
    expect(impact.monthsSaved!).toBeGreaterThan(0);
    expect(impact.interestSaved).not.toBeNull();
    expect(impact.interestSaved!).toBeGreaterThanOrEqual(0);
  });

  it("does not hide missing APR or minimum-payment assumptions", () => {
    const plan = buildDebtPaydownPlan({ debts, strategy: "avalanche" });
    expect(plan.missingInterestRateCount).toBe(1);
    expect(plan.missingMinimumPaymentCount).toBe(0);
  });

  it("fails closed when there is debt but no modeled monthly payment", () => {
    const plan = buildDebtPaydownPlan({
      debts: [{ id: "a", name: "A", remainingAmount: 5_000_000 }],
      strategy: "snowball",
    });
    expect(plan.status).toBe("unfunded");
    expect(plan.payoffMonths).toBeNull();
    expect(plan.totalInterest).toBeNull();
  });

  it("returns an already-paid result for an empty outstanding balance", () => {
    const plan = buildDebtPaydownPlan({
      debts: [{ id: "a", name: "A", remainingAmount: 0, interestRate: 12, minimumPayment: 1_000_000 }],
      strategy: "avalanche",
    });
    expect(plan.status).toBe("paid");
    expect(plan.payoffMonths).toBe(0);
    expect(plan.monthlyPayment).toBe(0);
  });

  it("formats payoff durations for Vietnamese UI", () => {
    expect(formatDebtPayoffDuration(null)).toBe("Chưa ước tính được");
    expect(formatDebtPayoffDuration(0)).toBe("Đã tất toán");
    expect(formatDebtPayoffDuration(8)).toBe("8 tháng");
    expect(formatDebtPayoffDuration(24)).toBe("2 năm");
    expect(formatDebtPayoffDuration(29)).toBe("2 năm 5 tháng");
  });
});
