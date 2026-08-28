import { describe, expect, it } from "vitest";
import type {
  Debt,
  ForexAccount,
  ForexCashTransaction,
  Investment,
  SavingAccount,
  Wallet,
} from "@/src/types/finance";
import {
  calculateBalanceSheetSnapshot,
  calculateNetWorth,
} from "./financeCalculations";

const wallets: Wallet[] = [
  { id: "cash", name: "Cash", type: "cash", balance: 1_000_000 },
  {
    id: "legacy-investment-wallet",
    name: "Legacy",
    type: "investment",
    balance: 100_000,
  },
];
const savings: SavingAccount[] = [
  { id: "saving", name: "Saving", type: "savings_account", balance: 500_000 },
];
const investments: Investment[] = [
  {
    id: "stock",
    name: "Stock",
    type: "stock",
    investedAmount: 250_000,
    currentValue: 300_000,
  },
];
const debts: Debt[] = [
  { id: "loan", name: "Loan", totalAmount: 200_000, remainingAmount: 200_000 },
];

function forexAccount(currentEquity?: number | null): ForexAccount {
  return {
    id: "fx",
    name: "FX",
    broker: "Broker",
    currency: "USD",
    status: "active",
    currentEquity,
  };
}

const forexDeposit: ForexCashTransaction = {
  id: "fx-deposit",
  forexAccountId: "fx",
  walletId: "cash",
  type: "deposit",
  amount: 120_000,
  currency: "VND",
  fee: 5_000,
  transactionDate: "2026-08-01",
  transactionTime: "10:00",
};

describe("calculateBalanceSheetSnapshot", () => {
  it("reconciles Wallets + Savings + Investments + Forex - Debts in one current snapshot", () => {
    const snapshot = calculateBalanceSheetSnapshot({
      wallets,
      savings,
      investments,
      debts,
      forexAccounts: [forexAccount(400_000)],
      forexCashTransactions: [forexDeposit],
    });

    expect(snapshot.cashAndWallets).toBe(1_100_000);
    expect(snapshot.savings).toBe(500_000);
    expect(snapshot.investments).toBe(300_000);
    expect(snapshot.forex).toBe(400_000);
    expect(snapshot.totalAssets).toBe(2_300_000);
    expect(snapshot.totalDebt).toBe(200_000);
    expect(snapshot.netWorth).toBe(2_100_000);
    expect(snapshot.debtRatio).toBe(8.7);
  });

  it("uses broker current equity instead of double-counting Forex deposits as extra asset value", () => {
    const snapshot = calculateBalanceSheetSnapshot({
      wallets: [],
      forexAccounts: [forexAccount(400_000)],
      forexCashTransactions: [forexDeposit],
    });

    expect(snapshot.forex).toBe(400_000);
    expect(snapshot.totalAssets).toBe(400_000);
  });

  it("falls back to Forex net capital when current equity is not recorded", () => {
    const snapshot = calculateBalanceSheetSnapshot({
      wallets: [],
      forexAccounts: [forexAccount(undefined)],
      forexCashTransactions: [forexDeposit],
    });

    // deposit 120k - fee 5k
    expect(snapshot.forex).toBe(115_000);
  });

  it("keeps liquid assets narrower than the full balance sheet", () => {
    const snapshot = calculateBalanceSheetSnapshot({
      wallets,
      savings,
      investments,
      debts,
    });

    expect(snapshot.liquidAssets).toBe(1_000_000);
    expect(snapshot.totalAssets).toBe(1_900_000);
  });

  it("matches calculateNetWorth when a canonical Forex value is already precomputed", () => {
    const snapshot = calculateBalanceSheetSnapshot({
      wallets,
      savings,
      investments,
      debts,
      forexAssetValue: 250_000,
    });
    const netWorth = calculateNetWorth({
      wallets,
      savings,
      investments,
      debts,
      forexAssetValue: 250_000,
    });

    expect(snapshot.netWorth).toBe(netWorth.netWorth);
    expect(snapshot.totalAssets).toBe(netWorth.totalAssets);
  });
});
