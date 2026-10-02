import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("FINANCE-REVIEW-INBOX-2 page contract", () => {
  it("loads durable acknowledgements and refreshes them via realtime", () => {
    expect(page).toContain("getTransactionReviewAcknowledgementKeys()");
    expect(page).toContain('"transaction_review_acknowledgements"');
    expect(page).toContain("reloadTransactionReviewAcknowledgements");
  });

  it("supports severity/reason/wallet/category filters", () => {
    expect(page).toContain("reviewFilters");
    expect(page).toContain("Mức độ");
    expect(page).toContain("Lý do");
    expect(page).toContain("Ví");
    expect(page).toContain("Danh mục");
    expect(page).toContain("filterFinanceReviewItems");
  });

  it("shows and explicitly applies a matching transaction rule inside review", () => {
    expect(page).toContain("activeReviewRuleSuggestion");
    expect(page).toContain("Suggested by rule");
    expect(page).toContain("handleApplyReviewRuleSuggestion");
  });

  it("persists keep/normal acknowledgements before removing them from the queue", () => {
    expect(page).toContain("acknowledgeTransactionReviewReasons");
    expect(page).toContain("await acknowledgeReviewReason");
  });
});
