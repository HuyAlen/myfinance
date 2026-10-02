import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("FINANCE-REVIEW-INBOX-2 Dashboard adoption", () => {
  it("loads durable acknowledgement receipts so Dashboard count matches Transactions", () => {
    expect(source).toContain("getTransactionReviewAcknowledgementKeys");
    expect(source).toContain("reloadTransactionReviewAcknowledgements");
    expect(source).toContain('"transaction_review_acknowledgements"');
  });

  it("labels the category type mismatch reason explicitly", () => {
    expect(source).toContain('reason === "category-type-mismatch"');
    expect(source).toContain("Sai loại danh mục");
  });
});
