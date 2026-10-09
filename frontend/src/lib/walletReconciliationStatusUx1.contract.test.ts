import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const sql = readFileSync(path.join(root, "frontend/supabase/wallet-reconciliation-status-ux-1-apply.sql"), "utf8");
const verify = readFileSync(path.join(root, "frontend/supabase/wallet-reconciliation-status-ux-1-verify.sql"), "utf8");
const canonical = readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
const originalMigration = readFileSync(path.join(root, "frontend/supabase/wallet-reconciliation-center-1.sql"), "utf8");
const storage = readFileSync(path.join(root, "frontend/src/services/finance/financeStorage.ts"), "utf8");
const page = readFileSync(path.join(root, "frontend/src/components/wallets/WalletsPage.tsx"), "utf8");
const center = readFileSync(path.join(root, "frontend/src/components/wallets/WalletReconciliationCenter.tsx"), "utf8");

function functionBody(source: string, name: string) {
  const replaceIndex = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const start = replaceIndex >= 0
    ? replaceIndex
    : source.indexOf(`CREATE FUNCTION public.${name}(`);
  const end = start >= 0 ? source.indexOf("$$;", start) : -1;
  return start < 0 || end < 0 ? "" : source.slice(start, end + 3);
}

describe("WALLET-RECONCILIATION-STATUS-UX-1 SQL", () => {
  it("migrates two revision columns without changing any finance balances or historical receipts", () => {
    expect(sql).toContain("ALTER TABLE public.wallets");
    expect(sql).toContain("ADD COLUMN balance_revision bigint NOT NULL DEFAULT 0");
    expect(sql).toContain("ALTER TABLE public.wallet_reconciliations");
    expect(sql).toContain("ADD COLUMN balance_revision bigint;");
    expect(sql).not.toMatch(/\bUPDATE\s+public\.wallet_reconciliations\b/i);
    expect(sql).not.toMatch(/\bUPDATE\s+public\.transactions\b/i);
    expect(sql).not.toContain("INSERT INTO public.transactions");
  });

  it("stamps only changed wallet balances; prevents a client overwriting revision", () => {
    const fn = functionBody(sql, "wallet_balance_revision_guard");
    for (const marker of [
      "NEW.balance IS DISTINCT FROM OLD.balance",
      "NEW.balance_revision := OLD.balance_revision + 1",
      "NEW.balance_revision := OLD.balance_revision",
      "NEW.balance_revision := 0",
    ]) expect(fn).toContain(marker);
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.wallets");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("in an equal-balance confirmation, creates a receipt but does not UPDATE wallet", () => {
    const fn = functionBody(sql, "reconcile_wallet_balance_atomic");
    expect(fn).toContain("FOR UPDATE;");
    expect(fn).toContain("current_finance_write_owner_user_id()");
    expect(fn).toContain("v_wallet.balance IS DISTINCT FROM p_expected_balance");
    expect(fn).toContain("ERRCODE = 'MFR02'");
    expect(fn).toContain("v_balance_revision := v_wallet.balance_revision;");
    expect(fn).toMatch(/IF p_actual_balance IS DISTINCT FROM p_expected_balance THEN\s*UPDATE public\.wallets/);
    expect(fn).toContain("RETURNING balance_revision INTO v_balance_revision");
    expect(fn).toContain("INSERT INTO public.wallet_reconciliations");
    expect(fn).toContain("v_note, v_actor_user_id, v_balance_revision");
    expect(fn).not.toContain("No reconciliation needed");
  });

  it("keeps canonical schema and standalone migration aligned with reviewed RPC", () => {
    const canonicalFn = functionBody(canonical, "reconcile_wallet_balance_atomic");
    const initialFn = functionBody(originalMigration, "reconcile_wallet_balance_atomic");
    expect(canonicalFn).toBe(initialFn);
    for (const body of [canonicalFn, initialFn]) {
      expect(body).toContain("v_balance_revision := v_wallet.balance_revision");
      expect(body).toContain("IF p_actual_balance IS DISTINCT FROM p_expected_balance THEN");
      expect(body).toContain("RETURNING balance_revision INTO v_balance_revision");
    }
    expect(canonical).toContain("balance_revision bigint NOT NULL DEFAULT 0");
    expect(canonical).toContain("balance_revision bigint,");
    expect(originalMigration).toContain("balance_revision bigint,");
    expect(canonical).toContain("CREATE TRIGGER trg_wallet_balance_revision");
  });

  it("keeps the ACL and RLS boundary, requires approved deployment", () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
    expect(sql).toContain("lock_timeout");
    expect(sql).toContain("statement_timeout");
    expect(sql).toContain("RAISE EXCEPTION 'WRSTATUS01:");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reconcile_wallet_balance_atomic");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reconcile_wallet_balance_atomic");
    expect(sql).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
    expect(sql).not.toMatch(/\bALTER DEFAULT PRIVILEGES\b/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("has a single read-only verification grid using only pg catalogs", () => {
    const uncommented = verify
      .replace(/--[^\n]*/g, " ")
      .replace(/'(?:''|[^'])*'/g, "''");
    expect(uncommented.trim()).toMatch(/^WITH\s/i);
    expect((uncommented.match(/;/g) ?? []).length).toBe(1);
    expect(uncommented).not.toMatch(/\b(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|DO|NOTIFY|BEGIN|COMMIT)\b/i);
    expect(verify).toContain("failed_checks");
    expect(verify).toContain("passed_checks");
    expect(verify).toContain("COVERAGE_ANON_DENIED");
    expect(verify).toContain("RECONCILE_RPC_EQUAL_CONFIRMATION");
  });
});

describe("WALLET-RECONCILIATION-STATUS-UX-1 history projection", () => {
  it("projects balance_revision in reconciliation history for the typed receipt mapper", () => {
    const start = storage.indexOf("export async function getWalletReconciliations(");
    const end = storage.indexOf("WALLET-RECONCILIATION-COVERAGE-SSOT-1", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(storage.slice(start, end)).toContain(
      "reconciled_at,created_at,balance_revision",
    );
  });
});


describe("WALLET-RECONCILIATION-STATUS-UX-1 client", () => {
  it("does not reject matching balances before the authoritative RPC runs", () => {
    const start = storage.indexOf("export async function reconcileWalletBalance(");
    const end = storage.indexOf("export type WalletDeleteErrorCode", start);
    const fn = storage.slice(start, end);
    expect(fn).toContain('supabase.rpc("reconcile_wallet_balance_atomic"');
    expect(fn).not.toContain("if (actualBalance === expectedBalance) {");
    expect(fn).toContain("p_expected_balance");
  });

  it("exposes zero-difference confirmation in mobile modal and success feedback", () => {
    expect(page).toContain("Xác nhận số dư khớp");
    expect(page).toContain("result.difference === 0");
    expect(page).not.toContain("Number(reconcileBalance) === reconcileTarget.balance\n                     }");
    expect(page).toContain("reconciliationRecordByWallet");
    expect(page).toContain("walletReconciliationStatusLabels[reconciliationStatus]");
  });

  it("lists each wallet with filterable status, never calls a mutation while rendering", () => {
    expect(center).toContain("Trạng thái từng ví");
    expect(center).toContain("setFilter(item.value)");
    expect(center).toContain("getWalletReconciliationStatus(wallet, receipt)");
    expect(center).toContain("!isLoading && !error");
    expect(center).toContain("historyRecords.slice(0, 5).map");
    expect(center).not.toContain("reconcileWalletBalance(");
  });
});
