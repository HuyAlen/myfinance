import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sqlRoot = path.resolve(__dirname, "../../supabase");
const apply = readFileSync(path.join(sqlRoot, "prod-acl-drift-1-phase2-apply.sql"), "utf8")
  .replace(/\r\n?/g, "\n");
const verify = readFileSync(path.join(sqlRoot, "prod-acl-drift-1-phase2-verify.sql"), "utf8")
  .replace(/\r\n?/g, "\n");

const targetTables = [
  "wallets", "categories", "transactions", "debts", "goals", "budgets",
  "investments", "savings", "saving_transactions", "forex_accounts",
  "forex_cash_transactions", "transaction_rules",
  "transaction_review_acknowledgements", "wallet_reconciliations",
  "ai_user_settings", "ai_conversations", "ai_messages", "ai_pending_actions",
  "ai_action_audit_logs", "ai_usage_logs",
] as const;
const targetFunctions = [
  "public.create_saving_account(uuid,text,text,numeric,text,uuid,date,numeric,date,text)",
  "public.create_saving_movement(uuid,text,text,numeric,text,date,uuid,text)",
  "public.delete_forex_account_atomic(uuid)",
  "public.delete_saving_account(uuid)",
] as const;

/** Static guard; passing cannot certify that production privileges were changed. */
describe("MYFINANCE-PROD-ACL-DRIFT-1 / PHASE 2", () => {
  it("protects changes with one explicit transaction and fail-closed guard", () => {
    expect(apply).toMatch(/^BEGIN;/m);
    expect(apply).toMatch(/^COMMIT;/m);
    expect(apply.match(/\bBEGIN;\s*$/gm)).toHaveLength(1);
    expect(apply.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(apply).toContain("RAISE EXCEPTION");
    expect(apply).toContain("lock_timeout");
    expect(apply).toContain("statement_timeout");
  });

  it("targets exactly the 20 reviewed public tables", () => {
    for (const name of targetTables) {
      expect(apply).toContain(`('${name}', '`);
      expect(verify).toContain(`('${name}', '`);
    }
    const firstManifest = apply.split("AS expected(table_name, allowed_authenticated_dml)")[0];
    const present = [...firstManifest.matchAll(/\('([a-z_]+)', '(?:SELECT[^']*)'\)/g)].map((match) => match[1]);
    expect(present).toHaveLength(20);
    expect(new Set(present).size).toBe(20);
  });

  it("removes anon ACL on named tables, never schema-wide or platform tables", () => {
    expect(apply).toContain("REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon");
    expect(apply).not.toMatch(/\bALL TABLES IN SCHEMA\b/i);
    expect(apply).not.toMatch(/public\.(?:storage|graphql|auth)\b/i);
    expect(apply).not.toContain("ALTER DEFAULT PRIVILEGES");
  });

  it("removes dangerous authenticated grants without regranting broad DML", () => {
    expect(apply).toContain("REVOKE TRUNCATE, TRIGGER, REFERENCES");
    expect(apply).toContain("REVOKE MAINTAIN");
    expect(apply).toContain("REVOKE UPDATE ON TABLE public.ai_action_audit_logs FROM authenticated");
    expect(apply).toContain("REVOKE UPDATE, DELETE ON TABLE public.ai_usage_logs FROM authenticated");
    expect(apply).toContain("REVOKE DELETE ON TABLE public.ai_user_settings FROM authenticated");
    expect(apply).toContain("REVOKE UPDATE ON TABLE public.transaction_review_acknowledgements FROM authenticated");
    expect(apply).not.toMatch(/^\s*GRANT\b/im);
  });

  it("insists on required authenticated DML one operation at a time", () => {
    expect(apply).toContain("FOREACH v_privilege IN ARRAY string_to_array");
    expect(apply).toContain("has_table_privilege('authenticated', v_table_oid, v_privilege)");
    expect(apply).toContain("Required authenticated privilege missing after patch");
    expect(verify).toContain("unnest(string_to_array(e.allowed_authenticated_dml, ','))");
  });

  it("revokes only four exactly identified RPC signatures without changing bodies", () => {
    for (const signature of targetFunctions) {
      expect(apply).toContain(signature);
      expect(verify).toContain(signature);
    }
    expect(apply).toContain("v_count <> 1");
    expect(apply).toContain("to_regprocedure(v_rpc_signature)");
    expect(apply).toContain("REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC");
    expect(apply).not.toMatch(/^\s*CREATE OR REPLACE FUNCTION\b/im);
    expect(apply).not.toContain("public.get_wallet_reconciliation_coverage()");
  });

  it("rejects unknown anonymous column grants and preserves RLS", () => {
    expect(apply).toContain("aclexplode(a.attacl)");
    expect(apply).toContain("c.relrowsecurity");
    expect(apply).not.toMatch(/^\s*(?:ALTER TABLE .* DISABLE ROW LEVEL SECURITY|DROP POLICY)\b/im);
    expect(verify).toContain("unexpected_anon_column_grant");
    expect(verify).toContain("unexpected_auth_column_grant");
  });

  it("postflight is exactly one read-only SELECT and exposes summary status", () => {
    const withoutComments = verify.replace(/--[^\n]*/g, "")
      .replace(/'(?:''|[^'])*'/g, "''").trim();
    expect(withoutComments).toMatch(/^WITH\b/i);
    expect(withoutComments.match(/;/g)).toHaveLength(1);
    expect(withoutComments).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|REVOKE|GRANT|TRUNCATE|CALL|DO)\b/i);
    expect(verify).toContain("failed_checks");
    expect(verify).toContain("passed_checks");
    expect(verify).toContain("checked_at");
    expect(verify).not.toMatch(/\b(?:FROM|JOIN)\s+public\.[a-z_]+/i);
  });
});
