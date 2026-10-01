import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("WALLET-RECONCILIATION-1 storage boundary", () => {
  const storageSource = readFileSync(
    path.resolve(__dirname, "financeStorage.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const auditSql = readFileSync(
    path.resolve(
      __dirname,
      "../../../supabase/audit-mutation-1-atomic-actor-attribution.sql",
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");

  function reconciliationSource() {
    const start = storageSource.indexOf(
      "export async function reconcileWalletBalance(",
    );
    const end = storageSource.indexOf(
      "\nexport type WalletDeleteErrorCode",
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return storageSource.slice(start, end);
  }

  it("uses an optimistic compare-and-set against the expected persisted balance", () => {
    const source = reconciliationSource();
    expect(source).toContain('.update({ balance: actualBalance })');
    expect(source).toContain('.eq("id", input.walletId)');
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.eq("balance", expectedBalance)');
    expect(source).toContain('.neq("type", "investment")');
    expect(source).toContain('.select("id,balance")');
  });

  it("returns a conflict instead of overwriting a balance changed by another mutation", () => {
    const source = reconciliationSource();
    expect(source).toContain('code: "conflict"');
    expect(source).toContain("data.length !== 1");
  });

  it("never manufactures a finance transaction for a reconciliation", () => {
    const source = reconciliationSource();
    expect(source).not.toContain('from("transactions")');
    expect(source).not.toContain("addTransaction(");
    expect(source).not.toContain("insert(");
  });

  it("normal wallet detail edits no longer write the balance column", () => {
    const start = storageSource.indexOf("export async function updateWallet(");
    const end = storageSource.indexOf(
      "\nexport type WalletReconciliationErrorCode",
      start,
    );
    const source = storageSource.slice(start, end);
    expect(source).toContain("name: updatedWallet.name");
    expect(source).toContain("type: updatedWallet.type");
    expect(source).not.toContain("toWalletRow(updatedWallet");
    expect(source).not.toContain("balance: updatedWallet.balance");
  });

  it("inherits the existing atomic finance audit trigger for wallet updates", () => {
    expect(auditSql).toContain(
      "AFTER INSERT OR UPDATE OR DELETE ON public.wallets",
    );
    expect(auditSql).toContain("INSERT INTO public.finance_audit_log");
    expect(auditSql).toContain("v_before := to_jsonb(OLD);");
    expect(auditSql).toContain("v_after := to_jsonb(NEW);");
  });
});
