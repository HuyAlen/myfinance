import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
);

describe("TRANSACTION-REVIEW-WORKFLOW-1 Dashboard adoption", () => {
  it("applies persisted review acknowledgements before rendering counts", () => {
    expect(source).toContain("readTransactionReviewAcknowledgements()");
    expect(source).toContain("applyTransactionReviewAcknowledgements(");
  });

  it("deep-links each review item to the exact transaction", () => {
    expect(source).toContain("review: true");
    expect(source).toContain("transactionId: item.transactionId");
  });

  it("opens the full review queue from the CTA", () => {
    expect(source).toContain("Xử lý hàng đợi rà soát");
  });
});
