import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(
    __dirname,
    "../../../supabase/settings-recovery-integrity-1-backup-restore-guard.sql",
  ),
  "utf8",
);

const domains = [
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
  "net_worth_snapshots",
];

describe("SETTINGS-RECOVERY-INTEGRITY-1 SQL contract", () => {
  it("keeps every persisted domain inside the hardened restore boundary", () => {
    for (const domain of domains) {
      expect(sql).toContain(`'${domain}'`);
      expect(sql).toContain(`public.${domain}`);
    }
  });

  it("type-preflights before locking and locks the write surface before the first DELETE", () => {
    const preflight = sql.indexOf(
      "PERFORM 1 FROM jsonb_populate_recordset(NULL::public.net_worth_snapshots",
    );
    const lock = sql.indexOf("LOCK TABLE");
    const firstDelete = sql.indexOf(
      "DELETE FROM public.saving_transactions WHERE user_id = v_user_id",
    );

    expect(preflight).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(preflight);
    expect(firstDelete).toBeGreaterThan(lock);
    expect(sql).toContain("IN SHARE ROW EXCLUSIVE MODE");
  });

  it("post-verifies actual row counts before returning success", () => {
    const lastInsert = sql.indexOf(
      "INSERT INTO public.net_worth_snapshots",
    );
    const actualCounts = sql.indexOf("INTO v_actual_counts");
    const verification = sql.indexOf(
      "IF v_actual_counts IS DISTINCT FROM v_expected_counts",
    );
    const success = sql.indexOf("'restored', true", verification);

    expect(actualCounts).toBeGreaterThan(lastInsert);
    expect(verification).toBeGreaterThan(actualCounts);
    expect(success).toBeGreaterThan(verification);
    expect(sql).toContain("ERRCODE = 'MFB05'");
    expect(sql).toContain("'verified', true");
  });

  it("raises on verification mismatch so PostgreSQL rolls the whole function transaction back", () => {
    expect(sql).toContain("RAISE EXCEPTION 'Restore verification failed");
    expect(sql).not.toContain("EXCEPTION WHEN OTHERS THEN\n    RETURN");
  });
});
