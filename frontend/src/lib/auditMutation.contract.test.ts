import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");
const normalize = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const migration = read(
  "frontend/supabase/audit-mutation-1-atomic-actor-attribution.sql",
);
const auditTrailMigration = read(
  "frontend/supabase/audit-trail-1-canonical-append-only-finance-audit.sql",
);
const schema = read("supabase/schema.sql");
const verification = read("supabase/schema-verification.sql");

const normalizedMigration = normalize(migration);
const normalizedAuditTrailMigration = normalize(auditTrailMigration);
const normalizedSchema = normalize(schema);
const normalizedVerification = normalize(verification);

const financeTables = [
  "wallets",
  "categories",
  "transactions",
  "debts",
  "goals",
  "budgets",
  "investments",
  "savings",
  "saving_transactions",
  "forex_accounts",
  "forex_cash_transactions",
] as const;

function extractSharedBody(sql: string) {
  const startMarker = "-- BEGIN AUDIT-MUTATION-1 SHARED BODY";
  const endMarker = "-- END AUDIT-MUTATION-1 SHARED BODY";
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    throw new Error("Missing AUDIT-MUTATION-1 shared body markers");
  }
  return sql.slice(start + startMarker.length, end).trim();
}

function extractCaptureFunction(sql: string) {
  const normalized = normalize(sql);
  const startMarker =
    "create or replace function public.capture_finance_audit_row()";
  const endMarker =
    "revoke all on function public.capture_finance_audit_row()";
  const start = normalized.indexOf(startMarker);
  const end = normalized.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    throw new Error("Missing capture_finance_audit_row definition");
  }
  return normalized.slice(start, end);
}

describe("AUDIT-MUTATION-1 atomic actor attribution", () => {
  it("activates one synchronous AFTER ROW audit trigger on every persisted finance mutation table", () => {
    for (const table of financeTables) {
      const trigger = `trg_${table}_finance_audit`;
      expect(normalizedMigration).toContain(
        `drop trigger if exists ${trigger} on public.${table}`,
      );
      expect(normalizedMigration).toContain(
        `create trigger ${trigger} after insert or update or delete on public.${table} for each row execute function public.capture_finance_audit_row()`,
      );
      expect((normalizedMigration.match(new RegExp(`create trigger ${trigger}`, "g")) ?? []).length).toBe(1);
    }
  });

  it("keeps AUDIT-TRAIL-1 as the foundation-only migration while rollout lives in AUDIT-MUTATION-1", () => {
    for (const table of financeTables) {
      expect(normalizedAuditTrailMigration).not.toContain(
        `after insert or update or delete on public.${table}`,
      );
      expect(normalizedMigration).toContain(`on public.${table}`);
    }
  });

  it("captures insert/update/delete before and after images without swallowing audit failures", () => {
    const capture = extractCaptureFunction(migration);
    expect(capture).toContain("if tg_op = 'insert'");
    expect(capture).toContain("v_before := null");
    expect(capture).toContain("v_after := to_jsonb(new)");
    expect(capture).toContain("elsif tg_op = 'update'");
    expect(capture).toContain("v_before := to_jsonb(old)");
    expect(capture).toContain("elsif tg_op = 'delete'");
    expect(capture).toContain("v_after := null");
    expect(capture).toContain("insert into public.finance_audit_log");
    expect(capture).toContain("lower(tg_op)");
    expect(capture).not.toContain("exception when");
  });

  it("rejects finance rows outside the authenticated actor household scope", () => {
    const capture = extractCaptureFunction(migration);
    expect(capture).toContain("if auth.uid() is null");
    expect(capture).toContain("using errcode = 'mfa01'");
    expect(capture).toContain(
      "v_finance_owner_user_id := public.current_finance_scope_owner_user_id()",
    );
    expect(capture).toContain(
      "v_row_user_id is distinct from v_finance_owner_user_id",
    );
    expect(capture).toContain("using errcode = 'mfa06'");
  });

  it("preserves signup bootstrap without opening a general unaudited write path", () => {
    expect(normalizedMigration).toContain(
      "create or replace function public.seed_default_categories_for_user(p_user_id uuid)",
    );
    expect(normalizedMigration).toContain(
      "set_config( 'myfinance.audit_mode', 'bootstrap_default_categories', true )",
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.seed_default_categories_for_user(uuid) from public, anon, authenticated",
    );
    const capture = extractCaptureFunction(migration);
    expect(capture).toContain(
      "if v_audit_mode = 'bootstrap_default_categories'",
    );
    expect(capture).toContain(
      "if tg_table_name <> 'categories' or tg_op <> 'insert'",
    );
    expect(capture).toContain("using errcode = 'mfa07'");
  });

  it("does not attach finance audit capture to snapshots, household identity, AI persistence, or the audit log itself", () => {
    for (const table of [
      "net_worth_snapshots",
      "households",
      "household_members",
      "household_invites",
      "ai_user_settings",
      "ai_conversations",
      "ai_messages",
      "ai_pending_actions",
      "ai_action_audit_logs",
      "ai_usage_logs",
      "finance_audit_log",
    ]) {
      expect(normalizedMigration).not.toContain(
        `trg_${table}_finance_audit`,
      );
    }
  });

  it("keeps the forward migration and canonical fresh-install rollout body in exact normalized parity", () => {
    expect(normalize(extractSharedBody(schema))).toBe(
      normalize(extractSharedBody(migration)),
    );
    expect(
      (schema.match(/-- BEGIN AUDIT-MUTATION-1 CANONICAL OVERLAY/g) ?? [])
        .length,
    ).toBe(1);
  });

  it("adds read-only deployment verification for all trigger attachments and scope hardening", () => {
    expect(normalizedVerification).toContain(
      "audit-mutation-1 atomic actor attribution across finance mutations",
    );
    expect(normalizedVerification).toContain("expected_audit_trigger_count");
    expect(normalizedVerification).toContain("actual_audit_trigger_count");
    expect(normalizedVerification).toContain("capture_uses_household_owner_scope");
    expect(normalizedVerification).toContain("capture_has_mfa06_scope_guard");
    expect(normalizedVerification).toContain("bootstrap_suppression_is_narrow");
    for (const table of financeTables) {
      expect(normalizedVerification).toContain(`('${table}'`);
    }
  });

  it("is deploy-idempotent and keeps capture private", () => {
    expect(normalizedMigration).toContain("begin;");
    expect(normalizedMigration).toContain("commit;");
    expect(normalizedMigration).toContain(
      "revoke all on function public.capture_finance_audit_row() from public, anon, authenticated",
    );
    for (const table of financeTables) {
      expect(normalizedMigration).toContain(
        `drop trigger if exists trg_${table}_finance_audit on public.${table}`,
      );
    }
    expect(normalizedSchema).toContain(
      "-- begin audit-mutation-1 canonical overlay",
    );
  });
});
