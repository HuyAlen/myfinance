import { describe, expect, it } from "vitest";
import { buildFinanceReviewInbox } from "@/src/lib/dashboard/dashboardIntelligence";
import type { Category, Transaction } from "@/src/types/finance";
import {
  applyTransactionReviewAcknowledgements,
  buildTransactionReviewAcknowledgementKey,
  findPossibleDuplicatePeers,
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

describe("TRANSACTION-REVIEW-WORKFLOW-1", () => {
  it("acknowledges only the exact transaction fingerprint", () => {
    const original = tx({ id: "t1", amount: 900_000 });
    const key = buildTransactionReviewAcknowledgementKey(
      original,
      "unusual-expense",
    );
    const edited = { ...original, amount: 950_000 };

    expect(
      buildTransactionReviewAcknowledgementKey(edited, "unusual-expense"),
    ).not.toBe(key);
  });

  it("removes acknowledged reasons while preserving unresolved reasons", () => {
    const transactions = [
      tx({ id: "t1", categoryId: "missing", amount: 900_000 }),
      tx({ id: "t2", amount: 900_000 }),
      tx({ id: "t3", amount: 100_000, note: "a" }),
      tx({ id: "t4", amount: 100_000, note: "b" }),
      tx({ id: "t5", amount: 100_000, note: "c" }),
    ];
    const raw = buildFinanceReviewInbox({
      transactions,
      categories,
      limit: 99,
    });
    const acknowledgement = buildTransactionReviewAcknowledgementKey(
      transactions[0],
      "unusual-expense",
    );
    const filtered = applyTransactionReviewAcknowledgements(
      raw,
      transactions,
      new Set([acknowledgement]),
    );

    const first = filtered.items.find((item) => item.transactionId === "t1");
    expect(first?.reasons).toContain("uncategorized");
    expect(first?.reasons).not.toContain("unusual-expense");
  });

  it("finds duplicate peers using the detector identity fields", () => {
    const first = tx({ id: "a" });
    const second = tx({ id: "b" });
    const different = tx({ id: "c", note: "Lunch" });
    expect(
      findPossibleDuplicatePeers(first, [first, second, different]).map(
        (item) => item.id,
      ),
    ).toEqual(["b"]);
  });

  it("keeping all duplicate rows clears duplicate review reasons", () => {
    const first = tx({ id: "a" });
    const second = tx({ id: "b" });
    const transactions = [first, second];
    const raw = buildFinanceReviewInbox({
      transactions,
      categories,
      limit: 99,
    });
    const keys = new Set([
      buildTransactionReviewAcknowledgementKey(
        first,
        "possible-duplicate",
      ),
      buildTransactionReviewAcknowledgementKey(
        second,
        "possible-duplicate",
      ),
    ]);
    const filtered = applyTransactionReviewAcknowledgements(
      raw,
      transactions,
      keys,
    );
    expect(filtered.duplicateCount).toBe(0);
    expect(filtered.total).toBe(0);
  });
});
