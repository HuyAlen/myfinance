import { describe, expect, it } from "vitest";
import type { Transaction } from "@/src/types/finance";
import { buildTransactionSmartDefaultsSuggestion } from "./transactionSmartDefaults";

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

const baseInput = {
  mode: "expense" as const,
  note: "Cà phê",
  categoryId: "food",
  validCategoryIds: ["food", "fuel", "salary"],
  validWalletIds: ["wallet-1", "wallet-2"],
};

describe("TRANSACTION-SMART-DEFAULTS-1 suggestion SSOT", () => {
  it("uses exact normalized note history and returns the most recent amount/category/wallet", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      note: "  CA   PHE ",
      transactions: [
        transaction("old", { amount: 45000, date: "2026-10-01" }),
        transaction("new", {
          amount: 55000,
          walletId: "wallet-2",
          date: "2026-10-05",
        }),
      ],
    });

    expect(result).toEqual({
      matchKind: "note",
      matchCount: 2,
      sourceTransactionId: "new",
      sourceDate: "2026-10-05",
      amount: 55000,
      categoryId: "food",
      walletId: "wallet-2",
    });
  });

  it("allows one exact-note example because the user supplied a precise context", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [transaction("only", { amount: 72000 })],
    });

    expect(result?.matchKind).toBe("note");
    expect(result?.matchCount).toBe(1);
    expect(result?.amount).toBe(72000);
  });

  it("does not guess before the user supplies a meaningful note", () => {
    const transactions = [transaction("a"), transaction("b")];

    expect(
      buildTransactionSmartDefaultsSuggestion({
        ...baseInput,
        note: "",
        transactions,
      }),
    ).toBeNull();
    expect(
      buildTransactionSmartDefaultsSuggestion({
        ...baseInput,
        note: "x",
        transactions,
      }),
    ).toBeNull();
    expect(
      buildTransactionSmartDefaultsSuggestion({
        ...baseInput,
        note: "Giao dịch mới",
        transactions,
      }),
    ).toBeNull();
  });

  it("falls back to category history only after two valid examples when the note is new", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      note: "Bữa trưa mới",
      transactions: [
        transaction("old", { amount: 80000, date: "2026-10-01" }),
        transaction("new", {
          amount: 95000,
          walletId: "wallet-2",
          date: "2026-10-04",
        }),
      ],
    });

    expect(result).toMatchObject({
      matchKind: "category",
      matchCount: 2,
      sourceTransactionId: "new",
      amount: 95000,
      categoryId: "food",
      walletId: "wallet-2",
    });
  });

  it("does not create a category fallback from a one-off historical transaction", () => {
    expect(
      buildTransactionSmartDefaultsSuggestion({
        ...baseInput,
        note: "Bữa trưa mới",
        transactions: [transaction("only")],
      }),
    ).toBeNull();
  });

  it("keeps income and expense histories independent", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      mode: "income",
      note: "Lương tháng",
      categoryId: "salary",
      validCategoryIds: ["salary"],
      validWalletIds: ["wallet-1"],
      transactions: [
        transaction("expense", { note: "Lương tháng", amount: 100000 }),
        transaction("income", {
          type: "income",
          note: "Lương tháng",
          categoryId: "salary",
          amount: 25000000,
        }),
      ],
    });

    expect(result).toMatchObject({
      matchKind: "note",
      matchCount: 1,
      sourceTransactionId: "income",
      amount: 25000000,
      categoryId: "salary",
    });
  });

  it("excludes transfers, recurring schedule rows and invalid/deleted entity references", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [
        transaction("transfer", {
          type: "transfer",
          categoryId: "",
          transferToWalletId: "wallet-2",
        }),
        transaction("recurring", {
          isRecurring: true,
          recurrence: "monthly",
          nextRunDate: "2026-11-01",
        }),
        transaction("deleted-category", { categoryId: "deleted" }),
        transaction("deleted-wallet", { walletId: "deleted" }),
      ],
    });

    expect(result).toBeNull();
  });

  it("excludes Savings-managed mirrors even if legacy metadata is cast onto a transaction", () => {
    const saving = transaction("saving", {
      type: "transfer",
      categoryId: "",
      transferToWalletId: "saving-1",
      note: "Cà phê",
    }) as Transaction & {
      transferReferenceType: string;
      sourceType: string;
      destinationType: string;
    };
    saving.transferReferenceType = "saving";
    saving.sourceType = "wallet";
    saving.destinationType = "saving";

    expect(
      buildTransactionSmartDefaultsSuggestion({
        ...baseInput,
        transactions: [saving],
      }),
    ).toBeNull();
  });

  it("does not mutate the ledger while deriving a suggestion", () => {
    const rows = [
      transaction("a", { date: "2026-10-01" }),
      transaction("b", { date: "2026-10-02" }),
    ];
    const before = rows.map((item) => ({ ...item }));

    buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: rows,
    });

    expect(rows).toEqual(before);
  });
});