import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const migration = read(
  "frontend/supabase/household-membership-1-single-active-household.sql",
);
const verification = read(
  "frontend/supabase/household-membership-1-verification.sql",
);
const schema = read("supabase/schema.sql");
const service = read("frontend/src/services/finance/householdService.ts");
const provider = read("frontend/src/components/household/HouseholdProvider.tsx");
const auditMigration = read(
  "frontend/supabase/audit-trail-1-canonical-append-only-finance-audit.sql",
);

const sql = normalize(migration);

function functionSlice(name: string, nextName?: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? sql.indexOf(`create or replace function public.${nextName}`, start + 1)
    : -1;
  return sql.slice(start, end > start ? end : undefined);
}

function extractBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    throw new Error(`Missing markers: ${startMarker} / ${endMarker}`);
  }
  return source.slice(start + startMarker.length, end).trim();
}

describe("HOUSEHOLD-MEMBERSHIP-1 active workspace and audit isolation", () => {
  it("keeps the forward migration and canonical fresh-install overlay in exact normalized parity", () => {
    const sharedBody = extractBetween(
      migration,
      "-- BEGIN HOUSEHOLD-MEMBERSHIP-1 SHARED BODY",
      "-- END HOUSEHOLD-MEMBERSHIP-1 SHARED BODY",
    );
    const canonicalOverlay = extractBetween(
      schema,
      "-- BEGIN HOUSEHOLD-MEMBERSHIP-1 CANONICAL OVERLAY",
      "-- END HOUSEHOLD-MEMBERSHIP-1 CANONICAL OVERLAY",
    );
    expect(normalize(canonicalOverlay)).toBe(normalize(sharedBody));
  });

  it("guards active preferences so they can only point at an actual membership", () => {
    expect(sql).toContain(
      "create or replace function public.validate_finance_workspace_preference()",
    );
    expect(sql).toContain(
      "active workspace must be one of the user memberships",
    );
    expect(sql).toContain(
      "create trigger trg_finance_workspace_preferences_membership_guard",
    );
    expect(sql).toContain(
      "before insert or update of user_id, active_household_id",
    );
    expect(sql).toContain(
      "create or replace function public.reconcile_finance_workspace_after_membership_delete()",
    );
    expect(sql).toContain(
      "create trigger trg_household_members_reconcile_active_workspace",
    );
    expect(sql).toContain("after delete on public.household_members");
  });

  it("repairs only missing or invalid preferences while preserving already-valid family selections", () => {
    expect(sql).toContain("for r in select u.id as user_id from auth.users u loop");
    expect(sql).toContain(
      "join public.household_members hm on hm.user_id = p.user_id and hm.household_id = p.active_household_id",
    );
    expect(sql).toContain(
      "if not exists ( select 1 from public.finance_workspace_preferences p",
    );
    expect(sql).toContain(
      "v_personal_household_id := public.ensure_personal_household_for_user(r.user_id)",
    );
  });

  it("makes current_household_id preference-first and refuses to guess between multiple memberships", () => {
    const resolver = functionSlice(
      "current_household_id()",
      "ensure_current_household()",
    );
    expect(resolver).toContain("p.active_household_id is not null");
    expect(resolver).toContain("hm.household_id = p.active_household_id");
    expect(resolver).toContain("select count(*)");
    expect(resolver).toContain("where member_count.user_id = auth.uid()");
    expect(resolver).toContain(") = 1");
    expect(resolver).not.toContain("where h.owner_user_id = auth.uid()");
    expect(resolver).not.toContain("order by h.created_at asc");
  });

  it("keeps mutating repair deterministic by restoring an invalid preference to the owned personal workspace", () => {
    const ensure = functionSlice(
      "ensure_current_household()",
      "accept_household_invite(p_invite_id uuid)",
    );
    expect(ensure).toContain(
      "v_personal_household_id := public.ensure_personal_household_for_user(v_user_id)",
    );
    expect(ensure).toContain("if v_active_household_id is null then");
    expect(ensure).toContain("v_active_household_id := v_personal_household_id");
    expect(ensure).toContain("finance_workspace_preferences");
  });

  it("accepts an invite and atomically makes the joined household active without merging personal finance rows", () => {
    const accept = functionSlice(
      "accept_household_invite(p_invite_id uuid)",
      "leave_household(p_household_id uuid)",
    );
    expect(accept).toContain("i.id = p_invite_id");
    expect(accept).toContain("lower(i.email) = v_email");
    expect(accept).toContain("on conflict (household_id, user_id) do update");
    expect(accept).toContain("active_household_id = excluded.active_household_id");
    expect(accept).toContain(
      "'active_household_id', v_invite.household_id",
    );
    expect(accept).not.toContain("delete from public.wallets");
    expect(accept).not.toContain("delete from public.transactions");
    expect(accept).not.toContain("delete from public.savings");
    expect(accept).not.toContain("delete from public.households");
  });

  it("repairs an active preference before leave/remove deletes the corresponding membership", () => {
    const leaving = functionSlice(
      "leave_household(p_household_id uuid)",
      "remove_household_member(p_user_id uuid)",
    );
    const removal = functionSlice(
      "remove_household_member(p_user_id uuid)",
      "stamp_finance_audit_log_insert()",
    );

    expect(leaving.indexOf("update public.finance_workspace_preferences")).toBeGreaterThan(-1);
    expect(leaving.indexOf("delete from public.household_members")).toBeGreaterThan(
      leaving.indexOf("update public.finance_workspace_preferences"),
    );
    expect(removal.indexOf("update public.finance_workspace_preferences")).toBeGreaterThan(-1);
    expect(removal.indexOf("delete from public.household_members")).toBeGreaterThan(
      removal.indexOf("update public.finance_workspace_preferences"),
    );
  });

  it("stamps audit identity from current_household_id rather than an arbitrary membership row", () => {
    const audit = functionSlice("stamp_finance_audit_log_insert()");
    expect(audit).toContain(
      "v_household_id := public.current_household_id()",
    );
    expect(audit).toContain("hm.user_id = v_actor_user_id");
    expect(audit).toContain("hm.household_id = v_household_id");
    expect(audit).not.toContain("limit 1");
    expect(audit).toContain("new.household_id := v_household_id");
    expect(audit).toContain(
      "new.finance_owner_user_id := v_finance_owner_user_id",
    );
    expect(audit).toContain("new.actor_user_id := v_actor_user_id");
  });

  it("keeps audit read isolation bound to the same current-household resolver", () => {
    expect(normalize(auditMigration)).toContain(
      "create policy finance_audit_log_household_select on public.finance_audit_log for select to authenticated using (household_id = public.current_household_id())",
    );
  });

  it("keeps frontend cache/provider reconciliation aligned with the server receipt", () => {
    expect(service).toContain('supabase.rpc("accept_household_invite"');
    expect(service).toContain("invalidateFinanceScopeCache();");
    expect(provider).toContain("const receipt = await acceptHouseholdInvite(inviteId);");
    expect(provider).toContain("await refresh();");
  });

  it("ships read-only checks for invalid preferences, multi-membership ambiguity and audit resolver definitions", () => {
    const verify = normalize(verification);
    expect(verify).toContain("invalid_active_preference_count");
    expect(verify).toContain("membership_count");
    expect(verify).toContain("current_household_id_definition");
    expect(verify).toContain("accept_household_invite_definition");
    expect(verify).toContain("audit_stamp_definition");
    expect(verify).toContain("active_membership_valid");
  });
});
