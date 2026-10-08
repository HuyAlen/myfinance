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
  validCategoryIds: ["food", "fuel", "salary"],
};

describe("TRANSACTION-CATEGORY-SUGGESTION-CONFIDENCE-1 — P1", () => {
  it("fails closed when exact-note history is split 1-1 instead of trusting the newest row", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      note: "  CA   PHE ",
      transactions: [
        transaction("old-food", {
          categoryId: "food",
          date: "2026-10-01",
        }),
        transaction("new-fuel", {
          categoryId: "fuel",
          date: "2026-10-05",
        }),
      ],
    });

    expect(result).toBeNull();
  });

  it("uses a strict majority and picks the newest transaction inside the winning category", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [
        transaction("food-old", {
          categoryId: "food",
          date: "2026-10-01",
        }),
        transaction("food-new", {
          categoryId: "food",
          date: "2026-10-04",
        }),
        transaction("food-mid", {
          categoryId: "food",
          date: "2026-10-03",
        }),
        transaction("fuel-old", {
          categoryId: "fuel",
          date: "2026-10-02",
        }),
        transaction("fuel-newest-overall", {
          categoryId: "fuel",
          date: "2026-10-08",
        }),
      ],
    });

    expect(result).toEqual({
      matchKind: "note",
      matchCount: 3,
      totalMatchCount: 5,
      sourceTransactionId: "food-new",
      sourceDate: "2026-10-04",
      categoryId: "food",
    });
  });

  it("rejects a 2-of-4 plurality because it is not a strict majority", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [
        transaction("food-1", { categoryId: "food" }),
        transaction("food-2", { categoryId: "food", date: "2026-10-02" }),
        transaction("fuel-1", { categoryId: "fuel", date: "2026-10-03" }),
        transaction("salary-1", {
          categoryId: "salary",
          date: "2026-10-04",
        }),
      ],
    });

    expect(result).toBeNull();
  });

  it("allows one exact-note example because the user supplied a precise context", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [
        transaction("only", {
          amount: 72000,
          walletId: "wallet-2",
        }),
      ],
    });

    expect(result).toEqual({
      matchKind: "note",
      matchCount: 1,
      totalMatchCount: 1,
      sourceTransactionId: "only",
      sourceDate: "2026-10-01",
      categoryId: "food",
    });
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

  it("does not fall back from category history when the note is new", () => {
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

    expect(result).toBeNull();
  });

  it("ignores amount and wallet differences while counting category support", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [
        transaction("a", { amount: 1000, walletId: "wallet-a" }),
        transaction("b", {
          amount: 9999999,
          walletId: "wallet-b",
          date: "2026-10-03",
        }),
      ],
    });

    expect(result?.matchCount).toBe(2);
    expect(result?.totalMatchCount).toBe(2);
    expect(result?.categoryId).toBe("food");
    expect(result).not.toHaveProperty("amount");
    expect(result).not.toHaveProperty("walletId");
  });

  it("keeps income and expense histories independent", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      mode: "income",
      note: "Lương tháng",
      validCategoryIds: ["salary"],
      transactions: [
        transaction("expense", {
          note: "Lương tháng",
          categoryId: "food",
          amount: 100000,
        }),
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
      totalMatchCount: 1,
      sourceTransactionId: "income",
      categoryId: "salary",
    });
  });

  it("excludes transfers, recurring schedule rows and invalid/deleted categories", () => {
    const result = buildTransactionSmartDefaultsSuggestion({
      ...baseInput,
      transactions: [
        transaction("transfer", {
          type: "transfer",
          categoryId: "food",
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

  it("excludes Savings-managed mirrors even if legacy metadata is cast onto a transaction", () => {
    const saving = transaction("saving", {
      type: "transfer",
      categoryId: "food",
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

  it("does not mutate the ledger while deriving consensus", () => {
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