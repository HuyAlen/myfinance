import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("FINANCE-REVIEW-INBOX-2 TS2448 hotfix", () => {
  it("declares the durable acknowledgement callback before realtime subscribes to it", () => {
    const callbackIndex = source.indexOf(
      "const reloadTransactionReviewAcknowledgements = useCallback",
    );
    const hookIndex = source.indexOf(
      '["transaction_review_acknowledgements"]',
    );

    expect(callbackIndex).toBeGreaterThan(-1);
    expect(hookIndex).toBeGreaterThan(callbackIndex);
  });
});
