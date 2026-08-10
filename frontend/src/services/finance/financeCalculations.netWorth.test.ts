import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  calculateNetWorth,
  getForexAssetValue,
  getForexNetCapital,
  getForexNetCapitalByAccount,
  getNetWorth,
} from "./financeCalculations";
import type {
  Debt,
  ForexAccount,
  ForexCashTransaction,
  Investment,
  SavingAccount,
  Wallet,
} from "@/src/types/finance";

function wallet(balance: number, type: Wallet["type"] = "cash"): Wallet {
  return { id: `wallet-${balance}-${type}`, name: "Wallet", type, balance };
}

function saving(balance: number): SavingAccount {
  return {
    id: `saving-${balance}`,
    name: "Saving",
    type: "savings_account",
    balance,
  };
}

function investment(
  currentValue: number,
  investedAmount = currentValue,
): Investment {
  return {
    id: `inv-${currentValue}`,
    name: "Investment",
    type: "stock",
    investedAmount,
    currentValue,
  };
}

function debt(remainingAmount: number): Debt {
  return {
    id: `debt-${remainingAmount}`,
    name: "Debt",
    totalAmount: remainingAmount,
    remainingAmount,
  };
}

function forexAccount(
  id: string,
  currentEquity: number | null = null,
): ForexAccount {
  return {
    id,
    name: `Account ${id}`,
    broker: "Exness",
    currency: "VND",
    status: "active",
    currentEquity,
  };
}

function forexTx(
  type: ForexCashTransaction["type"],
  amount: number,
  fee = 0,
  forexAccountId = "acc-1",
): ForexCashTransaction {
  return {
    id: `fx-${forexAccountId}-${type}-${amount}-${fee}-${Math.random()}`,
    forexAccountId,
    walletId: "wallet-1",
    type,
    amount,
    currency: "VND",
    fee,
    transactionDate: "2026-01-01",
    transactionTime: "00:00",
  };
}

describe("calculateNetWorth (canonical)", () => {
  it("Test 1 — base case: sums assets and subtracts debt", () => {
    const result = calculateNetWorth({
      wallets: [wallet(100)],
      savings: [saving(50)],
      investments: [investment(200)],
      debts: [debt(75)],
      forexAssetValue: 25,
    });

    expect(result.cashAndWallets).toBe(100);
    expect(result.savings).toBe(50);
    expect(result.investments).toBe(200);
    expect(result.forex).toBe(25);
    expect(result.totalAssets).toBe(375);
    expect(result.totalDebt).toBe(75);
    expect(result.netWorth).toBe(300);
  });

  it("Test 2 — Forex inclusion: +X forex asset value increases net worth by exactly X", () => {
    const base = calculateNetWorth({
      wallets: [wallet(100)],
      savings: [saving(50)],
      investments: [investment(200)],
      debts: [debt(75)],
      forexAssetValue: 0,
    });
    const withForex = calculateNetWorth({
      wallets: [wallet(100)],
      savings: [saving(50)],
      investments: [investment(200)],
      debts: [debt(75)],
      forexAssetValue: 10_000,
    });

    expect(withForex.netWorth - base.netWorth).toBe(10_000);
    expect(withForex.totalAssets - base.totalAssets).toBe(10_000);
  });

  it("Test 3 — Debt: +X debt decreases net worth by exactly X", () => {
    const base = calculateNetWorth({
      wallets: [wallet(1000)],
      savings: [],
      investments: [],
      debts: [debt(100)],
    });
    const moreDebt = calculateNetWorth({
      wallets: [wallet(1000)],
      savings: [],
      investments: [],
      debts: [debt(100), debt(50)],
    });

    expect(base.netWorth - moreDebt.netWorth).toBe(50);
    expect(moreDebt.totalAssets).toBe(base.totalAssets);
  });

  it("Test 4 — no assets: totalAssets is 0 and net worth is negative liabilities", () => {
    const result = calculateNetWorth({
      wallets: [],
      savings: [],
      investments: [],
      debts: [debt(500)],
    });

    expect(result.totalAssets).toBe(0);
    expect(result.netWorth).toBe(-500);
  });

  it("Test 5 — no liabilities: net worth equals total assets", () => {
    const result = calculateNetWorth({
      wallets: [wallet(300)],
      savings: [saving(100)],
      investments: [investment(50)],
      debts: [],
      forexAssetValue: 20,
    });

    expect(result.netWorth).toBe(result.totalAssets);
    expect(result.netWorth).toBe(470);
  });

  it("Test 6 — every existing consumer sums ALL wallets unconditionally (no exclusion of legacy investment-type wallets), preserving current authoritative behavior", () => {
    const withInvestmentWallet = calculateNetWorth({
      wallets: [wallet(100, "cash"), wallet(50, "investment")],
      savings: [],
      investments: [investment(200)],
      debts: [],
    });
    const cashOnly = calculateNetWorth({
      wallets: [wallet(100, "cash")],
      savings: [],
      investments: [investment(200)],
      debts: [],
    });

    // Adding a legacy "investment"-typed wallet is additive, matching
    // getTotalAssets/Reports/Dashboard's existing shared behavior — no
    // implicit exclusion was found anywhere the net worth equation itself
    // is computed (only the unrelated `liquidBalance`/emergency-fund metric
    // excludes investment-type wallets).
    expect(withInvestmentWallet.totalAssets - cashOnly.totalAssets).toBe(50);
  });

  it("defaults forexAssetValue to 0 and never produces NaN/Infinity for empty state", () => {
    const result = calculateNetWorth({
      wallets: [],
      investments: [],
      debts: [],
    });

    expect(result.forex).toBe(0);
    expect(Number.isFinite(result.totalAssets)).toBe(true);
    expect(Number.isFinite(result.netWorth)).toBe(true);
    expect(result.netWorth).toBe(0);
  });
});

