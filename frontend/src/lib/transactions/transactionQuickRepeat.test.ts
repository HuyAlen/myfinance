import { describe, expect, it } from "vitest";
import type { Transaction } from "@/src/types/finance";
import { buildTransactionQuickRepeatCandidates } from "./transactionQuickRepeat";

function transaction(
  id: string,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    type: "expense",
    amount: 50000,
    categoryId: "food",
    walletId: "wallet-1",
    note: "Cà phê",
    date: "2026-10-01",
    ...overrides,
  };
}

describe("TRANSACTION-QUICK-REPEAT-1 candidate SSOT", () => {
  it("only surfaces templates that actually repeat", () => {
    expect(
      buildTransactionQuickRepeatCandidates([
        transaction("one"),
        transaction("different", { note: "Different" }),
      ]),
    ).toEqual([]);

    const result = buildTransactionQuickRepeatCandidates([
      transaction("one"),
      transaction("two", { date: "2026-10-02" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].occurrences).toBe(2);
    expect(result[0].transaction.id).toBe("two");
  });

  it("normalizes note casing, accents and repeated whitespace for the repeat signature", () => {
    const result = buildTransactionQuickRepeatCandidates([
      transaction("a", { note: "  Cà   phê " }),
      transaction("b", { note: "CA PHE", date: "2026-10-03" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].occurrences).toBe(2);
  });

  it("groups matching categories/notes/wallets despite varying previous amounts", () => {
    const result = buildTransactionQuickRepeatCandidates([
      transaction("base-1"),
      transaction("base-2"),
      transaction("amount-1", { amount: 60000 }),
      transaction("amount-2", { amount: 60000 }),
      transaction("wallet-1", { walletId: "wallet-2" }),
      transaction("wallet-2", { walletId: "wallet-2" }),
      transaction("category-1", { categoryId: "fuel" }),
      transaction("category-2", { categoryId: "fuel" }),
    ], 10);

    expect(result).toHaveLength(3);
    const food = result.find((candidate) =>
      candidate.transaction.categoryId === "food" &&
      candidate.transaction.walletId === "wallet-1",
    );
    expect(food?.occurrences).toBe(4);
  });

  it("supports repeated wallet transfers only when source and destination are valid and distinct", () => {
    const result = buildTransactionQuickRepeatCandidates([
      transaction("transfer-1", {
        type: "transfer",
        categoryId: "",
        walletId: "wallet-1",
        transferToWalletId: "wallet-2",
        note: "Chuyển tiền",
      }),
      transaction("transfer-2", {
        type: "transfer",
        categoryId: "",
        walletId: "wallet-1",
        transferToWalletId: "wallet-2",
        note: "Chuyển tiền",
        date: "2026-10-02",
      }),
      transaction("invalid-transfer", {
        type: "transfer",
        categoryId: "",
        walletId: "wallet-1",
        transferToWalletId: "wallet-1",
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].transaction.id).toBe("transfer-2");
  });

  it("excludes recurring schedule rows so quick repeat cannot compete with the recurring engine", () => {
    const result = buildTransactionQuickRepeatCandidates([
      transaction("recurring-1", {
        isRecurring: true,
        recurrence: "monthly",
        nextRunDate: "2026-11-01",
      }),
      transaction("recurring-2", {
        isRecurring: true,
        recurrence: "monthly",
        nextRunDate: "2026-11-01",
      }),
      transaction("paused-1", { recurrence: "monthly" }),
      transaction("paused-2", { recurrence: "monthly" }),
    ]);

    expect(result).toEqual([]);
  });

  it("excludes Savings-managed mirror rows from generic repeat", () => {
    const savingMetadata = {
      type: "transfer" as const,
      categoryId: "",
      transferToWalletId: "saving-1",
      transferReferenceType: "saving",
      sourceType: "wallet",
      destinationType: "saving",
    };

    const result = buildTransactionQuickRepeatCandidates([
      transaction("saving-1", savingMetadata as Partial<Transaction>),
      transaction("saving-2", savingMetadata as Partial<Transaction>),
    ]);

    expect(result).toEqual([]);
  });

  it("ranks by repeat count, then recency, and caps the result", () => {
    const rows: Transaction[] = [];
    for (const id of ["coffee-1", "coffee-2", "coffee-3"]) {
      rows.push(transaction(id, { note: "Coffee", amount: 50000 }));
    }
    rows.push(
      transaction("fuel-1", { note: "Fuel", amount: 100000, date: "2026-10-04" }),
      transaction("fuel-2", { note: "Fuel", amount: 100000, date: "2026-10-05" }),
      transaction("lunch-1", { note: "Lunch", amount: 80000, date: "2026-10-02" }),
      transaction("lunch-2", { note: "Lunch", amount: 80000, date: "2026-10-03" }),
    );

    const result = buildTransactionQuickRepeatCandidates(rows, 2);
    expect(result).toHaveLength(2);
    expect(result[0].occurrences).toBe(3);
    expect(result[1].transaction.note).toBe("Fuel");
  });

  it("does not mutate the transaction input array", () => {
    const rows = [
      transaction("one"),
      transaction("two", { date: "2026-10-02" }),
    ];
    const before = rows.map((item) => item.id);
    buildTransactionQuickRepeatCandidates(rows);
    expect(rows.map((item) => item.id)).toEqual(before);
  });
});