import { describe, expect, it } from "vitest";
import {
  getSavingTransferKind,
  isInternalTransferTransaction,
} from "@/src/lib/transactions/transactionClassification";
import type { Transaction } from "@/src/types/finance";
import {
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

/**
 * TXN-CORRECTNESS-1 — Transfer/Saving Classification Correctness (F-1).
 *
 * The Transactions Page Full Audit found that `isInternalTransferTransaction`/
 * `getSavingTransferKind` performed note-text matching (e.g. "rut tien",
 * "nap them", "chuyen tien") on EVERY transaction regardless of its actual
 * `type` — so a plain `type: "expense"` row noted "Rút tiền mặt tại ATM" or
 * "Chuyển tiền học phí con" was silently reclassified as a transfer,
 * excluding it from the page's own income/expense/net-cash-flow totals and
 * flipping its displayed sign/icon. This diverged from the canonical
 * financeStorage.ts's inferTransactionKind, which returns "income"/
 * "expense" immediately and never reaches its own note-matching logic for
 * those types.
 *
 * These are real behavioral unit tests (not source-inspection) — the
 * classification logic was extracted to a small, framework-free module
 * (src/lib/transactions/transactionClassification.ts) specifically to make
 * this possible: importing TransactionsPage.tsx directly pulls in its
 * realtime/auth provider chain, which throws without Supabase env vars at
 * import time in this test environment.
 */

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "txn-1",
    type: "expense",
    amount: 100000,
    categoryId: "cat-1",
    walletId: "wallet-1",
    note: "",
    date: "2026-08-15",
    ...overrides,
  };
}

describe("F-1: getSavingTransferKind never reclassifies income/expense from note text", () => {
  it("expense with an ATM-withdrawal-like note: not a saving transfer", () => {
    const txn = makeTransaction({
      type: "expense",
      note: "Rút tiền mặt tại ATM",
    });
    expect(getSavingTransferKind(txn)).toBeNull();
  });

  it("expense with transfer-like wording: not a saving transfer", () => {
    const txn = makeTransaction({
      type: "expense",
      note: "Chuyển tiền học phí con",
    });
    expect(getSavingTransferKind(txn)).toBeNull();
  });

  it("income with transfer-like wording: not a saving transfer", () => {
    const txn = makeTransaction({
      type: "income",
      note: "Chuyển tiền lương tháng 8",
    });
    expect(getSavingTransferKind(txn)).toBeNull();
  });

  it("a genuine transfer with saving-deposit metadata is still recognized", () => {
    const txn = makeTransaction({
      type: "transfer",
      note: "",
      transferToWalletId: undefined,
      ...{
        transferReferenceType: "saving",
        sourceType: "wallet",
        destinationType: "saving",
      },
    } as Partial<Transaction>);
    expect(getSavingTransferKind(txn)).toBe("deposit");
  });

  it("a legacy transfer relying purely on note-text subtype is still recognized (legacy compatibility)", () => {
    const txn = makeTransaction({
      type: "transfer",
      note: "Nạp thêm vào tiết kiệm",
    });
    expect(getSavingTransferKind(txn)).toBe("deposit");
  });
});

describe("F-1: isInternalTransferTransaction never reclassifies income/expense from note text", () => {
  it('expense + "Rút tiền mặt tại ATM": EXPENSE, not transfer', () => {
    const txn = makeTransaction({
      type: "expense",
      note: "Rút tiền mặt tại ATM",
    });
    expect(isInternalTransferTransaction(txn)).toBe(false);
  });

  it('expense + "Chuyển tiền học phí con": EXPENSE, not transfer', () => {
    const txn = makeTransaction({
      type: "expense",
      note: "Chuyển tiền học phí con",
    });
    expect(isInternalTransferTransaction(txn)).toBe(false);
  });

  it('income + "Chuyển tiền lương tháng 8": INCOME, not transfer', () => {
    const txn = makeTransaction({
      type: "income",
      note: "Chuyển tiền lương tháng 8",
    });
    expect(isInternalTransferTransaction(txn)).toBe(false);
  });

  it("a genuine wallet-to-wallet transfer remains a transfer", () => {
    const txn = makeTransaction({
      type: "transfer",
      transferToWalletId: "wallet-2",
      note: "",
    });
    expect(isInternalTransferTransaction(txn)).toBe(true);
  });

  it("a genuine saving-linked transfer remains recognized as a transfer", () => {
    const txn = makeTransaction({
      type: "transfer",
      note: "",
      ...{
        transferReferenceType: "saving",
        sourceType: "wallet",
        destinationType: "saving",
      },
    } as Partial<Transaction>);
    expect(isInternalTransferTransaction(txn)).toBe(true);
  });

  it('a plain expense noted "nội bộ" is still an expense — the old bare-note check for internal-transfer wording must not apply to income/expense types', () => {
    const txn = makeTransaction({
      type: "expense",
      note: "Thanh toán nội bộ cho nhà cung cấp",
    });
    expect(isInternalTransferTransaction(txn)).toBe(false);
  });
});

describe("F-1 regression: real income/expense with transfer-like wording must not disappear from cash-flow totals", () => {
  it("an expense noted with transfer-like wording still counts toward totalExpense/netCashFlow", () => {
    const income = makeTransaction({
      id: "txn-income",
      type: "income",
      amount: 10_000_000,
      note: "Lương tháng 8",
    });
    const expense = makeTransaction({
      id: "txn-expense",
      type: "expense",
      amount: 2_000_000,
      note: "Chuyển tiền học phí con",
    });

    const allTransactions = [income, expense];
    // Mirrors TransactionsPage's own cashFlowTransactions/totalIncome/
    // totalExpense computation: filter out internal transfers, then run
    // the canonical calculation functions.
    const cashFlowTransactions = allTransactions.filter(
      (t) => !isInternalTransferTransaction(t),
    );

    expect(cashFlowTransactions).toHaveLength(2);

    const totalIncome = getTotalIncome(cashFlowTransactions);
    const totalExpense = getTotalExpense(cashFlowTransactions, []);
    const netCashFlow = totalIncome - totalExpense;

    expect(totalIncome).toBe(10_000_000);
    expect(totalExpense).toBe(2_000_000);
    expect(netCashFlow).toBe(8_000_000);
  });
});
