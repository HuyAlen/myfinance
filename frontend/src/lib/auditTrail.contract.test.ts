import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const migration = read(
  "frontend/supabase/audit-trail-1-canonical-append-only-finance-audit.sql",
);
const schema = read("supabase/schema.sql");
const verification = read("supabase/schema-verification.sql");
const databaseTypes = read("frontend/src/lib/database.types.ts");
const membershipHardening = read(
  "frontend/supabase/household-membership-1-single-active-household.sql",
);

function extractSharedBody(sql: string) {
  const startMarker = "-- BEGIN AUDIT-TRAIL-1 SHARED BODY";
  const endMarker = "-- END AUDIT-TRAIL-1 SHARED BODY";
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    throw new Error("Missing AUDIT-TRAIL-1 shared body markers");
  }
  return sql.slice(start + startMarker.length, end).trim();
}

function extractFinanceAuditTable(sql: string) {
  const normalized = normalize(sql);
  const startMarker =
    "create table if not exists public.finance_audit_log (";
  const endMarker = "); comment on table public.finance_audit_log";
  const start = normalized.indexOf(startMarker);
  const end = normalized.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    throw new Error("Missing finance_audit_log table definition");
  }
  return normalized.slice(start, end + 2);
}

const normalizedMigration = normalize(migration);
const normalizedVerification = normalize(verification);
const normalizedTypes = normalize(databaseTypes);

