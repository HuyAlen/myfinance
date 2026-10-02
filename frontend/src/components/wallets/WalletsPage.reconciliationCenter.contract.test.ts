import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) =>
  readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const page = read("src/components/wallets/WalletsPage.tsx");
const storage = read("src/services/finance/financeStorage.ts");
const databaseTypes = read("src/lib/database.types.ts");
const center = read("src/components/wallets/WalletReconciliationCenter.tsx");
const sql = read("supabase/wallet-reconciliation-center-1.sql");

describe("WALLET-RECONCILIATION-CENTER-1", () => {
  it("uses a durable atomic RPC instead of a naked wallet balance update", () => {
    expect(storage).toContain('supabase.rpc("reconcile_wallet_balance_atomic"');
    expect(sql).toContain("FOR UPDATE;");
    expect(sql).toContain("INSERT INTO public.wallet_reconciliations");
    expect(sql).toContain("UPDATE public.wallets");
  });

  it("persists expected, actual, delta provenance without creating a transaction", () => {
    expect(sql).toContain("expected_balance");
    expect(sql).toContain("actual_balance");
    expect(sql).toContain("difference numeric GENERATED ALWAYS AS");
    expect(sql).not.toContain("INSERT INTO public.transactions");
  });

  it("keeps reconciliation household-scoped and write-role gated", () => {
    expect(sql).toContain("current_finance_scope_owner_user_id()");
    expect(sql).toContain("current_finance_write_owner_user_id()");
    expect(sql).toContain("actor_user_id");
  });

  it("loads reconciliation receipts as a separate Wallet page dependency", () => {
    expect(page).toContain("getWalletReconciliations");
    expect(page).toContain("reconciliationHistoryTask");
    expect(page).toContain("<WalletReconciliationCenter");
  });

  it("supports an optional reconciliation note and conflict-safe retry", () => {
    expect(page).toContain("reconcileNote");
    expect(page).toContain("note: reconcileNote");
    expect(page).toContain('result.code === "conflict"');
  });

  it("renders cross-wallet coverage and recent receipt history", () => {
    expect(center).toContain('data-wallet-reconciliation-center="true"');
    expect(center).toContain("Lịch sử đối soát gần đây");
    expect(center).toContain("Chưa đối soát");
    expect(center).toContain("Đối soát tiếp theo");
  });

  it("extends generated database types for the reconciliation table and RPC", () => {
    expect(databaseTypes).toContain("WalletReconciliationRow");
    expect(databaseTypes).toContain("wallet_reconciliations:");
    expect(databaseTypes).toContain("reconcile_wallet_balance_atomic:");
  });
});
