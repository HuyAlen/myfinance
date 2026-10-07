import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sqlPath = path.resolve(
  __dirname,
  "../../../supabase/wallet-reconciliation-coverage-ssot-1.sql",
);
const sql = existsSync(sqlPath) ? readFileSync(sqlPath, "utf8") : "";
const canonicalSchema = readFileSync(
  path.resolve(__dirname, "../../../../supabase/schema.sql"),
  "utf8",
);
const databaseTypes = readFileSync(
  path.resolve(__dirname, "../../lib/database.types.ts"),
  "utf8",
);

function coverageFunctionSql() {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_wallet_reconciliation_coverage()",
  );
  const end = sql.indexOf(
    "REVOKE ALL ON FUNCTION public.get_wallet_reconciliation_coverage()",
    start,
  );
  return start >= 0 && end > start ? sql.slice(start, end) : "";
}

describe("WALLET-RECONCILIATION-COVERAGE-SSOT-1 SQL", () => {
  it("returns exactly the latest receipt per wallet without a global history cap", () => {
    const fn = coverageFunctionSql();
    expect(fn).toContain("DISTINCT ON (wr.wallet_id)");
    expect(fn).toContain(
      "ORDER BY wr.wallet_id, wr.reconciled_at DESC, wr.id DESC",
    );
    expect(fn).not.toMatch(/\bLIMIT\b/i);
  });

  it("keeps the read model finance-scope-aware and invoker-secured", () => {
    const fn = coverageFunctionSql();
    expect(fn).toContain("SECURITY INVOKER");
    expect(fn).toContain("STABLE");
    expect(fn).toContain("public.current_finance_scope_owner_user_id()");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_wallet_reconciliation_coverage() TO authenticated",
    );
  });

  it("extends the database RPC surface for the coverage reader", () => {
    expect(databaseTypes).toContain("get_wallet_reconciliation_coverage:");
    expect(databaseTypes).toContain("Returns: WalletReconciliationRow[]");
  });

  it("keeps the canonical DB-SSOT baseline deployable with the coverage RPC", () => {
    expect(canonicalSchema).toContain(
      "CREATE OR REPLACE FUNCTION public.get_wallet_reconciliation_coverage()",
    );
    expect(canonicalSchema).toContain("DISTINCT ON (wr.wallet_id)");
    expect(canonicalSchema).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_wallet_reconciliation_coverage() TO authenticated",
    );
  });
});
