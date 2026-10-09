import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sqlFiles = [
  "prod-acl-drift-1-table-permissions.sql",
  "prod-acl-drift-1-rpc-permissions.sql",
  "prod-acl-drift-1-default-privileges.sql",
] as const;

function readSql(name: (typeof sqlFiles)[number]): string {
  return readFileSync(path.resolve(__dirname, "../../supabase", name), "utf8")
    .replace(/\r\n?/g, "\n");
}

function stripSqlCommentsAndLiterals(source: string): string {
  return source
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

/** ACL diagnostics must NEVER apply a migration or read personal finance rows. */
describe("MYFINANCE-PROD-ACL-DRIFT-1", () => {
  it.each(sqlFiles)("keeps %s strictly read-only and one result grid", (file) => {
    const sql = stripSqlCommentsAndLiterals(readSql(file)).trim();
    expect(sql).toMatch(/^(?:WITH|SELECT)\b/i);
    expect(sql.endsWith(";")).toBe(true);
    expect(sql.match(/;/g)).toHaveLength(1);
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|REVOKE|GRANT|TRUNCATE|CALL|DO|EXECUTE|SET)\b/i,
    );
    expect(sql).not.toMatch(/\b(?:FROM|JOIN)\s+public\.[a-z_]+/i);
    expect(sql).toMatch(/\bCURRENT_TIMESTAMP\s+AS\s+checked_at/i);
  });

  it("checks each operation independently, rather than OR-combining privilege names", () => {
    const sql = readSql(sqlFiles[0]);
    expect(sql).toContain("CROSS JOIN operations o");
    expect(sql).toContain("has_table_privilege('anon', a.oid, o.operation)");
    expect(sql).toContain("has_table_privilege('authenticated', a.oid, o.operation)");
    expect(sql).not.toMatch(/has_table_privilege\([^)]*'SELECT,INSERT/i);
  });

  it("distinguishes effective privileges from direct and PUBLIC grants", () => {
    const sql = readSql(sqlFiles[0]);
    expect(sql).toContain("aclexplode(COALESCE(a.relacl, acldefault('r', a.relowner)))");
    expect(sql).toContain("granted_to_public");
    expect(sql).toContain("granted_directly_to_anon");
    expect(sql).toContain("granted_directly_to_authenticated");
    expect(sql).toContain("anon_effective_privileges");
    expect(sql).toContain("authenticated_dangerous");
  });

  it("preserves least-privilege read-only and AI exceptions when auditing grants", () => {
    const sql = readSql(sqlFiles[0]);
    for (const name of [
      "net_worth_snapshots", "forex_balance_snapshots",
      "wallet_reconciliations", "finance_audit_log",
    ]) {
      expect(sql).toContain(`('${name}'`);
    }
    expect(sql).toContain("('finance_workspace_preferences','household',ARRAY[]::text[])");
    expect(sql).toContain("('ai_user_settings','ai',ARRAY['SELECT','INSERT','UPDATE']::text[])");
    expect(sql).toContain("('ai_usage_logs','ai',ARRAY['SELECT','INSERT']::text[])");
    expect(sql).toContain("missing_authenticated_dml");
    expect(sql).toContain("rls_enabled");
  });

  it("inspects all overloads and separates missing reconciliation RPC from ACL drift", () => {
    const sql = readSql(sqlFiles[1]);
    for (const name of [
      "create_saving_account", "create_saving_movement",
      "delete_saving_account", "delete_forex_account_atomic",
    ]) expect(sql).toContain(name);
    expect(sql).toContain("('get_wallet_reconciliation_coverage','separate-rpc-deploy')");
    expect(sql).toContain("a.oid::regprocedure::text");
    expect(sql).toContain("MISSING_SEPARATE_TASK");
    expect(sql).toContain("public_acl_execute");
    expect(sql).toContain("anon_direct_acl_execute");
    expect(sql).toContain("authenticated_effective_execute");
  });

  it("audits future-object defaults without altering global privileges", () => {
    const sql = readSql(sqlFiles[2]);
    expect(sql).toContain("FROM pg_default_acl d");
    expect(sql).toContain("aclexplode(d.defaclacl)");
    expect(sql).toContain("object_creator");
    expect(sql).toContain("REVIEW_DEFAULT_EXPOSURE");
  });
});
