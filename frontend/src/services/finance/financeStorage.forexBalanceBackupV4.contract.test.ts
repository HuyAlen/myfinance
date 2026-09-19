import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    __dirname,
    "../../../supabase/forex-balance-asof-crosspage-1.sql",
  ),
  "utf8",
).replace(/\r\n?/g, "\n");

describe("FOREX-BALANCE-ASOF-CROSSPAGE-1 backup V4", () => {
  it("exports Forex Balance snapshots as a first-class V4 persisted domain", () => {
    expect(sql).toContain("'version', 4");
    expect(sql).toContain("'forex_balance_snapshots'");
    expect(sql).toContain("FROM public.forex_balance_snapshots r");
    expect(sql).toContain("ORDER BY r.captured_at, r.id");
  });

  it("keeps V2/V3 restore compatibility without fabricating historical Balance", () => {
    expect(sql).toContain("IF v_version NOT IN (2, 3, 4)");
    expect(sql).toContain("v_required_domains_v3");
    expect(sql).toContain("v_required_domains_v4");
    expect(sql).toContain("ELSIF v_version = 3 THEN");
    expect(sql).toContain("'forex_balance_snapshots', '[]'::jsonb");
  });

  it("preflights and locks snapshot history before destructive restore writes", () => {
    const preflight = sql.indexOf(
      "jsonb_populate_recordset(NULL::public.forex_balance_snapshots",
    );
    const lock = sql.indexOf("LOCK TABLE");
    const firstDelete = sql.indexOf(
      "DELETE FROM public.forex_balance_snapshots WHERE user_id = v_user_id",
    );
    expect(preflight).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(preflight);
    expect(firstDelete).toBeGreaterThan(lock);
    expect(sql).toContain("public.forex_balance_snapshots,");
  });

  it("restores raw snapshot rows only after their account and cash-ledger parents", () => {
    const accountInsert = sql.indexOf("INSERT INTO public.forex_accounts");
    const cashInsert = sql.indexOf("INSERT INTO public.forex_cash_transactions");
    const snapshotInsert = sql.indexOf("INSERT INTO public.forex_balance_snapshots");
    expect(accountInsert).toBeGreaterThan(-1);
    expect(cashInsert).toBeGreaterThan(accountInsert);
    expect(snapshotInsert).toBeGreaterThan(cashInsert);
    expect(sql).not.toContain("capture_forex_balance_snapshot(");
  });

  it("post-verifies Forex Balance snapshot cardinality in the atomic receipt", () => {
    expect(sql).toContain(
      "'forex_balance_snapshots', jsonb_array_length(v_data->'forex_balance_snapshots')",
    );
    expect(sql).toContain(
      "'forex_balance_snapshots', (SELECT count(*) FROM public.forex_balance_snapshots WHERE user_id = v_user_id)",
    );
    expect(sql).toContain("IF v_actual_counts IS DISTINCT FROM v_expected_counts");
    expect(sql).toContain("ERRCODE = 'MFB05'");
  });
});
