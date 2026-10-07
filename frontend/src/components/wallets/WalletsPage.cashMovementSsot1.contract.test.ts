import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("WALLETS-CASH-MOVEMENT-SSOT-1", () => {
  it("loads every selected-period ledger required by canonical wallet liquidity", () => {
    expect(source).toContain("getSavingTransactionsInRange(startDate, endDate)");
    expect(source).toContain("getForexCashTransactionsInRange(startDate, endDate)");
    expect(source).toContain("setPeriodSavingMovements(");
    expect(source).toContain("setPeriodForexCashTransactions(");
  });

  it("derives Wallet overview inflow/outflow from the canonical cash-movement snapshot", () => {
    expect(source).toContain("const periodWalletCashMovement = useMemo(");
    expect(source).toContain("calculateWalletCashMovementSnapshot({");
    expect(source).toContain("formatVND(periodWalletCashMovement.cashIn)");
    expect(source).toContain("formatVND(periodWalletCashMovement.cashOut)");
    expect(source).toContain("periodWalletCashMovement.netCashMovement");
    expect(source).not.toContain("formatVND(getTotalIncome(periodTxns))");
    expect(source).not.toContain("formatVND(getTotalExpense(periodTxns, categories))");
  });

  it("uses money-in/money-out copy because capital movement is not income/expense", () => {
    expect(source).toContain('label="Ti\u1ec1n v\u00e0o k\u1ef3 n\u00e0y"');
    expect(source).toContain('label="Ti\u1ec1n ra k\u1ef3 n\u00e0y"');
    expect(source).not.toContain('label="Chi ti\u00eau k\u1ef3 n\u00e0y"');
    expect(source).toContain("V\u00e0o <strong");
    expect(source).toContain("Ra <strong");
  });

  it("builds every wallet card from the same canonical snapshot plus its internal transfers", () => {
    expect(source).toContain("const walletFlow = useMemo(() => {");
    expect(source).toContain("savingMovements: periodSavingMovements.filter(");
    expect(source).toContain("forexCashTransactions: periodForexCashTransactions.filter(");
    expect(source).toContain("transferIn: transferInByWallet.get(w.id) ?? 0");
    expect(source).toContain("transferOut: transferOutByWallet.get(w.id) ?? 0");
    expect(source).toContain("const net = flow.netCashMovement;");
    expect(source).toContain("flow.cashIn");
    expect(source).toContain("flow.cashOut");
    expect(source).not.toContain("const net = flow.income - flow.expense;");
  });

  it("refreshes when the newly-consumed Savings or Forex ledgers change", () => {
    const start = source.indexOf("useRealtimeTable(");
    const end = source.indexOf(");", start);
    const realtime = source.slice(start, end);
    expect(realtime).toContain('"saving_transactions"');
    expect(realtime).toContain('"forex_cash_transactions"');
  });

  it("keeps wallet-to-wallet movement separate from aggregate external liquidity", () => {
    expect(source).toContain("const periodTransfers = useMemo(");
    expect(source).toContain("const periodTransferTotal = useMemo(");
    expect(source).toContain("Chuy\u1ec3n n\u1ed9i b\u1ed9");
    expect(source).toContain("formatVND(periodTransferTotal)");
    expect(source).toContain("periodTransfers.length");
    expect(source).not.toContain('label="Chuy\u1ec3n gi\u1eefa v\u00ed"');
  });
});
