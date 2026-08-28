import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** INVESTMENTS-CORRECTNESS-1 — database-side atomic account deletion contract. */
describe("Forex account atomic deletion SQL contract", () => {
  const sql = readFileSync(
    path.resolve(
      __dirname,
      "../../../../supabase/finance-engine-4-forex-account-atomic-delete.sql",
    ),
    "utf8",
  );
  const normalized = sql.replace(/\s+/g, " ").toLowerCase();

  it("exposes one authenticated RPC for account deletion", () => {
    expect(normalized).toContain(
      "create or replace function public.delete_forex_account_atomic( p_account_id uuid )",
    );
    expect(normalized).toContain(
      "grant execute on function public.delete_forex_account_atomic(uuid) to authenticated",
    );
  });

  it("locks and scopes the account to auth.uid before mutation", () => {
    expect(normalized).toContain("from public.forex_accounts");
    expect(normalized).toContain("user_id = auth.uid()");
    expect(normalized).toContain("for update");
  });

  it("reuses authoritative single-ledger deletion inside the outer transaction", () => {
    expect(normalized).toContain(
      "perform public.delete_forex_cash_transaction(p_id => v_transaction.id)",
    );
  });

  it("deletes the account only after all linked cash rows have been processed", () => {
    const nestedDelete = normalized.indexOf(
      "perform public.delete_forex_cash_transaction",
    );
    const accountDelete = normalized.indexOf(
      "delete from public.forex_accounts",
    );
    expect(nestedDelete).toBeGreaterThan(-1);
    expect(accountDelete).toBeGreaterThan(nestedDelete);
  });
});
