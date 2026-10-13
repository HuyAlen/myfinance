import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/settings-household-data-safety-1.sql"),
  "utf8",
);
const verify = readFileSync(
  path.resolve(__dirname, "../../../supabase/settings-household-data-safety-1-verify.sql"),
  "utf8",
);

describe("SETTINGS-HOUSEHOLD-DATA-SAFETY-1 SQL migration contract", () => {
  it("patches BOTH existing live RPCs in place, preserving original V4 transaction", () => {
    expect(sql).toContain("'export_finance_backup()', 'restore_finance_backup(jsonb)'");
    expect(sql).toContain("pg_get_functiondef(v_oid)");
    expect(sql).toContain("SETTINGS-HOUSEHOLD-DATA-SAFETY-1 OWNER GUARD");
    expect(sql).toContain("atomic V4 restore invariants missing");
    expect(sql).toContain("EXECUTE v_definition");
    expect(sql).toContain("current_finance_admin_owner_user_id()");
  });
  it("fails closed on source drift and keeps one atomic DDL transaction", () => {
    expect(sql.trimStart()).toMatch(/^--/);
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("RPC source differs; stop and review");
    expect(sql).toContain("MFB06");
    expect(sql).toContain("IF auth.uid() IS NULL THEN");
  });
  it("locks workspace preferences against concurrent switching", () => {
    expect(sql).toContain("FROM public.finance_workspace_preferences");
    expect(sql).toContain("FOR SHARE;");
    expect(sql).toContain("active_household_id");
    expect(sql).toContain("hm.role = 'owner'");
    expect(sql).toContain("v_owner IS DISTINCT FROM v_actor");
    expect(sql).toContain("FOR SHARE OF h, hm");
  });
  it("uses explicit scope arguments and authenticated-only grants", () => {
    expect(sql).toContain("FUNCTION public.export_finance_backup_scoped(");
    expect(sql).toContain("FUNCTION public.restore_finance_backup_scoped(");
    expect(sql).toContain("PERFORM public.assert_settings_finance_workspace_owner(p_expected_household_id)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.restore_finance_backup_scoped(jsonb, uuid) TO authenticated");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.restore_finance_backup_scoped(jsonb, uuid) FROM PUBLIC, anon");
  });
  it("ships a non-destructive live verifier", () => {
    expect(verify).toContain("pg_get_functiondef");
    expect(verify).toContain("owner_scope_guard_present");
    expect(verify).not.toMatch(/DELETE\s+FROM\s+public\./i);
    expect(verify).not.toMatch(/\bCALL\b/i);
  });
});
