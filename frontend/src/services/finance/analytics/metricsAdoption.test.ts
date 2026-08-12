import { describe, expect, it } from "vitest";
import type {
  Category,
  Debt,
  Goal,
  Investment,
  SavingAccount,
  Transaction,
  Wallet,
} from "@/src/types/finance";
import { calculateNetWorth } from "@/src/services/finance/financeCalculations";
import { computeFireAnalysis } from "./fireCalculator";
import { computeFinancialForecast } from "./forecastEngine";
import { computeRiskScore } from "./riskAnalytics";
import { computeHealthScoreV2 } from "./healthScore";
import { predictGoalAchievement } from "./goalAnalytics";

/**
 * INTEGRATION-1.4 regression coverage: FIRE / Forecast / Risk / Health must
 * report the same CURRENT net worth as the canonical `calculateNetWorth` for
 * identical wallet/saving/investment/debt/forex data — no module may
 * silently drop savings or Forex, or double-count Forex P&L.
 */

function wallet(balance: number): Wallet {
  return { id: `w-${balance}`, name: "Wallet", type: "cash", balance };
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

const WALLETS = [wallet(1_000_000)];
const SAVINGS = [saving(500_000)];
const INVESTMENTS = [investment(300_000)];
const DEBTS = [debt(200_000)];
const FOREX_ASSET_VALUE = 150_000;
const TRANSACTIONS: Transaction[] = [];
const CATEGORIES: Category[] = [];

const EXPECTED_NET_WORTH = calculateNetWorth({
  wallets: WALLETS,
  savings: SAVINGS,
  investments: INVESTMENTS,
  debts: DEBTS,
  forexAssetValue: FOREX_ASSET_VALUE,
}).netWorth;

describe("FIRE Calculator net worth adoption", () => {
  it("computeFireAnalysis.netWorth matches canonical calculateNetWorth when savings/Forex are supplied", () => {
    const fire = computeFireAnalysis(
      WALLETS,
      DEBTS,
      INVESTMENTS,
      TRANSACTIONS,
      6,
      0.07,
      0.04,
      CATEGORIES,
      SAVINGS,
      FOREX_ASSET_VALUE,
    );

    expect(fire.netWorth).toBe(EXPECTED_NET_WORTH);
  });

  it("without savings/Forex args, matches calculateNetWorth for wallets+investments+debts only (backward compatible default)", () => {
    const fire = computeFireAnalysis(WALLETS, DEBTS, INVESTMENTS, TRANSACTIONS);
    const expected = calculateNetWorth({
      wallets: WALLETS,
      investments: INVESTMENTS,
      debts: DEBTS,
    }).netWorth;

    expect(fire.netWorth).toBe(expected);
  });
});

describe("Forecast Engine base-state net worth adoption", () => {
  it("computeFinancialForecast.currentNetWorth matches canonical calculateNetWorth when savings/Forex are supplied", () => {
    const forecast = computeFinancialForecast(
      WALLETS,
      DEBTS,
      INVESTMENTS,
      TRANSACTIONS,
      6,
      CATEGORIES,
      SAVINGS,
      FOREX_ASSET_VALUE,
    );

    expect(forecast.currentNetWorth).toBe(EXPECTED_NET_WORTH);
  });

  it("does not conflate currentLiquidBalance (cash/bank/ewallet only) with total net worth", () => {
    const forecast = computeFinancialForecast(
      WALLETS,
      DEBTS,
      INVESTMENTS,
      TRANSACTIONS,
      6,
      CATEGORIES,
      SAVINGS,
      FOREX_ASSET_VALUE,
    );

    expect(forecast.currentLiquidBalance).toBe(1_000_000);
    expect(forecast.currentLiquidBalance).not.toBe(forecast.currentNetWorth);
  });
});

describe("Risk Analytics net worth / debt ratio adoption", () => {
  it("uses the same totalAssets/totalDebt as canonical calculateNetWorth (debt dimension note reflects the canonical ratio)", () => {
    const risk = computeRiskScore(
      WALLETS,
      DEBTS,
      [] as Goal[],
      TRANSACTIONS,
      INVESTMENTS,
      3,
      CATEGORIES,
      SAVINGS,
      FOREX_ASSET_VALUE,
    );

    const expectedBreakdown = calculateNetWorth({
      wallets: WALLETS,
      investments: INVESTMENTS,
      debts: DEBTS,
      savings: SAVINGS,
      forexAssetValue: FOREX_ASSET_VALUE,
    });
    const expectedRatioPercent = Math.round(
      (expectedBreakdown.totalDebt / expectedBreakdown.totalAssets) * 100,
    );

    expect(risk.dimensions[0].factors[0]).toContain(`${expectedRatioPercent}%`);
  });
});

describe("Health Score V2 net worth / Forex adoption", () => {
  it("uses getForexAssetValue (currentEquity) instead of a broken net-cash-flow reconstruction, and never double-counts P&L", () => {
    const forexAccounts = [{ id: "acc-1", currentEquity: 400_000 }];
    const forexCashTransactions = [
      {
        id: "fx-1",
        forexAccountId: "acc-1",
        walletId: "w-1",
        type: "deposit" as const,
        amount: 300_000,
        currency: "VND" as const,
        transactionDate: "2026-01-01",
        transactionTime: "00:00",
      },
    ];

    const health = computeHealthScoreV2(
      WALLETS,
      DEBTS,
      [] as Goal[],
      INVESTMENTS,
      TRANSACTIONS,
      [],
      CATEGORIES,
      3,
      forexCashTransactions,
      SAVINGS,
      forexAccounts,
    );

    const expectedTotalAssets = calculateNetWorth({
      wallets: WALLETS,
      investments: INVESTMENTS,
      debts: DEBTS,
      savings: SAVINGS,
      forexAssetValue: 400_000, // the account's currentEquity, not net capital (300k) and not equity+P&L
    }).totalAssets;
    const debtRatioFactor = health.factors.find((f) => f.label === "Tỷ lệ nợ");

    expect(debtRatioFactor?.note).toContain(
      `${Math.round((DEBTS[0].remainingAmount / expectedTotalAssets) * 100)}%`,
    );
  });
});

describe("Goal Analytics effective progress adoption", () => {
  it("predictGoalAchievement.progressPercent matches canonical getGoalEffectiveProgress (includes goal-linked saving transactions)", () => {
    const goal: Goal = {
      id: "g1",
      name: "Emergency Fund",
      targetAmount: 100_000,
      currentAmount: 20_000,
      savingCategoryIds: ["cat-saving"],
    };
    const transactions: Transaction[] = [
      {
        id: "t1",
        type: "saving",
        amount: 30_000,
        categoryId: "cat-saving",
        walletId: "w1",
        note: "",
        date: "2026-08-01",
      },
    ];

    const [prediction] = predictGoalAchievement([goal], transactions);

    // Effective current amount = 20,000 base + 30,000 linked saving = 50,000
    // -> 50% progress, not the naive 20% from goal.currentAmount alone.
    expect(prediction.progressPercent).toBe(50);
    expect(prediction.currentAmount).toBe(50_000);
  });
});
