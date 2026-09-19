import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../..");
const migrationPath = path.join(
  repoRoot,
  "frontend/supabase/forex-balance-cashflow-backfill-1.sql",
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();

describe("FOREX-BALANCE-CASHFLOW-BACKFILL-1", () => {
  it("ships as one transactional, fail-closed correction", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(normalized).toContain("begin;");
    expect(normalized).toMatch(/commit;$/);
    expect(normalized).toContain("if v_match_count <> 1 then");
    expect(normalized).toContain("raise exception");
  });

  it("targets only the known legacy FX-Capital withdrawal", () => {
    expect(normalized).toContain("'fx-capital'");
    expect(normalized).toContain("'exness'");
    expect(normalized).toContain("t.type = 'withdrawal'");
    expect(normalized).toContain("t.amount = 933433");
    expect(normalized).toContain("t.transaction_date = date '2026-09-16'");
  });

  it("moves only the legacy broker Balance from before-withdrawal to after-withdrawal", () => {
    expect(normalized).toContain("v_expected_before constant numeric := 6078857");
    expect(normalized).toContain("v_expected_after constant numeric := 5145424");
    expect(normalized).toContain("set current_equity = v_expected_after");
    expect(normalized).toContain("where id = v_account_id");
  });

  it("is rerun-safe for the corrected state and rejects every unexpected Balance", () => {
    expect(normalized).toContain("if v_current_balance = v_expected_before then");
    expect(normalized).toContain("elsif v_current_balance = v_expected_after then");
    expect(normalized).toContain("-- already corrected: intentional no-op");
    expect(normalized).toContain("unexpected legacy forex balance");
  });

  it("does not replay the historical transaction into wallet or cash-ledger state", () => {
    expect(normalized).not.toContain("update public.wallets");
    expect(normalized).not.toContain("insert into public.wallets");
    expect(normalized).not.toContain("update public.forex_cash_transactions");
    expect(normalized).not.toContain("delete from public.forex_cash_transactions");
    expect(normalized).not.toContain("insert into public.forex_cash_transactions");
  });

  it("requires CASHFLOW-SSOT-1 first and supplies audit actor context for the one account update", () => {
    expect(normalized).toContain("to_regprocedure(");
    expect(normalized).toContain("set current_equity = v_new_balance");
    expect(normalized).toContain("set_config('request.jwt.claim.sub', v_user_id::text, true)");
    expect(normalized).toContain("auth.uid() is distinct from v_user_id");
  });
});
