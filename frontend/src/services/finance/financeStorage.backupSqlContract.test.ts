import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/finance-data-2-atomic-backup-restore.sql"),
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
];

describe("FINANCE-DATA-2 SQL contract", () => {
  it("defines SECURITY INVOKER export and restore RPCs with authenticated-only grants", () => {
    expect(sql).toContain("FUNCTION public.export_finance_backup()");
    expect(sql).toContain("FUNCTION public.restore_finance_backup(p_backup jsonb)");
    expect(sql.match(/SECURITY INVOKER/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.export_finance_backup() FROM PUBLIC",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.restore_finance_backup(jsonb) FROM PUBLIC",
    );
  });

  it("covers every mandatory finance domain in the V2 snapshot", () => {
    for (const domain of domains) {
      expect(sql).toContain(`'${domain}'`);
      expect(sql).toContain(`public.${domain}`);
    }
  });

  it("rejects the legacy pf_* format and validates before the first destructive delete", () => {
    const validationIndex = sql.indexOf("FOREACH v_domain IN ARRAY v_required_domains");
    const firstDeleteIndex = sql.indexOf("DELETE FROM public.saving_transactions");

    expect(sql).toContain("'pf_wallets'");
    expect(sql).toContain("ERRCODE = 'MFB04'");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(firstDeleteIndex).toBeGreaterThan(validationIndex);
  });

  it("restores raw snapshots directly instead of replaying movement RPCs", () => {
    expect(sql).toContain("INSERT INTO public.forex_cash_transactions");
    expect(sql).toContain("INSERT INTO public.saving_transactions");
    expect(sql).not.toContain("addForexCashTransaction");
    expect(sql).not.toContain("create_saving_movement(");
    expect(sql).not.toContain("create_finance_transaction(");
  });
});
