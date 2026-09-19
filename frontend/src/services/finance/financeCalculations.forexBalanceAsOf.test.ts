import { describe, expect, it } from "vitest";
import type {
  ForexAccount,
  ForexBalanceSnapshot,
  ForexCashTransaction,
} from "@/src/types/finance";
import {
  calculateForexPerformanceAsOf,
  getForexBalanceAsOf,
} from "./financeCalculations";

function account(
  id: string,
  options: Partial<ForexAccount> = {},
): ForexAccount {
  return {
    id,
    name: id,
    broker: "Exness",
    currency: "VND",
    status: "active",
    openedAt: "2026-07-01",
    currentEquity: 9_999_999,
    ...options,
  };
}

function cash(
  id: string,
  forexAccountId: string,
  type: "deposit" | "withdrawal",
  amount: number,
  transactionDate: string,
  fee = 0,
): ForexCashTransaction {
  return {
    id,
    forexAccountId,
    walletId: "wallet",
    type,
    amount,
    currency: "VND",
    fee,
    transactionDate,
    transactionTime: "12:00",
  };
}

function balance(
  id: string,
  forexAccountId: string,
  amount: number,
  capturedAt: string,
): ForexBalanceSnapshot {
  return {
    id,
    forexAccountId,
    balance: amount,
    source: "manual",
    capturedAt,
  };
}

describe("FOREX-BALANCE-ASOF-1", () => {
  it("selects the latest observed Balance at or before the exact cutoff", () => {
    const snapshots = [
      balance("s1", "fx", 800_000, "2026-08-10T03:00:00.000Z"),
      balance("s2", "fx", 900_000, "2026-08-20T03:00:00.000Z"),
      balance("s3", "fx", 1_100_000, "2026-09-01T03:00:00.000Z"),
    ];

    expect(
      getForexBalanceAsOf(
        snapshots,
        "fx",
        "2026-08-31T16:59:59.999Z",
      )?.id,
    ).toBe("s2");
  });

  it("uses historical Balance rather than today's currentEquity and cuts cash funding by economic date", () => {
    const result = calculateForexPerformanceAsOf({
      forexAccounts: [account("fx", { currentEquity: 5_000_000 })],
      forexCashTransactions: [
        cash("d1", "fx", "deposit", 1_000_000, "2026-08-01", 100_000),
        cash("w1", "fx", "withdrawal", 200_000, "2026-08-10", 20_000),
        cash("future", "fx", "deposit", 500_000, "2026-09-01", 5_000),
      ],
      balanceSnapshots: [
        balance("aug", "fx", 900_000, "2026-08-20T03:00:00.000Z"),
        balance("sep", "fx", 5_000_000, "2026-09-02T03:00:00.000Z"),
      ],
      asOfDate: "2026-08-31",
      cutoffAt: "2026-08-31T16:59:59.999Z",
    });

    expect(result.totalDeposited).toBe(1_000_000);
    expect(result.totalWithdrawn).toBe(200_000);
    expect(result.totalFees).toBe(120_000);
    expect(result.netFunding).toBe(800_000);
    expect(result.totalBalance).toBe(900_000);
    expect(result.assetValue).toBe(900_000);
    expect(result.profitLoss).toBe(100_000);
    expect(result.roi).toBe(12.5);
    expect(result.accounts[0]?.balanceSnapshotId).toBe("aug");
  });

  it("keeps transfer fees outside historical Trading Profit", () => {
    const result = calculateForexPerformanceAsOf({
      forexAccounts: [account("fx")],
      forexCashTransactions: [
        cash("d1", "fx", "deposit", 1_000_000, "2026-08-01", 250_000),
      ],
      balanceSnapshots: [
        balance("aug", "fx", 1_100_000, "2026-08-31T10:00:00.000Z"),
      ],
      asOfDate: "2026-08-31",
      cutoffAt: "2026-08-31T16:59:59.999Z",
    });

    expect(result.netFunding).toBe(1_000_000);
    expect(result.totalFees).toBe(250_000);
    expect(result.walletCashImpact).toBe(1_250_000);
    expect(result.profitLoss).toBe(100_000);
  });

  it("fails closed when historical Balance is missing instead of falling back to deposits minus withdrawals", () => {
    const result = calculateForexPerformanceAsOf({
      forexAccounts: [account("fx", { currentEquity: 7_000_000 })],
      forexCashTransactions: [
        cash("d1", "fx", "deposit", 1_000_000, "2026-08-01"),
      ],
      balanceSnapshots: [
        balance("future", "fx", 7_000_000, "2026-09-10T03:00:00.000Z"),
      ],
      asOfDate: "2026-08-31",
      cutoffAt: "2026-08-31T16:59:59.999Z",
    });

    expect(result.netFunding).toBe(1_000_000);
    expect(result.knownBalanceTotal).toBe(0);
    expect(result.totalBalance).toBeNull();
    expect(result.assetValue).toBeNull();
    expect(result.profitLoss).toBeNull();
    expect(result.accountsMissingBalance).toBe(1);
    expect(result.hasCompleteBalance).toBe(false);
  });

  it("keeps a currently archived account in historical as-of results when evidence exists before the cutoff", () => {
    const result = calculateForexPerformanceAsOf({
      forexAccounts: [account("closed", { status: "archived" })],
      forexCashTransactions: [
        cash("d1", "closed", "deposit", 500_000, "2026-07-01"),
      ],
      balanceSnapshots: [
        balance("july", "closed", 550_000, "2026-07-31T10:00:00.000Z"),
      ],
      asOfDate: "2026-07-31",
      cutoffAt: "2026-07-31T16:59:59.999Z",
    });

    expect(result.accountCount).toBe(1);
    expect(result.totalBalance).toBe(550_000);
    expect(result.profitLoss).toBe(50_000);
    expect(result.accounts[0]?.status).toBe("archived");
  });

  it("does not publish a partial aggregate when one participating account lacks historical Balance", () => {
    const result = calculateForexPerformanceAsOf({
      forexAccounts: [account("known"), account("missing")],
      forexCashTransactions: [
        cash("d1", "known", "deposit", 100_000, "2026-08-01"),
        cash("d2", "missing", "deposit", 200_000, "2026-08-01"),
      ],
      balanceSnapshots: [
        balance("known-snapshot", "known", 120_000, "2026-08-31T10:00:00.000Z"),
      ],
      asOfDate: "2026-08-31",
      cutoffAt: "2026-08-31T16:59:59.999Z",
    });

    expect(result.knownBalanceTotal).toBe(120_000);
    expect(result.accountsWithBalance).toBe(1);
    expect(result.accountsMissingBalance).toBe(1);
    expect(result.totalBalance).toBeNull();
    expect(result.assetValue).toBeNull();
    expect(result.profitLoss).toBeNull();
  });
});