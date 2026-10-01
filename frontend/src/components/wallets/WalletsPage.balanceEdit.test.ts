import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WALLET-RECONCILIATION-1 supersedes WALLET-BALANCE-EDIT-1.
 * Existing wallet balances are no longer edited inside the generic wallet
 * details form. Balance correction has a dedicated reconciliation workflow
 * with optimistic concurrency and the existing canonical audit trigger.
 */
describe("WalletsPage balance edits are reconciliation-only", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  function extractHandleSubmitSource() {
    const start = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n  async function handleDelete(", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("keeps opening balance editable for a new wallet", () => {
    expect(source).toContain('{form.id ? (');
    expect(source).toContain("Số dư ban đầu");
    expect(source).toContain("<CurrencyInput");
  });

  it("renders an existing wallet balance as read-only identity context", () => {
    expect(source).toContain("Số dư hiện tại");
    expect(source).toContain(
      "Số dư chỉ thay đổi qua Đối soát để tránh ghi đè im lặng lên dữ liệu giao dịch.",
    );
  });

  it("generic edit preserves the authoritative existing balance", () => {
    const fnSource = extractHandleSubmitSource();
    expect(fnSource).toContain(
      "const balance = form.id ? existingWallet!.balance : Number(form.balance);",
    );
    expect(fnSource).toContain(
      "if (!form.id && (Number.isNaN(balance) || balance < 0)) {",
    );
  });

  it("still creates a new wallet with its opening balance", () => {
    const fnSource = extractHandleSubmitSource();
    expect(fnSource).toContain("await addWallet(wallet)");
    expect(fnSource).toContain("balance,");
  });

  it("existing-wallet details still use updateWallet but never reconcile through a fake transaction", () => {
    const fnSource = extractHandleSubmitSource();
    expect(fnSource).toContain("await updateWallet(wallet)");
    expect(fnSource).not.toContain("addTransaction(");
    expect(fnSource).not.toContain("reconcileWalletBalance(");
  });

  it("the dedicated reconciliation handler owns balance correction", () => {
    expect(source).toContain("async function handleReconcileSubmit(");
    expect(source).toContain("await reconcileWalletBalance({");
    expect(source).toContain("expectedBalance: reconcileTarget.balance");
  });

  it("wallet-to-wallet transfer remains on Finance Engine v2", () => {
    const start = source.indexOf(
      "async function handleTransferSubmit(event: React.FormEvent) {",
    );
    const end = source.indexOf(
      "async function handleReconcileSubmit(event: React.FormEvent) {",
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const transferSource = source.slice(start, end);
    expect(transferSource).toContain("await addTransaction(transaction)");
    expect(transferSource).not.toContain("reconcileWalletBalance(");
  });
});
