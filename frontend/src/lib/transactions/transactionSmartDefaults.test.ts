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
    note: "Ca phe",
    date: "2026-10-01",
    ...overrides,
  };
}

const baseInput = {
  mode: "expense" as const,
  note: "Ca phe",
  validCategoryIds: ["food", "fuel", "salary"],
};

describe("TRANSACTION-CATEGORY-ONLY-SUGGESTIONS-1 SSOT", () => {
  it("derives only category from newest exact normalized note match", () => {
    const suggestion = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      note: "  CA   PHE ",
      transactions: [
        transaction("old", { amount: 40000, categoryId: "fuel" }),
        transaction("new", {
          amount: 120000,
          categoryId: "food",
          walletId: "wallet-2",
          date: "2026-10-05",
        }),
      ],
    });

    expect(suggestion).toEqual({
      matchKind: "note",
      matchCount: 2,
      sourceTransactionId: "new",
      sourceDate: "2026-10-05",
      categoryId: "food",
    });
    expect(suggestion).not.toHaveProperty("amount");
    expect(suggestion).not.toHaveProperty("walletId");
  });

  it("allows one exact-note history item but never returns its money or wallet", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [transaction("only", { amount: 987654, walletId: "old-wallet" })],
    });
    expect(result?.categoryId).toBe("food");
    expect(result?.matchCount).toBe(1);
    expect(Object.keys(result ?? {})).not.toContain("amount");
    expect(Object.keys(result ?? {})).not.toContain("walletId");
  });

  it("ignores missing, short and placeholder notes", () => {
    const transactions = [transaction("a"), transaction("b")];
    for (const note of ["", "x", "Giao dich moi"]) {
      expect(buildTransactionSmartDefaultsSuggestion({
        ...baseInput,
        note,
        transactions,
      })).toBeNull();
    }
  });

  it("does not fallback to old amounts or the current category for a new note", () => {
    expect(buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      note: "New lunch",
      transactions: [transaction("a"), transaction("b")],
    })).toBeNull();
  });

  it("never cross-pollinates expense and income categories", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      mode: "income",
      note: "Monthly salary",
      validCategoryIds: ["salary"],
      transactions: [
        transaction("expense", { note: "Monthly salary", amount: 100000 }),
        transaction("income", {
          type: "income",
          note: "Monthly salary",
          categoryId: "salary",
          amount: 30000000,
        }),
      ],
    });
    expect(result?.categoryId).toBe("salary");
    expect(result?.matchCount).toBe(1);
    expect(result).not.toHaveProperty("amount");
  });

  it("excludes transfers, recurring rows and deleted categories", () => {
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
      ],
    });
    expect(result).toBeNull();
  });

  it("does not require the previous wallet to exist for a valid category", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [transaction("old-wallet", { walletId: "deleted-wallet" })],
    });
    expect(result?.categoryId).toBe("food");
  });

  it("never uses Savings-managed ledger mirrors as category examples", () => {
    const saving = transaction("saving", {
      type: "transfer",
      categoryId: "",
      transferToWalletId: "saving-1",
    }) as Transaction & {
      transferReferenceType: string;
      sourceType: string;
      destinationType: string;
    };
    saving.transferReferenceType = "saving";
    saving.sourceType = "wallet";
    saving.destinationType = "saving";
    expect(buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [saving],
    })).toBeNull();
  });

  it("does not mutate previously recorded transactions", () => {
    const rows = [transaction("a"), transaction("b", { date: "2026-10-02" })];
    const before = rows.map((item) => ({ ...item }));
    buildTransactionSmartDefaultsSuggestion({ ...baseInput, transactions: rows });
    expect(rows).toEqual(before);
  });
});
