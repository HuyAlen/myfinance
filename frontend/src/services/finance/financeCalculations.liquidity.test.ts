import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  calculateNetWorth,
  getEmergencyMonths,
  getSpendableWalletBalance,
} from "./financeCalculations";
import type { Debt, Investment, SavingAccount, Wallet } from "@/src/types/finance";
import { computeEmergencyFund } from "./analytics/emergencyFund";
import { computeFinancialForecast } from "./analytics/forecastEngine";
import { computeHealthScoreV2 } from "./analytics/healthScore";
import { computeRiskScore } from "./analytics/riskAnalytics";

/**
 * INTEGRATION-1.5 — canonical liquidity semantics.
 *
 * Product decision: Spendable Wallet Liquidity = cash + bank + ewallet
 * (every WalletType except the legacy "investment" one). See
 * `getSpendableWalletBalance` in financeCalculations.ts for the evidence.
 */

function wallet(type: Wallet["type"], balance: number): Wallet {
  return { id: `w-${type}-${balance}`, name: type, type, balance };
}

function saving(balance: number): SavingAccount {
  return { id: `s-${balance}`, name: "Saving", type: "savings_account", balance };
}

function investment(currentValue: number): Investment {
  return {
    id: `i-${currentValue}`,
    name: "Investment",
    type: "stock",
    investedAmount: currentValue,
    currentValue,
  };
}

function debt(remainingAmount: number): Debt {
  return {
    id: `d-${remainingAmount}`,
    name: "Debt",
    totalAmount: remainingAmount,
    remainingAmount,
  };
}

describe("getSpendableWalletBalance (canonical liquidity)", () => {
  it("includes cash", () => {
    expect(getSpendableWalletBalance([wallet("cash", 1_000)])).toBe(1_000);
  });

  it("includes bank", () => {
    expect(getSpendableWalletBalance([wallet("bank", 2_000)])).toBe(2_000);
  });

  it("includes ewallet (regression: previously excluded by emergencyFund/healthScore)", () => {
    expect(getSpendableWalletBalance([wallet("ewallet", 3_000)])).toBe(3_000);
  });

  it("excludes the legacy 'investment' WalletType", () => {
    const value = getSpendableWalletBalance([
      wallet("cash", 1_000),
      wallet("investment", 5_000_000),
    ]);
    expect(value).toBe(1_000);
  });

  it("sums cash + bank + ewallet together", () => {
    const value = getSpendableWalletBalance([
      wallet("cash", 1_000_000),
      wallet("bank", 2_000_000),
      wallet("ewallet", 3_000_000),
    ]);
    expect(value).toBe(6_000_000);
  });

  it("returns 0 for an empty wallet list", () => {
    expect(getSpendableWalletBalance([])).toBe(0);
  });

  it("returns 0 when every eligible wallet balance is 0", () => {
    const value = getSpendableWalletBalance([
      wallet("cash", 0),
      wallet("bank", 0),
      wallet("ewallet", 0),
    ]);
    expect(value).toBe(0);
    expect(Number.isNaN(value)).toBe(false);
  });

  it("preserves negative balances rather than clamping them", () => {
    const value = getSpendableWalletBalance([wallet("bank", -500)]);
    expect(value).toBe(-500);
  });

  it("does not mutate the input array", () => {
    const wallets = [wallet("cash", 100), wallet("investment", 200)];
    const snapshot = [...wallets];
    getSpendableWalletBalance(wallets);
    expect(wallets).toEqual(snapshot);
  });

  it("is unaffected by debt — raw liquidity is not a net liquid position (debts are a separate concept)", () => {
    const wallets = [wallet("cash", 1_000_000)];
    const withoutDebt = getSpendableWalletBalance(wallets);
    const netWorthWithDebt = calculateNetWorth({
      wallets,
      investments: [],
      debts: [debt(400_000)],
    }).netWorth;

    // getSpendableWalletBalance takes only Wallet[] — there is no code path
    // for a Debt to subtract from it, unlike Net Worth (which does subtract
    // debt to get a *different* metric).
    expect(withoutDebt).toBe(1_000_000);
    expect(netWorthWithDebt).toBe(600_000);
    expect(withoutDebt).not.toBe(netWorthWithDebt);
  });
});

