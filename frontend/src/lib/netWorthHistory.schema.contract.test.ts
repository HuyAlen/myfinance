import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/networth-history-1-canonical-net-worth-snapshots.sql",
);
const schemaPath = path.resolve(__dirname, "../../../supabase/schema.sql");
const migration = readFileSync(migrationPath, "utf8");
const schema = readFileSync(schemaPath, "utf8");

function normalize(input: string) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

const normalizedMigration = normalize(migration);
const normalizedSchema = normalize(schema);

const sourceTables = [
  "wallets",
  "savings",
  "investments",
  "debts",
  "forex_accounts",
  "forex_cash_transactions",
] as const;

describe("NETWORTH-HISTORY-1 canonical snapshot schema/migration", () => {
  it("creates one unique user/month snapshot row with user-scoped read-only RLS", () => {
    expect(normalizedMigration).toContain(
      "create table if not exists public.net_worth_snapshots",
    );
    expect(normalizedMigration).toContain(
      "constraint net_worth_snapshots_user_month_key unique (user_id, snapshot_month)",
    );
    expect(normalizedMigration).toContain(
      "alter table public.net_worth_snapshots enable row level security",
    );
    expect(normalizedMigration).toContain("using (auth.uid() = user_id)");
    expect(normalizedMigration).toContain(
      "revoke all on table public.net_worth_snapshots from public, anon, authenticated",
    );
    expect(normalizedMigration).toContain(
      "grant select on table public.net_worth_snapshots to authenticated",
    );
    expect(normalizedMigration).toContain(
      "revoke all on function public.capture_current_net_worth_snapshot(uuid) from public, anon, authenticated",
    );
    expect(normalizedMigration).not.toContain(
      "grant execute on function public.capture_current_net_worth_snapshot(uuid) to authenticated",
    );
    expect(normalizedMigration).not.toContain(
      "grant insert on table public.net_worth_snapshots to authenticated",
    );
  });

  it("recomputes every live Net Worth component and preserves Forex equity/fallback semantics", () => {
    expect(normalizedMigration).toContain("sum(w.balance)");
    expect(normalizedMigration).toContain("sum(s.balance)");
    expect(normalizedMigration).toContain('sum(i."currentvalue")');
    expect(normalizedMigration).toContain('sum(d."remainingamount")');
    expect(normalizedMigration).toContain("when fa.current_equity is not null then fa.current_equity");
    expect(normalizedMigration).toContain("when fct.type = 'deposit' then fct.amount");
    expect(normalizedMigration).toContain("when fct.type = 'withdrawal' then -fct.amount");
    expect(normalizedMigration).toContain("greatest(coalesce(fct.fee, 0), 0)");
    expect(normalizedMigration).toContain(
      "v_total_assets := v_cash_and_wallets + v_savings + v_investments + v_forex",
    );
    expect(normalizedMigration).toContain("v_total_assets - v_total_debt");
  });

  it("captures current state atomically from every asset/liability source table", () => {
    for (const table of sourceTables) {
      expect(normalizedMigration).toContain(
        `after insert or update or delete on public.${table}`,
      );
    }
    expect(normalizedMigration).toContain(
      "perform public.capture_current_net_worth_snapshot(v_user_id)",
    );
  });

  it("backfills only the current month and never fabricates older months", () => {
    expect(normalizedMigration).toContain(
      "v_snapshot_month date := date_trunc('month', current_date)::date",
    );
    expect(normalizedMigration).not.toContain("generate_series");
    expect(normalizedMigration).not.toContain("gettransactionnetworthimpact");
    expect(normalizedMigration).not.toContain("getsavingtransactionnetworthimpact");

    const baselineStart = normalizedMigration.indexOf(
      "one truthful baseline for existing users. no earlier month is synthesized",
    );
    expect(baselineStart).toBeGreaterThanOrEqual(0);
    const baselineWindow = normalizedMigration.slice(baselineStart, baselineStart + 1500);
    expect(baselineWindow).toContain(
      "perform public.capture_current_net_worth_snapshot(r.user_id)",
    );
    expect(baselineWindow).not.toContain("snapshot_month -");
  });

  it("upgrades backup to V3, accepts V2, restores history raw, and baselines only when history is absent", () => {
    expect(normalizedMigration).toContain("'version', 3");
    expect(normalizedMigration).toContain("'net_worth_snapshots'");
    expect(normalizedMigration).toContain("if v_version not in (2, 3) then");
    expect(normalizedMigration).toContain(
      "if v_version = 2 then v_data := v_data || jsonb_build_object('net_worth_snapshots', '[]'::jsonb)",
    );

    const deleteHistory = normalizedMigration.indexOf(
      "delete from public.net_worth_snapshots where user_id = v_user_id",
    );
    const insertHistory = normalizedMigration.indexOf(
      "insert into public.net_worth_snapshots select * from jsonb_populate_recordset",
    );
    expect(deleteHistory).toBeGreaterThanOrEqual(0);
    expect(insertHistory).toBeGreaterThan(deleteHistory);
    expect(normalizedMigration.slice(insertHistory, insertHistory + 1800)).toContain(
      "perform public.capture_current_net_worth_snapshot(v_user_id)",
    );
  });

  it("makes snapshot history participate in demo-seed fail-closed integrity", () => {
    expect(normalizedMigration).toContain(
      "exists (select 1 from public.net_worth_snapshots where user_id = v_user_id)",
    );
  });

  it("ships the same canonical contract in the fresh-install schema", () => {
    for (const fragment of [
      "create table if not exists public.net_worth_snapshots",
      "function public.capture_current_net_worth_snapshot",
      "trg_wallets_capture_net_worth",
      "trg_forex_cash_transactions_capture_net_worth",
      "'net_worth_snapshots'",
    ]) {
      expect(normalizedSchema).toContain(fragment);
    }
  });
});
