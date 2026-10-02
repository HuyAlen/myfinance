import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/finance-review-inbox-2.sql"),
  "utf8",
);

describe("FINANCE-REVIEW-INBOX-2 SQL contract", () => {
  it("creates durable fingerprint-bound acknowledgement receipts", () => {
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS public.transaction_review_acknowledgements",
    );
    expect(sql).toContain("fingerprint text NOT NULL");
    expect(sql).toContain("transaction_review_ack_unique");
    expect(sql).toContain("actor_user_id uuid NOT NULL DEFAULT auth.uid()");
  });

  it("uses household read scope and owner/member write scope", () => {
    expect(sql).toContain("current_finance_scope_owner_user_id()");
    expect(sql).toContain("current_finance_write_owner_user_id()");
  });

  it("publishes acknowledgement changes for cross-tab/device refresh", () => {
    expect(sql).toContain(
      "ALTER PUBLICATION supabase_realtime",
    );
    expect(sql).toContain(
      "ADD TABLE public.transaction_review_acknowledgements",
    );
  });
});
