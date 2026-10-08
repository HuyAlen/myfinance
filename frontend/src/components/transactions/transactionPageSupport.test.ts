import { describe, expect, it } from "vitest";

import type { Transaction } from "@/src/types/finance";
import {
  compareTransactionNewestFirst,
  createEmptyForm,
  formatDrillDownRangeLabel,
  getTransactionDisplayNote,
  getTransactionTypeFromFormMode,
  getVisiblePageNumbers,
} from "./transactionPageSupport";

function transaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: "txn-1",
    type: "expense",
    amount: 100_000,
    categoryId: "cat-1",
    walletId: "wallet-1",
    note: "",
    date: "2026-10-08",
    ...overrides,
  };
}

describe("transactionPageSupport", () => {
  it("creates a fresh canonical expense form without mutation identity", () => {
    const first = createEmptyForm();
    const second = createEmptyForm();

    expect(first).not.toBe(second);
    expect(first.id).toBeUndefined();
    expect(first.type).toBe("expense");
    expect(first.formMode).toBe("expense");
    expect(first.isRecurring).toBe(false);
    expect(first.recurrence).toBe("monthly");
  });

  it("formats explicit drill-down ranges consistently", () => {
    expect(
      formatDrillDownRangeLabel("2026-10-01", "2026-10-31"),
    ).toBe("01/10/2026 - 31/10/2026");
  });

  it("keeps form-mode to canonical transaction-type mapping stable", () => {
    expect(getTransactionTypeFromFormMode("income")).toBe("income");
    expect(getTransactionTypeFromFormMode("expense")).toBe("expense");
    expect(getTransactionTypeFromFormMode("transfer")).toBe("transfer");
  });

  it("keeps newest-first ordering deterministic on equal calendar dates", () => {
    const a = transaction({ id: "a", date: "2026-10-08" });
    const b = transaction({ id: "b", date: "2026-10-08" });

    expect([a, b].sort(compareTransactionNewestFirst).map((item) => item.id))
      .toEqual(["b", "a"]);
  });

  it("keeps saving-transfer display copy on transfer rows", () => {
    const savingDeposit = transaction({
      type: "transfer",
      note: "",
      transferReferenceType: "saving",
      sourceType: "wallet",
      destinationType: "saving",
    });

    expect(getTransactionDisplayNote(savingDeposit)).toContain(
      "Nạp vào tiết kiệm",
    );
  });

  it("keeps compact pagination anchored to first/current/last pages", () => {
    expect(getVisiblePageNumbers(10, 5)).toEqual([0, 4, 5, 6, 9]);
    expect(getVisiblePageNumbers(3, 1)).toEqual([0, 1, 2]);
  });
});