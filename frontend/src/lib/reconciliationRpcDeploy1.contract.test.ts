import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sqlDir = path.resolve(__dirname, "../../supabase");
const readSql = (name: string) =>
  readFileSync(path.join(sqlDir, name), "utf8").replace(/\r\n?/g, "\n");

const apply = readSql("reconciliation-rpc-deploy-1-apply.sql");
const verify = readSql("reconciliation-rpc-deploy-1-verify.sql");
const existingMigration = readSql("wallet-reconciliation-coverage-ssot-1.sql");
const cleanInstallSchema = readFileSync(
  path.resolve(__dirname, "../../../supabase/schema.sql"),
  "utf8",
).replace(/\r\n?/g, "\n");

function functionBody(source: string): string {
  const match = source.match(
    /CREATE(?: OR REPLACE)? FUNCTION public\.get_wallet_reconciliation_coverage\(\)[\s\S]*?\bAS \$\$([\s\S]*?)\$\$;/i,
  );
  return (match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function withoutCommentsAndLiterals(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

/** These are static contracts, not evidence of a live production deployment. */
describe("MYFINANCE-RECONCILIATION-RPC-DEPLOY-1", () => {
  it("pins the rollout function body to the canonical migration and clean-install schema", () => {
    const body = functionBody(apply);
    expect(body.length).toBeGreaterThan(80);
    expect(body).toBe(functionBody(existingMigration));
    expect(body).toBe(functionBody(cleanInstallSchema));
    expect(body).toContain("DISTINCT ON (wr.wallet_id)");
    expect(body).toContain("public.current_finance_scope_owner_user_id()");
    expect(body).not.toMatch(/\bLIMIT\b/i);
  });

  it("deploys a single zero-argument SQL STABLE SECURITY INVOKER function", () => {
    expect(apply).toMatch(/\bCREATE FUNCTION public\.get_wallet_reconciliation_coverage\(\)/);
    expect(apply).not.toMatch(/\bCREATE OR REPLACE FUNCTION\b/i);
    expect(apply.match(/^CREATE FUNCTION\b/gm)).toHaveLength(1);
    expect(apply).toContain("RETURNS SETOF public.wallet_reconciliations");
    expect(apply).toMatch(/LANGUAGE sql\s+STABLE\s+SECURITY INVOKER\s+SET search_path = public, pg_temp/);
  });

  it("is one guarded and atomic migration with timeouts and no data writes", () => {
    expect(apply.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(apply.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(apply).toContain("SET LOCAL lock_timeout");
    expect(apply).toContain("SET LOCAL statement_timeout");
    expect(apply).toContain("RAISE EXCEPTION");
    const body = withoutCommentsAndLiterals(apply);
    expect(body).not.toMatch(/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE|CREATE TABLE|ALTER TABLE|DROP TABLE|ALTER POLICY|DROP POLICY|ALTER DEFAULT PRIVILEGES)\b/i);
  });

  it("fails closed if the function is already installed or gained overloads", () => {
    expect(apply).toContain("p.proname = 'get_wallet_reconciliation_coverage'");
    expect(apply).toContain("IF v_rpc_count <> 0 THEN");
    expect(apply).toContain("RPC already exists or has overloads");
    expect(apply).toContain("IF v_count <> 1 THEN");
    expect(apply).not.toContain("DROP FUNCTION");
  });

  it("checks RLS, household scope policy, required table columns and dependency ACL", () => {
    expect(apply).toContain("c.relrowsecurity");
    expect(apply).toContain("v_column_count <> 10");
    expect(apply).toContain("pol.roles && ARRAY['authenticated','public']::name[]");
    expect(apply).toContain("pol.qual");
    expect(apply).toContain("to_regprocedure('public.current_finance_scope_owner_user_id()')");
    expect(apply).toContain("has_table_privilege('authenticated', v_table_oid, 'SELECT')");
    expect(apply).toContain("has_table_privilege('anon', v_table_oid, 'SELECT')");
    expect(apply).toContain("has_function_privilege('anon', v_scope_oid, 'EXECUTE')");
  });

  it("revokes anonymous access, preserves authenticated execute and checks effective grants", () => {
    expect(apply).toMatch(/REVOKE ALL ON FUNCTION public\.get_wallet_reconciliation_coverage\(\)\s+FROM PUBLIC, anon;/);
    expect(apply).toContain("GRANT EXECUTE ON FUNCTION public.get_wallet_reconciliation_coverage() TO authenticated;");
    expect(apply).toContain("has_function_privilege('anon', v_rpc_oid, 'EXECUTE')");
    expect(apply).toContain("has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE')");
    expect(apply).not.toMatch(/\b(?:REVOKE|GRANT)\s+[^;]*\bON\s+TABLE\b/i);
  });

  it("validates return type, volatility, SQL language, invoker flag and search_path after CREATE", () => {
    for (const name of ["prosecdef", "provolatile", "prolang", "proretset", "prorettype", "proconfig"]) {
      expect(apply).toContain(`v_rpc.${name}`);
    }
    expect(apply).toContain("'public.wallet_reconciliations'::regtype");
    expect(apply).toContain("search_path=public,pg_temp");
    expect(apply).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("has exactly one read-only verification query with failure summary", () => {
    const body = withoutCommentsAndLiterals(verify).trim();
    expect(body).toMatch(/^WITH\b/i);
    expect(body.match(/;/g)).toHaveLength(1);
    expect(body).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|EXECUTE|DO|NOTIFY)\b/i);
    expect(verify).toContain("failed_checks");
    expect(verify).toContain("passed_checks");
    expect(verify).toContain("CURRENT_TIMESTAMP AS checked_at");
    expect(verify).not.toMatch(/\b(?:FROM|JOIN)\s+public\.(?:wallets|wallet_reconciliations|households|transactions)\b/i);
  });

  it("checks exactly fourteen scoped read-model invariants independently", () => {
    const checks = [...verify.matchAll(/(?:SELECT|UNION ALL SELECT) '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(checks).toHaveLength(14);
    expect(new Set(checks).size).toBe(14);
    for (const name of [
      "RPC_PRESENT", "RPC_NO_EXTRA_OVERLOADS", "RPC_ANON_DENIED", "RPC_AUTH_EXECUTE",
      "RPC_SECURITY_INVOKER", "RPC_SEARCH_PATH", "RPC_RETURN_TYPE",
      "RECEIPT_TABLE_RLS", "RECEIPT_TABLE_SCOPE_POLICY", "SCOPE_HELPER_AUTH_ONLY",
    ]) {
      expect(checks).toContain(name);
    }
  });
});
