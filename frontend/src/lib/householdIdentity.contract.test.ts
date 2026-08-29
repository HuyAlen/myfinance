import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");
const normalize = (value: string) => value.replace(/\s+/g, " ").toLowerCase();

const schema = read("supabase/schema.sql");
const migration = read(
  "frontend/supabase/household-identity-1-shared-finance-workspace.sql",
);
const financeStorage = read("frontend/src/services/finance/financeStorage.ts");
const householdService = read(
  "frontend/src/services/finance/householdService.ts",
);
const provider = read(
  "frontend/src/components/household/HouseholdProvider.tsx",
);
const realtime = read(
  "frontend/src/components/realtime/RealtimeProvider.tsx",
);
const layout = read("frontend/app/layout.tsx");
const settings = read(
  "frontend/src/components/settings/SettingsPage.tsx",
);
const householdSettings = read(
  "frontend/src/components/settings/HouseholdSettingsCard.tsx",
);

const migrationBody = migration
  .slice(migration.indexOf("BEGIN;") + "BEGIN;".length, migration.lastIndexOf("COMMIT;"))
  .trim();
const canonicalOverlayStart = schema.indexOf(
  "-- Fresh-install parity for the production forward migration.",
);
const canonicalOverlayEnd = schema.indexOf(
  "-- END HOUSEHOLD-IDENTITY-1 CANONICAL OVERLAY",
);
const canonicalOverlay = schema
  .slice(
    schema.indexOf("\n", canonicalOverlayStart) + 1,
    canonicalOverlayEnd,
  )
  .trim();

const normalizedSchema = normalize(schema);
const normalizedMigration = normalize(migration);

