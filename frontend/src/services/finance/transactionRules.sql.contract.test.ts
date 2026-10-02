import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/transaction-rules-1.sql"),
  "utf8",
);

describe("TRANSACTION-RULES-1 SQL contract", () => {
  it("creates rule persistence with deterministic priority and constrained actions", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.transaction_rules");
    expect(sql).toContain("priority integer NOT NULL DEFAULT 100");
    expect(sql).toContain("transaction_rules_action_check");
    expect(sql).toContain("action_category_id");
    expect(sql).toContain("action_wallet_id");
  });

  it("uses household scope for reads and owner/member write scope for mutations", () => {
    expect(sql).toContain("current_finance_scope_owner_user_id()");
    expect(sql).toContain("current_finance_write_owner_user_id()");
  });

  it("publishes rule changes to Supabase realtime", () => {
    expect(sql).toContain(
      "ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_rules",
    );
  });
});
