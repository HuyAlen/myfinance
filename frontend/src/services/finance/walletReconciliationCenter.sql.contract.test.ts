import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/wallet-reconciliation-center-1.sql"),
  "utf8",
);

describe("WALLET-RECONCILIATION-CENTER-1 SQL contract", () => {
  it("creates a durable receipt table with useful indexes", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.wallet_reconciliations");
    expect(sql).toContain("wallet_reconciliations_user_reconciled_idx");
    expect(sql).toContain("wallet_reconciliations_wallet_reconciled_idx");
  });

  it("fails closed on stale expected balance while holding a wallet row lock", () => {
    expect(sql).toContain("FOR UPDATE;");
    expect(sql).toContain("IS DISTINCT FROM p_expected_balance");
    expect(sql).toContain("ERRCODE = 'MFR02'");
  });

  it("allows reads for the active finance scope but direct writes only through the RPC", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT ON TABLE public.wallet_reconciliations TO authenticated");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reconcile_wallet_balance_atomic");
  });
});