describe("HOUSEHOLD-IDENTITY-1 shared finance workspace", () => {
  it("adds one-household-per-user membership and email-bound invitations to migration + canonical schema", () => {
    for (const sql of [normalizedMigration, normalizedSchema]) {
      expect(sql).toContain("create table if not exists public.households");
      expect(sql).toContain("create table if not exists public.household_members");
      expect(sql).toContain("create table if not exists public.household_invites");
      expect(sql).toContain("user_id uuid not null unique references auth.users(id)");
      expect(sql).toContain("role in ('owner','member','viewer')");
      expect(sql).toContain("status in ('pending','accepted','revoked','expired')");
    }
  });

  it("keeps finance user_id as a stable household-owner scope while auth.uid remains the real member identity", () => {
    expect(normalizedMigration).toContain(
      "create or replace function public.current_finance_scope_owner_user_id()",
    );
    expect(normalizedMigration).toContain(
      "create or replace function public.current_finance_write_owner_user_id()",
    );
    expect(normalizedMigration).toContain(
      "create or replace function public.current_finance_admin_owner_user_id()",
    );
    expect(normalizedMigration).toContain(
      "using (user_id = public.current_finance_scope_owner_user_id())",
    );
    expect(normalizedMigration).toContain(
      "with check (user_id = public.current_finance_write_owner_user_id())",
    );
    expect(normalizedMigration).toContain(
      "v_user_id uuid := auth.uid()",
    );
    expect(normalizedMigration).toContain(
      "where hm.user_id = auth.uid()",
    );
  });

  it("adapts every mutation RPC to write scope, backup export to read scope, and destructive recovery/demo seed to owner scope", () => {
    for (const rpc of [
      "create_finance_transaction",
      "update_finance_transaction",
      "delete_finance_transaction",
      "delete_wallet_atomic",
      "create_saving_account",
      "create_saving_movement",
      "delete_saving_account",
      "delete_category_atomic",
      "create_forex_cash_transaction",
      "update_forex_cash_transaction",
      "delete_forex_cash_transaction",
      "delete_forex_account_atomic",
      "clone_previous_month_budgets_atomic",
    ]) {
      expect(normalizedMigration).toContain(`'${rpc}'`);
    }
    expect(normalizedMigration).toContain(
      "replace(v_definition, 'auth.uid()', 'public.current_finance_write_owner_user_id()')",
    );
    expect(normalizedMigration).toContain("p.proname = 'export_finance_backup'");
    expect(normalizedMigration).toContain(
      "public.current_finance_scope_owner_user_id()",
    );
    expect(normalizedMigration).toContain(
      "array['restore_finance_backup','seed_finance_demo_data']",
    );
    expect(normalizedMigration).toContain(
      "public.current_finance_admin_owner_user_id()",
    );
  });


  it("keeps the canonical fresh-install overlay in exact normalized parity with the forward migration", () => {
    expect(canonicalOverlayStart).toBeGreaterThan(-1);
    expect(canonicalOverlayEnd).toBeGreaterThan(canonicalOverlayStart);
    expect(normalize(canonicalOverlay)).toBe(normalize(migrationBody));
  });

  it("binds invite acceptance to a confirmed authenticated email instead of auto-claiming an invite during signup", () => {
    const acceptStart = normalizedMigration.indexOf(
      "create or replace function public.accept_current_household_invite()",
    );
    const acceptEnd = normalizedMigration.indexOf(
      "create or replace function public.revoke_household_invite",
      acceptStart,
    );
    const acceptFunction = normalizedMigration.slice(acceptStart, acceptEnd);
    expect(acceptFunction).toContain("u.email_confirmed_at");
    expect(acceptFunction).toContain("using errcode = 'mfh10'");

    const seedStart = normalizedMigration.indexOf(
      "create or replace function public.seed_default_categories()",
    );
    const seedEnd = normalizedMigration.indexOf(
      "adapt existing finance rpc ownership",
      seedStart,
    );
    const signupBootstrap = normalizedMigration.slice(seedStart, seedEnd);
    expect(signupBootstrap).toContain("insert into public.households");
    expect(signupBootstrap).toContain("seed_default_categories_for_user(new.id)");
    expect(signupBootstrap).not.toContain("household_invites");
    expect(householdService).toContain('case "MFH10"');
  });

  it("fails closed instead of auto-merging an invited user's existing finance history", () => {
    expect(normalizedMigration).toContain(
      "raise exception 'existing workspace cannot be auto-merged' using errcode = 'mfh08'",
    );
    expect(normalizedMigration).toContain("count(distinct c.name)");
    expect(normalizedMigration).toContain("v_category_count <> 15");
    expect(normalizedMigration).toContain("c.is_recurring is distinct from false");
    expect(normalizedMigration).toContain("c.default_wallet_id is not null");
    for (const table of [
      "wallets",
      "transactions",
      "debts",
      "goals",
      "budgets",
      "investments",
      "savings",
      "saving_transactions",
      "forex_accounts",
      "forex_cash_transactions",
      "net_worth_snapshots",
    ]) {
      expect(normalizedMigration).toContain(
        `exists (select 1 from public.${table} where user_id = v_user_id)`,
      );
    }
  });

  it("resolves frontend finance reads/writes and realtime subscriptions through the same finance-owner scope", () => {
    expect(financeStorage).toContain(
      'import { getCachedFinanceOwnerUserId } from "@/src/services/finance/householdService";',
    );
    expect(financeStorage).toContain(
      "const authUserId = session?.user?.id ?? null;",
    );
    expect(financeStorage).toContain(
      "return getCachedFinanceOwnerUserId(authUserId) ?? authUserId;",
    );
    expect(householdService).toContain('"get_finance_scope_owner_user_id"');
    expect(realtime).toContain("financeOwnerUserId");
    expect(realtime).toContain("`user_id=eq.${financeOwnerUserId}`");
  });

  it("mounts household identity before realtime and exposes membership in Settings", () => {
    expect(layout).toContain("<HouseholdProvider>");
    expect(layout.indexOf("<HouseholdProvider>")).toBeLessThan(
      layout.indexOf("<RealtimeProvider>"),
    );
    expect(provider).toContain("getHouseholdContext");
    expect(provider).toContain("contextAuthUserId");
    expect(provider).toContain("const authUserId = user?.id ?? null;");
    expect(provider).toContain(
      "contextAuthUserId === authUserId ? context : null",
    );
    expect(settings).toContain('{ id: "household", label: "Gia đình", icon: Users }');
    expect(settings).toContain("<HouseholdSettingsCard />");
    expect(householdSettings).toContain("switchWorkspace");
    expect(householdSettings).toContain("handleLeave");
    expect(householdSettings).toContain("leaveHousehold");
    expect(householdSettings).toContain("aria-label={`R\u1eddi ${label}`}");
  });

  it("does not turn AI persistence into household-shared data", () => {
    expect(normalizedSchema).toContain(
      "create policy ai_user_settings_select on public.ai_user_settings for select using (auth.uid() = user_id)",
    );
    expect(normalizedSchema).toContain(
      "create policy ai_pending_actions_select on public.ai_pending_actions for select using (auth.uid() = user_id)",
    );
    expect(normalizedMigration).not.toContain(
      "drop policy if exists ai_user_settings",
    );
  });
});
