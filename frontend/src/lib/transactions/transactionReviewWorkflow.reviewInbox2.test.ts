import { describe, expect, it } from "vitest";
import { buildFinanceReviewInbox } from "@/src/lib/dashboard/dashboardIntelligence";
import type { Category, Transaction } from "@/src/types/finance";
import {
  applyTransactionReviewAcknowledgements,
  buildTransactionReviewAcknowledgementKey,
} from "./transactionReviewWorkflow";

const categories: Category[] = [
  {
    id: "food",
    name: "Ăn uống",
    type: "expense",
    planningGroup: "variable",
  },
  {
    id: "salary",
    name: "Lương",
    type: "income",
    planningGroup: "income",
  },
];

function tx(
  overrides: Partial<Transaction> & Pick<Transaction, "id">,
): Transaction {
  return {
    type: "expense",
    amount: 100_000,
    categoryId: "food",
    walletId: "cash",
    note: "Coffee",
    date: "2026-10-01",
    ...overrides,
  };
}

describe("FINANCE-REVIEW-INBOX-2 detector + acknowledgement", () => {
  it("detects a category whose type does not match the transaction", () => {
    const inbox = buildFinanceReviewInbox({
      transactions: [tx({ id: "t1", categoryId: "salary" })],
      categories,
      limit: 99,
    });
    expect(inbox.items[0]?.reasons).toContain("category-type-mismatch");
  });

  it("fingerprint-bound acknowledgement becomes invalid after category repair", () => {
    const original = tx({ id: "t1", categoryId: "salary" });
    const key = buildTransactionReviewAcknowledgementKey(
      original,
      "category-type-mismatch",
    );
    const repaired = { ...original, categoryId: "food" };
    expect(
      buildTransactionReviewAcknowledgementKey(
        repaired,
        "category-type-mismatch",
      ),
    ).not.toBe(key);
  });

  it("filters durable acknowledgement keys through the canonical workflow", () => {
    const transaction = tx({ id: "t1", amount: 2_000_000 });
    const raw = buildFinanceReviewInbox({
      transactions: [
        transaction,
        tx({ id: "t2", amount: 100_000, note: "a" }),
        tx({ id: "t3", amount: 100_000, note: "b" }),
        tx({ id: "t4", amount: 100_000, note: "c" }),
        tx({ id: "t5", amount: 100_000, note: "d" }),
      ],
      categories,
      limit: 99,
    });
    const key = buildTransactionReviewAcknowledgementKey(
      transaction,
      "unusual-expense",
    );
    const filtered = applyTransactionReviewAcknowledgements(
      raw,
      [transaction],
      new Set([key]),
    );
    expect(
      filtered.items.find((item) => item.transactionId === "t1"),
    ).toBeUndefined();
  });
});
