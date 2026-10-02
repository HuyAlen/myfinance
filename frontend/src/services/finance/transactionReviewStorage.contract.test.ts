import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "transactionReviewStorage.ts"),
  "utf8",
);

describe("FINANCE-REVIEW-INBOX-2 storage contract", () => {
  it("reads acknowledgement receipts from the active finance workspace", () => {
    expect(source).toContain("getFinanceOwnerUserId()");
    expect(source).toContain('.from("transaction_review_acknowledgements")');
    expect(source).toContain('.eq("user_id", ownerUserId)');
  });

  it("persists fingerprint-bound receipts with an idempotent upsert", () => {
    expect(source).toContain("buildTransactionReviewFingerprint(transaction)");
    expect(source).toContain(".upsert(rows, {");
    expect(source).toContain(
      'onConflict: "user_id,transaction_id,reason,fingerprint"',
    );
  });
});