describe("getForexNetCapital (cost-basis figure, NOT the net worth asset value)", () => {
  it("computes deposits minus withdrawals minus fees", () => {
    const capital = getForexNetCapital([
      forexTx("deposit", 1000, 10),
      forexTx("deposit", 500, 5),
      forexTx("withdrawal", 200, 2),
    ]);

    expect(capital).toBe(1000 + 500 - 200 - (10 + 5 + 2));
  });

  it("returns 0 for no transactions", () => {
    expect(getForexNetCapital([])).toBe(0);
  });

  it("ignores negative fee values defensively (treated as 0)", () => {
    const capital = getForexNetCapital([forexTx("deposit", 1000, -50)]);
    expect(capital).toBe(1000);
  });

  it("Test D — a fee is subtracted exactly once per transaction, never accumulated across other transactions or repeated reads", () => {
    const txA = forexTx("deposit", 1000, 10, "acc-A");
    const txB = forexTx("deposit", 2000, 20, "acc-A");

    // Each transaction's own fee is subtracted once; account total reflects
    // exactly the sum of the two individual fees, not e.g. 2x either one.
    expect(getForexNetCapital([txA])).toBe(990);
    expect(getForexNetCapital([txB])).toBe(1980);
    expect(getForexNetCapital([txA, txB])).toBe(990 + 1980);

    // Calling it again (as a re-render/re-derivation would) is pure and
    // idempotent — no hidden accumulation across calls.
    expect(getForexNetCapital([txA, txB])).toBe(990 + 1980);
  });
});

describe("getForexNetCapitalByAccount", () => {
  it("groups net capital per Forex account, keeping accounts independent", () => {
    const result = getForexNetCapitalByAccount([
      forexTx("deposit", 1000, 0, "acc-A"),
      forexTx("deposit", 500, 0, "acc-B"),
      forexTx("withdrawal", 200, 5, "acc-A"),
    ]);

    expect(result.get("acc-A")).toBe(1000 - 200 - 5);
    expect(result.get("acc-B")).toBe(500);
  });

  it("returns an empty map for no transactions", () => {
    expect(getForexNetCapitalByAccount([]).size).toBe(0);
  });
});

describe("getForexAssetValue (canonical Forex net worth input)", () => {
  it("uses an account's current equity when the user has entered one, NOT net capital", () => {
    // Deposited 100,000,000 but the account is now worth 120,000,000
    // (unrealized trading gain) — net worth must reflect the current value.
    const value = getForexAssetValue(
      [forexAccount("acc-1", 120_000_000)],
      [forexTx("deposit", 100_000_000, 0, "acc-1")],
    );

    expect(value).toBe(120_000_000);
  });

  it("reflects a trading loss when current equity is below net capital", () => {
    const value = getForexAssetValue(
      [forexAccount("acc-1", 70_000_000)],
      [forexTx("deposit", 100_000_000, 0, "acc-1")],
    );

    expect(value).toBe(70_000_000);
  });

  it("falls back to net capital for an account with no equity entered yet, instead of dropping it to 0", () => {
    const value = getForexAssetValue(
      [forexAccount("acc-1", null)],
      [forexTx("deposit", 100_000_000, 0, "acc-1")],
    );

    expect(value).toBe(100_000_000);
  });

  it("mixes accounts independently: equity where entered, net capital fallback otherwise", () => {
    const value = getForexAssetValue(
      [forexAccount("acc-1", 120_000_000), forexAccount("acc-2", null)],
      [
        forexTx("deposit", 100_000_000, 0, "acc-1"),
        forexTx("deposit", 50_000_000, 0, "acc-2"),
      ],
    );

    // acc-1 uses its equity (120M); acc-2 has no equity yet, so it falls
    // back to its own net capital (50M) — never zero.
    expect(value).toBe(120_000_000 + 50_000_000);
  });

  it("returns 0 for no accounts", () => {
    expect(getForexAssetValue([], [])).toBe(0);
  });
});

describe("getNetWorth (legacy positional helper)", () => {
  it("delegates to calculateNetWorth and matches its result exactly", () => {
    const wallets = [wallet(100)];
    const debts = [debt(30)];
    const investments = [investment(40)];
    const savings = [saving(20)];

    const legacy = getNetWorth(wallets, debts, investments, savings);
    const canonical = calculateNetWorth({
      wallets,
      debts,
      investments,
      savings,
    }).netWorth;

    expect(legacy).toBe(canonical);
    expect(legacy).toBe(130);
  });
});