describe("AUDIT-TRAIL-1 canonical append-only finance audit log", () => {
  it("creates a server-attributed household audit event store without cascade identity FKs", () => {
    for (const sql of [migration, schema]) {
      const auditTable = extractFinanceAuditTable(sql);

      expect(auditTable).toContain(
        "create table if not exists public.finance_audit_log",
      );
      expect(auditTable).toContain("household_id uuid not null");
      expect(auditTable).toContain("finance_owner_user_id uuid not null");
      expect(auditTable).toContain("actor_user_id uuid not null");
      expect(auditTable).toContain("actor_email text");
      expect(auditTable).toContain("actor_role text not null");
      expect(auditTable).toContain("before_data jsonb");
      expect(auditTable).toContain("after_data jsonb");
      expect(auditTable).toContain("request_id uuid");
      expect(auditTable).toContain(
        "transaction_id bigint not null default txid_current()",
      );
      expect(auditTable).toContain(
        "created_at timestamptz not null default now()",
      );
      expect(auditTable).not.toContain(
        "actor_user_id uuid not null references auth.users",
      );
      expect(auditTable).not.toContain(
        "household_id uuid not null references public.households",
      );
    }
  });

  it("server-stamps actor identity, household, role and timestamp from auth.uid membership", () => {
    expect(normalizedMigration).toContain(
      "create or replace function public.stamp_finance_audit_log_insert()",
    );
    expect(normalizedMigration).toContain("v_actor_user_id uuid := auth.uid()");
    expect(normalizedMigration).toContain(
      "from public.household_members hm join public.households h on h.id = hm.household_id",
    );
    expect(normalizedMigration).toContain("where hm.user_id = v_actor_user_id");
    expect(normalizedMigration).toContain("new.household_id := v_household_id");
    expect(normalizedMigration).toContain(
      "new.finance_owner_user_id := v_finance_owner_user_id",
    );
    expect(normalizedMigration).toContain("new.actor_user_id := v_actor_user_id");
    expect(normalizedMigration).toContain("new.actor_role := v_actor_role");
    expect(normalizedMigration).toContain("new.created_at := clock_timestamp()");
    expect(normalizedMigration).toContain("using errcode = 'mfa01'");
    expect(normalizedMigration).toContain("using errcode = 'mfa02'");
  });


  it("binds the latest audit stamp override to the active household instead of an arbitrary membership row", () => {
    const normalizedHardening = normalize(membershipHardening);
    const stampStart = normalizedHardening.indexOf(
      "create or replace function public.stamp_finance_audit_log_insert()",
    );
    const stampEnd = normalizedHardening.indexOf(
      "revoke all on function public.stamp_finance_audit_log_insert()",
      stampStart,
    );
    const stamp = normalizedHardening.slice(stampStart, stampEnd);

    expect(stampStart).toBeGreaterThan(-1);
    expect(stampEnd).toBeGreaterThan(stampStart);
    expect(stamp).toContain(
      "v_household_id := public.current_household_id()",
    );
    expect(stamp).toContain("hm.household_id = v_household_id");
    expect(stamp).toContain("hm.user_id = v_actor_user_id");
    expect(stamp).not.toContain("limit 1");
  });
  it("is append-only even beyond RLS by rejecting UPDATE and DELETE in a table trigger", () => {
    expect(normalizedMigration).toContain(
      "create or replace function public.reject_finance_audit_log_mutation()",
    );
    expect(normalizedMigration).toContain(
      "raise exception 'finance audit log is append-only' using errcode = 'mfa03'",
    );
    expect(normalizedMigration).toContain(
      "before update or delete on public.finance_audit_log",
    );
    expect(normalizedMigration).toContain(
      "execute function public.reject_finance_audit_log_mutation()",
    );
  });

  it("allows authenticated household members to read only their household while denying client writes", () => {
    expect(normalizedMigration).toContain(
      "alter table public.finance_audit_log enable row level security",
    );
    expect(normalizedMigration).toContain(
      "create policy finance_audit_log_household_select on public.finance_audit_log for select to authenticated using (household_id = public.current_household_id())",
    );
    expect(normalizedMigration).toContain(
      "revoke all on table public.finance_audit_log from public, anon, authenticated, service_role",
    );
    expect(normalizedMigration).toContain(
      "grant select on table public.finance_audit_log to authenticated, service_role",
    );
    expect(normalizedMigration).not.toContain(
      "grant insert on table public.finance_audit_log to authenticated",
    );
    expect(normalizedMigration).not.toContain(
      "grant update on table public.finance_audit_log to authenticated",
    );
    expect(normalizedMigration).not.toContain(
      "grant delete on table public.finance_audit_log to authenticated",
    );
  });

  it("provides a same-transaction row capture primitive without swallowing audit failures", () => {
    const captureStart = normalizedMigration.indexOf(
      "create or replace function public.capture_finance_audit_row()",
    );
    const captureEnd = normalizedMigration.indexOf(
      "revoke all on function public.capture_finance_audit_row()",
      captureStart,
    );
    const capture = normalizedMigration.slice(captureStart, captureEnd);

    expect(captureStart).toBeGreaterThan(-1);
    expect(captureEnd).toBeGreaterThan(captureStart);
    expect(capture).toContain("insert into public.finance_audit_log");
    expect(capture).toContain("before_data");
    expect(capture).toContain("after_data");
    expect(capture).toContain("lower(tg_op)");
    expect(capture).not.toContain("exception when");
    expect(capture).not.toContain("begin exception");

    for (const table of [
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
    ]) {
      expect(capture).toContain(`'${table}'`);
    }
  });

  it("keeps domain trigger attachment out of AUDIT-TRAIL-1 so AUDIT-MUTATION-1 owns rollout", () => {
    for (const table of [
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
    ]) {
      expect(normalizedMigration).not.toContain(
        `after insert or update or delete on public.${table}`,
      );
    }
    expect(normalizedMigration).toContain("audit-mutation-1");
  });

  it("keeps the forward migration and canonical fresh-install audit body in exact normalized parity", () => {
    expect(normalize(extractSharedBody(schema))).toBe(
      normalize(extractSharedBody(migration)),
    );
    expect(
      (schema.match(/-- BEGIN AUDIT-TRAIL-1 CANONICAL OVERLAY/g) ?? []).length,
    ).toBe(1);
  });

  it("extends generated database types with the immutable finance audit table surface", () => {
    expect(normalizedTypes).toContain("type financeauditlogrow = {");
    expect(normalizedTypes).toContain("household_id: string");
    expect(normalizedTypes).toContain("finance_owner_user_id: string");
    expect(normalizedTypes).toContain("actor_user_id: string");
    expect(normalizedTypes).toContain("actor_role: householdrole");
    expect(normalizedTypes).toContain("before_data: json | null");
    expect(normalizedTypes).toContain("after_data: json | null");
    expect(normalizedTypes).toContain("request_id: string | null");
    expect(normalizedTypes).toContain("transaction_id: number");
    expect(normalizedTypes).toContain(
      "finance_audit_log: { row: financeauditlogrow; insert: financeauditloginsert; update: financeauditlogupdate;",
    );
  });

  it("adds read-only deployment verification for table privileges, RLS, append-only guards and private capture functions", () => {
    expect(normalizedVerification).toContain(
      "audit-trail-1 canonical append-only finance audit log",
    );
    expect(normalizedVerification).toContain("public.finance_audit_log");
    expect(normalizedVerification).toContain("authenticated_can_select");
    expect(normalizedVerification).toContain("authenticated_can_insert");
    expect(normalizedVerification).toContain("authenticated_can_update");
    expect(normalizedVerification).toContain("authenticated_can_delete");
    expect(normalizedVerification).toContain(
      "trg_finance_audit_log_append_only_guard",
    );
    expect(normalizedVerification).toContain("capture_function_is_private");
    expect(normalizedVerification).toContain("stamp_function_is_private");
  });
});
