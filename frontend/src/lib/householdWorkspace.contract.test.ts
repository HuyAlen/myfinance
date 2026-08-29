import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").toLowerCase();

const schema = read("supabase/schema.sql");
const migration = read(
  "frontend/supabase/household-workspace-1-multi-workspace-membership.sql",
);
const verification = read(
  "frontend/supabase/household-workspace-1-verification.sql",
);
const service = read("frontend/src/services/finance/householdService.ts");
const provider = read(
  "frontend/src/components/household/HouseholdProvider.tsx",
);
const card = read(
  "frontend/src/components/settings/HouseholdSettingsCard.tsx",
);
const header = read("frontend/src/components/layout/Header.tsx");
const financeStorage = read("frontend/src/services/finance/financeStorage.ts");
const realtime = read(
  "frontend/src/components/realtime/RealtimeProvider.tsx",
);

const migrationBody = migration
  .slice(
    migration.indexOf("BEGIN;") + "BEGIN;".length,
    migration.lastIndexOf("COMMIT;"),
  )
  .trim();
const overlayStartMarker =
  "-- HOUSEHOLD-WORKSPACE-1 CANONICAL OVERLAY - Fresh-install parity for the production forward migration.";
const overlayEndMarker = "-- END HOUSEHOLD-WORKSPACE-1 CANONICAL OVERLAY";
const overlayStart = schema.indexOf(overlayStartMarker);
const overlayEnd = schema.indexOf(overlayEndMarker, overlayStart);
const canonicalOverlay =
  overlayStart >= 0 && overlayEnd > overlayStart
    ? schema
        .slice(schema.indexOf("\n", overlayStart) + 1, overlayEnd)
        .trim()
    : "";
const sql = normalize(migration);

function functionSlice(name: string, nextName?: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? sql.indexOf(`create or replace function public.${nextName}`, start + 1)
    : -1;
  return sql.slice(start, end > start ? end : undefined);
}