describe("Test 7 — Dashboard / Reports parity", () => {
  it("calculateDashboardSummary's netWorth matches calculateNetWorth for identical normalized inputs (the contract both Dashboard and Reports rely on)", () => {
    const wallets = [wallet(1_000_000), wallet(50_000, "investment")];
    const savings = [saving(200_000)];
    const investments = [investment(300_000, 250_000)];
    const debts = [debt(100_000)];
    const forexAssetValue = 75_000;

    const canonical = calculateNetWorth({
      wallets,
      savings,
      investments,
      debts,
      forexAssetValue,
    });

    const dashboardSummary = calculateDashboardSummary({
      wallets,
      savings,
      investments,
      debts,
      transactions: [],
      goals: [],
      forexAssetValue,
    });

    // Dashboard and Reports both ultimately read this exact number — this
    // is the invariant this sprint establishes: there is only one answer.
    expect(dashboardSummary.netWorth).toBe(canonical.netWorth);
    expect(dashboardSummary.totalAssets).toBe(canonical.totalAssets);
    expect(dashboardSummary.totalDebt).toBe(canonical.totalDebt);
  });

  it("calculateDashboardSummary omitting forexAssetValue defaults to 0 (backward compatible for callers that don't track Forex)", () => {
    const wallets = [wallet(500)];
    const investments: Investment[] = [];
    const debts: Debt[] = [];

    const summary = calculateDashboardSummary({
      wallets,
      investments,
      debts,
      transactions: [],
      goals: [],
    });

    expect(summary.netWorth).toBe(500);
  });
});

describe("Forex domain invariants (wallet <-> Forex transfer)", () => {
  it("Test A — moving money from a wallet into Forex (no equity entered yet) leaves net worth unchanged", () => {
    // Before: all 100 sits in the wallet.
    const before = calculateNetWorth({
      wallets: [wallet(100)],
      investments: [],
      debts: [],
      forexAssetValue: 0,
    });

    // After a 100 deposit: modeled as the wallet debited by 100 (Finance
    // Engine's job, not this pure function's) and the Forex account's
    // asset value now standing at its net capital (100), since no equity
    // has been entered yet — see the fallback test above.
    const after = calculateNetWorth({
      wallets: [wallet(0)],
      investments: [],
      debts: [],
      forexAssetValue: getForexAssetValue(
        [forexAccount("acc-1", null)],
        [forexTx("deposit", 100, 0, "acc-1")],
      ),
    });

    expect(after.netWorth).toBe(before.netWorth);
    expect(after.netWorth).toBe(100);
  });

  it("Test B — trading gain/loss changes net worth by exactly the equity delta once equity is entered", () => {
    const noGainNoLoss = calculateNetWorth({
      wallets: [wallet(0)],
      investments: [],
      debts: [],
      forexAssetValue: getForexAssetValue(
        [forexAccount("acc-1", 100)], // equity == net capital: no P&L yet
        [forexTx("deposit", 100, 0, "acc-1")],
      ),
    });

    const withGain = calculateNetWorth({
      wallets: [wallet(0)],
      investments: [],
      debts: [],
      forexAssetValue: getForexAssetValue(
        [forexAccount("acc-1", 120)], // +20 unrealized gain
        [forexTx("deposit", 100, 0, "acc-1")],
      ),
    });

    const withLoss = calculateNetWorth({
      wallets: [wallet(0)],
      investments: [],
      debts: [],
      forexAssetValue: getForexAssetValue(
        [forexAccount("acc-1", 70)], // -30 unrealized loss
        [forexTx("deposit", 100, 0, "acc-1")],
      ),
    });

    expect(withGain.netWorth - noGainNoLoss.netWorth).toBe(20);
    expect(withLoss.netWorth - noGainNoLoss.netWorth).toBe(-30);
  });

  it("Test C — withdrawing from Forex back to a wallet does not create or destroy net worth (ignoring fees)", () => {
    // Deposit 100 (no equity entered — net capital is the asset value),
    // then withdraw all of it back to the wallet.
    const afterDeposit = calculateNetWorth({
      wallets: [wallet(0)],
      investments: [],
      debts: [],
      forexAssetValue: getForexAssetValue(
        [forexAccount("acc-1", null)],
        [forexTx("deposit", 100, 0, "acc-1")],
      ),
    });

    const afterWithdrawal = calculateNetWorth({
      wallets: [wallet(100)], // money moved back to the wallet
      investments: [],
      debts: [],
      forexAssetValue: getForexAssetValue(
        [forexAccount("acc-1", null)],
        [
          forexTx("deposit", 100, 0, "acc-1"),
          forexTx("withdrawal", 100, 0, "acc-1"),
        ],
      ),
    });

    expect(afterWithdrawal.netWorth).toBe(afterDeposit.netWorth);
    expect(afterWithdrawal.netWorth).toBe(100);
  });
});
