import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
);

describe("TRANSACTION-REVIEW-WORKFLOW-1 Transactions wiring", () => {
  it("opens a dedicated review workspace from URL context", () => {
    expect(source).toContain('data-transaction-review-workflow="true"');
    expect(source).toContain("urlTransactionsContext?.review === true");
    expect(source).toContain("urlTransactionsContext?.transactionId");
  });

  it("uses the shared review detector plus acknowledgement filter", () => {
    expect(source).toContain("buildFinanceReviewInbox({");
    expect(source).toContain("applyTransactionReviewAcknowledgements(");
    expect(source).toContain("readTransactionReviewAcknowledgements()");
  });

  it("supports categorise, duplicate and unusual-expense actions", () => {
    expect(source).toContain("handleReviewCategoryChange");
    expect(source).toContain("handleKeepDuplicateGroup");
    expect(source).toContain("handleMarkUnusualNormal");
    expect(source).toContain("findPossibleDuplicatePeers(");
  });

  it("keeps destructive duplicate removal behind existing delete confirmation", () => {
    expect(source).toContain("onClick={() => handleDelete(peer.id)}");
    expect(source).toContain(
      "onClick={() => handleDelete(activeReviewTransaction.id)}",
    );
  });

  it("does not invent a transaction-review database table", () => {
    expect(source).not.toContain("saveTransactionReview");
    expect(source).not.toContain("review_status");
    expect(source).not.toContain("review_decisions");
  });
});