describe("HOUSEHOLD-WORKSPACE-1 multi-workspace membership", () => {
  it("keeps the canonical fresh-install overlay in parity with the forward migration", () => {
    expect(overlayStart).toBeGreaterThan(-1);
    expect(overlayEnd).toBeGreaterThan(overlayStart);
    expect(normalize(canonicalOverlay)).toBe(normalize(migrationBody));
  });

  it("removes single-household-per-user uniqueness and stores one active workspace preference per auth identity", () => {
    expect(sql).toContain("alter table public.household_members drop constraint");
    expect(sql).toContain("unique (user_id)");
    expect(sql).toContain("create table if not exists public.finance_workspace_preferences");
    expect(sql).toContain("user_id uuid primary key references auth.users(id) on delete cascade");
    expect(sql).toContain("active_household_id uuid references public.households(id) on delete set null");
    expect(sql).toContain("revoke all on table public.finance_workspace_preferences from public, anon, authenticated");
  });

  it("recreates and preserves a personal workspace for every auth identity without deleting finance history", () => {
    const helper = functionSlice(
      "ensure_personal_household_for_user(p_user_id uuid)",
      "ensure_personal_household()",
    );
    expect(helper).toContain("where h.owner_user_id = p_user_id");
    expect(helper).toContain("on conflict (household_id, user_id) do update");
    expect(helper).toContain("seed_default_categories_for_user(p_user_id)");
    expect(sql).toContain("for r in select u.id from auth.users u loop");
    expect(sql).not.toContain("delete from public.wallets");
    expect(sql).not.toContain("delete from public.transactions");
    expect(sql).not.toContain("delete from public.savings");
  });

  it("derives read/write/admin finance scope from an active workspace that still has authenticated membership", () => {
    for (const name of [
      "current_household_id()",
      "current_household_role()",
      "current_finance_scope_owner_user_id()",
      "current_finance_write_owner_user_id()",
      "current_finance_admin_owner_user_id()",
    ]) {
      expect(sql).toContain(`create or replace function public.${name}`);
    }
    expect(sql).toContain("hm.user_id = auth.uid()");
    expect(sql).toContain("hm.household_id = p.active_household_id");
    expect(sql).toContain("hm.role in ('owner','member')");
    expect(sql).toContain("hm.role = 'owner'");
    expect(sql).toContain("create policy household_invites_select on public.household_invites");
    expect(sql).toContain("auth.jwt() ->> 'email'");
    expect(sql).toContain("alter publication supabase_realtime add table public.household_invites");
    expect(financeStorage).toContain("getCachedFinanceOwnerUserId");
    expect(realtime).toContain("financeOwnerUserId");
  });

  it("accepts a specific in-app invite only for the authenticated account email and does not auto-switch or merge data", () => {
    const accept = functionSlice(
      "accept_household_invite(p_invite_id uuid)",
      "accept_current_household_invite()",
    );
    expect(accept).toContain("i.id = p_invite_id");
    expect(accept).toContain("lower(i.email) = v_email");
    expect(accept).toContain("i.status = 'pending'");
    expect(accept).toContain("i.expires_at > now()");
    expect(accept).not.toContain("email_confirmed_at");
    expect(accept).toContain("on conflict (household_id, user_id) do update");
    expect(accept).toContain("intentionally do not switch active_household_id here");
    expect(accept).not.toContain("delete from public.categories");
    expect(accept).not.toContain("delete from public.household_members");
    expect(accept).not.toContain("delete from public.households");
  });

  it("supports explicit decline and workspace switching while validating membership server-side", () => {
    const switching = functionSlice(
      "switch_finance_workspace(p_household_id uuid)",
      "accept_household_invite(p_invite_id uuid)",
    );
    expect(switching).toContain("hm.user_id = v_user_id");
    expect(switching).toContain("hm.household_id = p_household_id");
    expect(switching).toContain("workspace membership not found");
    expect(switching).toContain("finance_workspace_preferences");
    expect(sql).toContain("create or replace function public.decline_household_invite(p_invite_id uuid)");
    expect(sql).toContain("set status = 'declined'");
  });

  it("lets non-owner members leave safely and immediately falls back to personal when the family was active", () => {
    const leaving = functionSlice(
      "leave_household(p_household_id uuid)",
      "remove_household_member(p_user_id uuid)",
    );
    expect(leaving).toContain("or v_role = 'owner'");
    expect(leaving).toContain("using errcode = 'mfh12'");
    expect(leaving).toContain("delete from public.household_members");
    expect(leaving).toContain("active_household_id = v_personal_household_id");
    expect(leaving).toContain("and active_household_id = p_household_id");
  });

  it("returns removed members to their personal workspace if the owner removes them", () => {
    const removal = functionSlice(
      "remove_household_member(p_user_id uuid)",
      "seed_default_categories()",
    );
    expect(removal).toContain("ensure_personal_household_for_user(p_user_id)");
    expect(removal).toContain("delete from public.household_members");
    expect(removal).toContain("active_household_id = v_target_personal_household_id");
  });

  it("bootstraps new users with composite membership plus an active personal preference", () => {
    const seed = functionSlice("seed_default_categories()");
    expect(seed).toContain("ensure_personal_household_for_user(new.id)");
    expect(seed).toContain("finance_workspace_preferences");
    expect(seed).toContain("on conflict (user_id) do nothing");
    expect(seed).not.toContain("on conflict (user_id) do update set household_id");
  });

  it("exposes all workspaces and incoming invites through service/provider without treating UI preference as authorization", () => {
    expect(service).toContain("export type FinanceWorkspace");
    expect(service).toContain("pendingInvites: HouseholdInvite[]");
    expect(service).toContain('supabase.rpc("accept_household_invite"');
    expect(service).toContain('supabase.rpc("decline_household_invite"');
    expect(service).toContain('supabase.rpc("switch_finance_workspace"');
    expect(service).toContain('supabase.rpc("leave_household"');
    expect(provider).toContain("activeWorkspace");
    expect(provider).toContain("personalWorkspace");
    expect(provider).toContain("household-invites:${authUserId}");
    expect(provider).toContain('table: "household_invites"');
    expect(provider).toContain("filter: `email=eq.${authEmail}`");
    expect(provider).toContain("window.addEventListener(\"focus\", scheduleRefresh)");
    expect(provider).toContain("document.addEventListener(\"visibilitychange\", scheduleRefresh)");
  });

  it("provides accept/decline, post-accept workspace choice, switching, and separate leave UX", () => {
    expect(card).toContain("Bạn có lời mời tham gia gia đình");
    expect(card).toContain("Tham gia");
    expect(card).toContain("Từ chối");
    expect(card).toContain("Cá nhân của tôi");
    expect(card).toContain("handleChooseJoinedFamily");
    expect(card).toContain("switchWorkspace");
    expect(card).toContain("handleLeave");
    expect(card).toContain("leaveHousehold");
    expect(card).toContain("aria-label={`R\u1eddi ${label}`}");
    expect(card).toContain("Dữ liệu gia đình không bị xóa");
    expect(card).toContain("Không cần xác nhận qua email");
    expect(card).not.toContain("hệ thống chưa tự gửi email mời");
  });

  it("surfaces pending family invitations in the global notification bell", () => {
    expect(header).toContain("useHousehold");
    expect(header).toContain("householdInviteNotifications");
    expect(header).toContain("householdContext?.pendingInvites");
    expect(header).toContain('title: "Lời mời gia đình"');
    expect(header).toContain('href: "/settings#settings-household"');
    expect(header).toContain("visibleNotifList");
  });

  it("ships a read-only structural verification gate for the deployed Supabase state", () => {
    const verify = normalize(verification);
    expect(verify).toContain("finance_workspace_preferences");
    expect(verify).toContain("accept_household_invite");
    expect(verify).toContain("switch_finance_workspace");
    expect(verify).toContain("leave_household");
    expect(verify).toContain("household_members_user_unique_constraints");
  });
});
