import { describe, expect, it } from "vitest";
import type { Transaction } from "@/src/types/finance";
import { buildTransactionEntryConfidenceWarnings } from "./transactionEntryConfidence";

function transaction(
  id: string,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    type: "expense",
    amount: 100_000,
    categoryId: "food",
    walletId: "wallet-1",
    note: "Cà phê",
    date: "2026-10-01",
    ...overrides,
  };
}

const baseInput = {
  draft: {
    mode: "expense" as const,
    amount: 100_000,
    categoryId: "food",
    walletId: "wallet-1",
    note: "Cà phê",
    date: "2026-10-10",
  },
  validCategoryIds: ["food", "fuel"],
  validWalletIds: ["wallet-1", "wallet-2"],
};

describe("TRANSACTION-ENTRY-CONFIDENCE-1 warning SSOT", () => {
  it("flags an exact same-day duplicate using the canonical review fingerprint", () => {
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, date: "2026-10-01" },
      transactions: [transaction("existing")],
    });

    expect(warnings).toEqual([
      { kind: "possible-duplicate", peerTransactionId: "existing" },
    ]);
  });

  it("does not call nearby-but-different amount, wallet, category, note or day a duplicate", () => {
    const variants: Partial<Transaction>[] = [
      { amount: 120_000 },
      { walletId: "wallet-2" },
      { categoryId: "fuel" },
      { note: "Trà" },
      { date: "2026-10-02" },
    ];

    for (const overrides of variants) {
      const warnings = buildTransactionEntryConfidenceWarnings({
        ...baseInput,
        draft: { ...baseInput.draft, date: "2026-10-01" },
        transactions: [transaction("candidate", overrides)],
      });
      expect(warnings.some((warning) => warning.kind === "possible-duplicate")).toBe(false);
    }
  });

  it("warns when an exact-note amount is materially higher than at least three historical examples", () => {
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, amount: 1_000_000 },
      transactions: [
        transaction("a", { date: "2026-10-01" }),
        transaction("b", { date: "2026-10-02" }),
        transaction("c", { date: "2026-10-03" }),
      ],
    });

    expect(warnings).toContainEqual({
      kind: "amount-outlier",
      direction: "high",
      baselineAmount: 100_000,
      contextCount: 3,
    });
  });

  it("warns when an exact-note amount is materially lower than its repeated history", () => {
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, amount: 100_000 },
      transactions: [
        transaction("a", { amount: 1_000_000, date: "2026-10-01" }),
        transaction("b", { amount: 1_000_000, date: "2026-10-02" }),
        transaction("c", { amount: 1_000_000, date: "2026-10-03" }),
      ],
    });

    expect(warnings).toContainEqual({
      kind: "amount-outlier",
      direction: "low",
      baselineAmount: 1_000_000,
      contextCount: 3,
    });
  });

  it("requires at least three exact-note examples before warning about amount", () => {
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, amount: 1_000_000 },
      transactions: [transaction("a"), transaction("b", { date: "2026-10-02" })],
    });

    expect(warnings.some((warning) => warning.kind === "amount-outlier")).toBe(false);
  });

  it("warns when at least 80 percent of repeated exact-note history uses another wallet", () => {
    const transactions = [
      transaction("a", { date: "2026-10-01" }),
      transaction("b", { date: "2026-10-02" }),
      transaction("c", { date: "2026-10-03" }),
      transaction("d", { date: "2026-10-04" }),
      transaction("e", { walletId: "wallet-2", date: "2026-10-05" }),
    ];
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, walletId: "wallet-2" },
      transactions,
    });

    expect(warnings).toContainEqual({
      kind: "wallet-context-mismatch",
      expectedWalletId: "wallet-1",
      expectedWalletCount: 4,
      contextCount: 5,
    });
  });

  it("does not warn about wallet choice without a strong 80 percent context majority", () => {
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, walletId: "wallet-2" },
      transactions: [
        transaction("a", { date: "2026-10-01" }),
        transaction("b", { date: "2026-10-02" }),
        transaction("c", { date: "2026-10-03" }),
        transaction("d", { walletId: "wallet-2", date: "2026-10-04" }),
      ],
    });

    expect(warnings.some((warning) => warning.kind === "wallet-context-mismatch")).toBe(false);
  });

  it("excludes transfer, recurring, Savings-managed and stale entity history from confidence context", () => {
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

    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: { ...baseInput.draft, amount: 1_000_000 },
      transactions: [
        transaction("transfer", { type: "transfer", categoryId: "", transferToWalletId: "wallet-2" }),
        transaction("recurring", { isRecurring: true, recurrence: "monthly" }),
        saving,
        transaction("deleted-category", { categoryId: "deleted" }),
        transaction("deleted-wallet", { walletId: "deleted" }),
      ],
    });

    expect(warnings).toEqual([]);
  });

  it("does not infer amount or wallet context from an empty or placeholder note", () => {
    for (const note of ["", "x", "Giao dịch mới"]) {
      const warnings = buildTransactionEntryConfidenceWarnings({
        ...baseInput,
        draft: { ...baseInput.draft, note, amount: 1_000_000 },
        transactions: [
          transaction("a", { note, date: "2026-10-01" }),
          transaction("b", { note, date: "2026-10-02" }),
          transaction("c", { note, date: "2026-10-03" }),
        ],
      });
      expect(warnings.some((warning) => warning.kind !== "possible-duplicate")).toBe(false);
    }
  });

  it("is pure and returns warnings in duplicate, amount, wallet priority order", () => {
    const transactions = [
      transaction("a", { date: "2026-10-01" }),
      transaction("b", { date: "2026-10-02" }),
      transaction("c", { date: "2026-10-03" }),
      transaction("d", { date: "2026-10-04" }),
      transaction("peer", {
        amount: 1_000_000,
        walletId: "wallet-2",
        date: "2026-10-10",
      }),
    ];
    const before = transactions.map((item) => ({ ...item }));
    const warnings = buildTransactionEntryConfidenceWarnings({
      ...baseInput,
      draft: {
        ...baseInput.draft,
        amount: 1_000_000,
        walletId: "wallet-2",
      },
      transactions,
    });

    expect(warnings.map((warning) => warning.kind)).toEqual([
      "possible-duplicate",
      "amount-outlier",
      "wallet-context-mismatch",
    ]);
    expect(transactions).toEqual(before);
  });
});