import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const supabaseFolder = path.resolve(__dirname, "../../supabase");
const preflight = readFileSync(
  path.join(supabaseFolder, "production-data-audit-1-preflight.sql"),
  "utf8",
);
const integrity = readFileSync(
  path.join(supabaseFolder, "production-data-audit-1-integrity.sql"),
  "utf8",
);

function withoutSqlCommentsAndLiterals(sql: string) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
}

describe("MYFINANCE-PRODUCTION-DATA-AUDIT-1", () => {
  it("contains only catalog/data SELECT statements, without DB mutations or RPC invocation", () => {
    for (const source of [preflight, integrity]) {
      const body = withoutSqlCommentsAndLiterals(source);
      expect(body).toMatch(/^\s*WITH\b/i);
      expect(body).toMatch(/\bSELECT\b/i);
      expect(body.trim().endsWith(";")).toBe(true);
      expect((body.match(/;/g) ?? []).length).toBe(1);
      expect(body).not.toMatch(
        /\b(?:ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|UPDATE|INSERT|DELETE|MERGE|CALL|EXECUTE|DO|COPY|REFRESH|VACUUM|ANALYZE|LOCK|SET|BEGIN|COMMIT|ROLLBACK)\b/i,
      );
    }
  });

  it("produces a safe aggregate-only grid with visible headline summaries", () => {
    for (const source of [preflight, integrity]) {
      expect(source).toContain("SELECT check_id, domain, priority, status, issue_count, expectation,");
      expect(source).toContain("AS failed_checks");
      expect(source).toContain("AS warning_checks");
      expect(source).toContain("CURRENT_TIMESTAMP AS checked_at");
      expect(source).not.toMatch(/\bSELECT\s+\*/i);
    }
  });

  it("preflights ownership, RLS, ACL, RPC security, FKs, and required schema columns", () => {
    for (const marker of [
      "RLS_ENABLED:",
      "AUTH_SELECT_ACCESS:",
      "RLS_READ_POLICY:",
      "RPC_SIGNATURE:",
      "ANON_TABLE_ACCESS:",
      "AUTH_DANGEROUS_ACL:",
      "REQUIRED_COLUMN:",
      "REQUIRED_RPC:",
      "ANON_RPC_EXECUTE:",
      "DEFINER_SEARCH_PATH:",
      "FK_PRESENT:",
      "PERMISSIVE_TRUE_RLS",
      "HOUSEHOLD_LEGACY_USER_UNIQUE",
      "AUDIT_AUTH_MUTATION_ACL",
    ]) {
      expect(preflight).toContain(marker);
    }
  });

  it("checks core cross-owner ledger relations without collapsing legacy nullable links", () => {
    for (const marker of [
      "TXN_SOURCE_WALLET_WRONG_OWNER",
      "TXN_DEST_WALLET_WRONG_OWNER",
      "TXN_CATEGORY_WRONG_OWNER",
      "BUDGET_CATEGORY_WRONG_OWNER",
      "INVESTMENT_CAPITAL_REF_WRONG_OWNER",
      "SAVINGS_MOVEMENT_WRONG_OWNER",
      "SAVINGS_MOVEMENT_WALLET_WRONG_OWNER",
      "FOREX_CASH_ACCOUNT_WRONG_OWNER",
      "FOREX_CASH_WALLET_WRONG_OWNER",
      "FOREX_SNAPSHOT_SOURCE_WRONG_ACCOUNT",
      "ACTIVE_WORKSPACE_MEMBERSHIP_INVALID",
      "REVIEW_ACK_TRANSACTION_WRONG_OWNER",
      "TXN_RULE_REF_WRONG_OWNER",
      "RECONCILIATION_WALLET_WRONG_OWNER",
    ]) {
      expect(integrity).toContain(marker);
    }
  });

  it("never mislabels valid managed transfers, multiple family workspaces, or historic snapshots", () => {
    expect(integrity).toContain(
      "NOT IN ('saving', 'investment', 'debt')",
    );
    expect(integrity).toContain("p.active_household_id IS NOT NULL");
    expect(integrity).toContain("NET_WORTH_SNAPSHOT_ASSET_EQUATION");
    expect(integrity).toContain("NET_WORTH_SNAPSHOT_NET_EQUATION");
    expect(integrity).toContain("WALLETS_WITHOUT_RECONCILIATION");
    expect(integrity).toContain("'INFO'");
  });

  it("keeps the two production queries separate from any auto-fix or deployment", () => {
    expect(preflight).toContain("READ ONLY");
    expect(integrity).toContain("READ ONLY");
    expect(preflight).not.toContain("pg_get_functiondef(");
    expect(integrity).not.toContain("pg_get_functiondef(");
    expect(integrity).not.toContain("SELECT t.id");
  });
});
