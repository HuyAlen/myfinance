import { describe, expect, it } from "vitest";
import { toDomainWallet } from "./financeReadTools.server";
import {
  getEmergencyMonths,
  getSpendableWalletBalance,
  getTotalAssets,
} from "@/src/services/finance/financeCalculations";

/**
 * INTEGRATION-1.5 regression coverage: `get_financial_summary`'s
 * `liquidAssets` (cash + bank + ewallet) must differ from `walletAssets`
 * (every wallet, including the legacy "investment" WalletType) whenever an
 * investment-typed wallet row exists — and `get_financial_health`'s
 * emergencyMonths must be derived from `liquidAssets`, not `walletAssets`.
 */

describe("financeReadTools liquidity vs total wallet assets", () => {
  it("liquidAssets (cash+bank+ewallet) differs from walletAssets when an investment-typed wallet row exists", () => {
    const walletRows = [
      { id: "w1", name: "Cash", type: "cash", balance: 1_000_000 },
      { id: "w2", name: "Bank", type: "bank", balance: 2_000_000 },
      { id: "w3", name: "eWallet", type: "ewallet", balance: 3_000_000 },
      { id: "w4", name: "Legacy Investment Wallet", type: "investment", balance: 50_000_000 },
    ];
    const wallets = walletRows.map(toDomainWallet);

    const walletAssets = getTotalAssets(wallets);
    const liquidAssets = getSpendableWalletBalance(wallets);

    expect(walletAssets).toBe(56_000_000);
    expect(liquidAssets).toBe(6_000_000);
    expect(liquidAssets).not.toBe(walletAssets);
  });

  it("emergencyMonths computed from liquidAssets is materially lower than from walletAssets when a large investment wallet is present (regression)", () => {
    const walletRows = [
      { id: "w1", name: "Cash", type: "cash", balance: 1_000_000 },
      { id: "w2", name: "Legacy Investment Wallet", type: "investment", balance: 50_000_000 },
    ];
    const wallets = walletRows.map(toDomainWallet);
    const monthlyExpense = 1_000_000;

    const correctEmergencyMonths = getEmergencyMonths(
      getSpendableWalletBalance(wallets),
      monthlyExpense,
    );
    const previouslyBuggyEmergencyMonths = getEmergencyMonths(
      getTotalAssets(wallets),
      monthlyExpense,
    );

    expect(correctEmergencyMonths).toBe(1);
    expect(previouslyBuggyEmergencyMonths).toBe(51);
    expect(correctEmergencyMonths).toBeLessThan(previouslyBuggyEmergencyMonths);
  });
});
