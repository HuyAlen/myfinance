import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Transaction Review acknowledgement event bridge", () => {
  const source = readFileSync(
    path.resolve(__dirname, "transactionReviewWorkflow.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("exports one stable storage key and one stable same-tab change event", () => {
    expect(source).toContain(
      'export const TRANSACTION_REVIEW_ACK_STORAGE_KEY =\n  "myfinance:transaction-review-ack-v1";',
    );
    expect(source).toContain(
      'export const TRANSACTION_REVIEW_ACK_EVENT =\n  "myfinance:transaction-review-ack-changed";',
    );
  });

  it("dispatches the same-tab event only after the acknowledgement set was persisted", () => {
    const start = source.indexOf("export function persistTransactionReviewAcknowledgements(");
    const end = source.indexOf("\n}", start) + 2;
    const fn = source.slice(start, end);
    const persistIndex = fn.indexOf("window.localStorage.setItem(");
    const dispatchIndex = fn.indexOf("window.dispatchEvent(new Event(TRANSACTION_REVIEW_ACK_EVENT));");
    expect(persistIndex).toBeGreaterThan(-1);
    expect(dispatchIndex).toBeGreaterThan(persistIndex);
  });

  it("keeps review acknowledgement persistence UX-only and never couples it to ledger writes", () => {
    const start = source.indexOf("export function persistTransactionReviewAcknowledgements(");
    const fn = source.slice(start);
    expect(fn).not.toContain("addTransaction(");
    expect(fn).not.toContain("updateTransaction(");
    expect(fn).not.toContain("deleteTransaction(");
  });
});
