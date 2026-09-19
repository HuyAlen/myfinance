import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("FOREX-BALANCE-ASOF-1 contracts", () => {
  const finance = readFileSync(
    path.resolve(__dirname, "financeCalculations.ts"),
    "utf8",
  );
  const storage = readFileSync(
    path.resolve(__dirname, "financeStorage.ts"),
    "utf8",
  );
  const types = readFileSync(
    path.resolve(__dirname, "../../types/finance.ts"),
    "utf8",
  );
  const schema = readFileSync(
    path.resolve(__dirname, "../../../../supabase/schema.sql"),
    "utf8",
  );
  const migration = readFileSync(
    path.resolve(__dirname, "../../../supabase/forex-balance-asof-1.sql"),
    "utf8",
  );

  it("defines immutable per-account Balance history with household-scoped reads", () => {
    for (const sql of [schema, migration]) {
      const normalizedSql = sql.replace(/\s+/g, " ");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.forex_balance_snapshots");
      expect(sql).toContain("forex_account_id");
      expect(normalizedSql).toContain("balance numeric NOT NULL");
      expect(sql).toContain("source_transaction_id");
      expect(sql).toContain("captured_at");
      expect(normalizedSql).toContain("source IN ('manual','deposit','withdrawal','backfill')");
      expect(normalizedSql).toContain("user_id = public.current_finance_scope_owner_user_id()");
      expect(sql).toContain("REVOKE ALL ON TABLE public.forex_balance_snapshots");
      expect(sql).toContain("GRANT SELECT ON TABLE public.forex_balance_snapshots TO authenticated");
    }
  });

  it("seeds one deployment-time baseline only for accounts with an authoritative Balance", () => {
    expect(migration).toContain("INSERT INTO public.forex_balance_snapshots");
    expect(migration).toContain("fa.current_equity IS NOT NULL");
    expect(migration).toContain("'backfill'");
    expect(migration).toContain("NOT EXISTS");
  });

  it("exposes a typed snapshot read model bounded by the exact cutoff", () => {
    expect(types).toContain("export type ForexBalanceSnapshotSource");
    expect(types).toContain("export type ForexBalanceSnapshot");
    expect(storage).toContain("export async function getForexBalanceSnapshotsUpTo(");
    expect(storage).toContain('.from("forex_balance_snapshots")');
    expect(storage).toContain('.eq("user_id", userId)');
    expect(storage).toContain('.lte("captured_at", cutoffAt)');
  });

  it("keeps historical Balance snapshot-driven and explicitly refuses funding fallback", () => {
    const normalizedFinance = finance.replace(/\r\n/g, "\n");
    const start = normalizedFinance.indexOf(
      "export function calculateForexPerformanceAsOf(",
    );
    const end = normalizedFinance.indexOf("/**\n * Gross Forex funding", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const asOfBlock = normalizedFinance.slice(start, end);

    expect(finance).toContain("export function getForexBalanceAsOf(");
    expect(asOfBlock).toContain("const assetValue = balance;");
    expect(asOfBlock).toContain("const totalBalance = hasCompleteBalance ? knownBalanceTotal : null;");
    expect(asOfBlock).not.toContain("currentEquity");
    expect(asOfBlock).not.toContain("Math.max(0, netFunding)");
  });
});