describe("Cross-module liquidity consistency (INTEGRATION-1.5)", () => {
  const wallets = [
    wallet("cash", 1_000_000),
    wallet("bank", 2_000_000),
    wallet("ewallet", 3_000_000),
    wallet("investment", 10_000_000), // must never count as liquidity
  ];
  const expectedLiquidity = getSpendableWalletBalance(wallets);

  it("matches getSpendableWalletBalance directly (6,000,000 — investment wallet excluded)", () => {
    expect(expectedLiquidity).toBe(6_000_000);
  });

  it("calculateDashboardSummary.liquidBalance uses the canonical liquidity value", () => {
    const summary = calculateDashboardSummary({
      wallets,
      investments: [],
      debts: [],
      transactions: [],
      goals: [],
    });

    expect(summary.liquidBalance).toBe(expectedLiquidity);
  });

  it("Emergency Fund's liquidCash matches canonical liquidity", () => {
    const result = computeEmergencyFund(wallets, []);
    expect(result.liquidCash).toBe(expectedLiquidity);
  });

  it("Forecast Engine's currentLiquidBalance matches canonical liquidity", () => {
    const result = computeFinancialForecast(wallets, [], [], []);
    expect(result.currentLiquidBalance).toBe(expectedLiquidity);
  });

  it("Health Score's emergency-fund factor is derived from canonical liquidity (regression: previously excluded ewallet)", () => {
    const monthlyExpense = 1_000_000;
    const health = computeHealthScoreV2(
      wallets,
      [] as Debt[],
      [],
      [],
      // 3 months of income/expense so avgExpense === monthlyExpense exactly
      [
        { id: "t1", type: "expense", amount: monthlyExpense, categoryId: "c1", walletId: "w1", note: "", date: monthKeyNMonthsAgo(0) },
        { id: "t2", type: "expense", amount: monthlyExpense, categoryId: "c1", walletId: "w1", note: "", date: monthKeyNMonthsAgo(1) },
        { id: "t3", type: "expense", amount: monthlyExpense, categoryId: "c1", walletId: "w1", note: "", date: monthKeyNMonthsAgo(2) },
      ],
      [],
      [],
    );

    const expectedEmergencyMonths = getEmergencyMonths(
      expectedLiquidity,
      monthlyExpense,
    );
    const factor = health.factors.find((f) => f.label === "Quỹ khẩn cấp");

    expect(factor?.note).toContain(
      `${Math.round(expectedEmergencyMonths * 10) / 10}`,
    );
  });

  it("Risk Analytics' liquidity dimension note reflects canonical liquidity (regression: previously excluded ewallet)", () => {
    const risk = computeRiskScore(wallets, [] as Debt[], [], []);
    const liquidityDimension = risk.dimensions.find(
      (d) => d.key === "liquidity",
    );
    const formatted = new Intl.NumberFormat("vi-VN").format(expectedLiquidity);

    expect(liquidityDimension?.factors[0]).toContain(formatted);
  });
});

describe("Non-Wallet assets never enter Wallet liquidity", () => {
  it("Savings balance is not added to getSpendableWalletBalance's input type", () => {
    // getSpendableWalletBalance only accepts Wallet[] — Savings/Investment/
    // Forex simply have no path into it, by type signature and by design.
    const wallets = [wallet("cash", 1_000_000)];
    expect(getSpendableWalletBalance(wallets)).toBe(1_000_000);
  });

  it("canonical Net Worth still includes Savings/Investments/Forex even though liquidity excludes them", () => {
    const wallets = [wallet("cash", 1_000_000)];
    const savings = [saving(500_000)];
    const investments = [investment(300_000)];
    const debts: Debt[] = [];

    const netWorth = calculateNetWorth({
      wallets,
      savings,
      investments,
      debts,
      forexAssetValue: 200_000,
    }).netWorth;
    const liquidity = getSpendableWalletBalance(wallets);

    expect(netWorth).toBe(2_000_000);
    expect(liquidity).toBe(1_000_000);
    expect(liquidity).not.toBe(netWorth);
  });
});

describe("Savings transfer invariant: liquidity changes, Net Worth does not", () => {
  it("depositing into Savings reduces Wallet liquidity but leaves Net Worth unchanged", () => {
    const before = {
      wallets: [wallet("cash", 10_000_000)],
      savings: [] as SavingAccount[],
    };
    const beforeLiquidity = getSpendableWalletBalance(before.wallets);
    const beforeNetWorth = calculateNetWorth({
      wallets: before.wallets,
      savings: before.savings,
      investments: [],
      debts: [],
    }).netWorth;

    // 3,000,000 moves from the wallet into a Savings account.
    const after = {
      wallets: [wallet("cash", 7_000_000)],
      savings: [saving(3_000_000)],
    };
    const afterLiquidity = getSpendableWalletBalance(after.wallets);
    const afterNetWorth = calculateNetWorth({
      wallets: after.wallets,
      savings: after.savings,
      investments: [],
      debts: [],
    }).netWorth;

    expect(beforeLiquidity).toBe(10_000_000);
    expect(afterLiquidity).toBe(7_000_000);
    expect(afterLiquidity).toBe(beforeLiquidity - 3_000_000);

    expect(beforeNetWorth).toBe(10_000_000);
    expect(afterNetWorth).toBe(10_000_000);
    expect(afterNetWorth).toBe(beforeNetWorth);
  });

  it("withdrawing from Savings increases Wallet liquidity but leaves Net Worth unchanged", () => {
    const before = {
      wallets: [wallet("cash", 7_000_000)],
      savings: [saving(3_000_000)],
    };
    const beforeLiquidity = getSpendableWalletBalance(before.wallets);
    const beforeNetWorth = calculateNetWorth({
      wallets: before.wallets,
      savings: before.savings,
      investments: [],
      debts: [],
    }).netWorth;

    // 2,000,000 moves back from Savings into the wallet.
    const after = {
      wallets: [wallet("cash", 9_000_000)],
      savings: [saving(1_000_000)],
    };
    const afterLiquidity = getSpendableWalletBalance(after.wallets);
    const afterNetWorth = calculateNetWorth({
      wallets: after.wallets,
      savings: after.savings,
      investments: [],
      debts: [],
    }).netWorth;

    expect(afterLiquidity).toBe(beforeLiquidity + 2_000_000);
    expect(afterNetWorth).toBe(beforeNetWorth);
    expect(afterNetWorth).toBe(10_000_000);
  });
});

function monthKeyNMonthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
}
