import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WALLET-BALANCE-EDIT-1 — Allow Manual Editing of Wallet Balance.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching WalletsPage.loadState.test.ts's
 * established pattern for this file.
 *
 * Proven architecture (see the investigation cited in the final report):
 * `wallet.balance` is a persisted column, atomically incremented/decremented
 * by addTransaction()/updateTransaction()/deleteTransaction() — never
 * recomputed from a transaction sum. Editing it is therefore a direct
 * correction via the SAME updateWallet() call already used for every other
 * wallet field (name/type), not a fake transaction — so there is no new
 * transaction type, no risk of polluting income/expense/cash-flow reports,
 * and no way to duplicate a transfer's effect on another wallet.
 */
describe("WalletsPage allows editing an existing wallet's balance (WALLET-BALANCE-EDIT-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  function extractHandleSubmitSource() {
    const start = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n  async function handleDelete(", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("the balance CurrencyInput is no longer disabled for an existing wallet", () => {
    const start = source.indexOf("{form.id ? \"Số dư hiện tại\"");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("</div>", start);
    const fieldSource = source.slice(start, end);

    expect(fieldSource).not.toContain("disabled={Boolean(form.id)}");
    expect(fieldSource).not.toContain("disabled");
  });

  it("openEditForm initializes the balance field from the wallet's canonical balance, not stale local state", () => {
    const start = source.indexOf(
      "function openEditForm(wallet: SpendableWallet) {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}", start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("balance: String(wallet.balance)");
  });

  it("handleSubmit no longer forces the old balance back onto an existing wallet — the same parsed form value is used for both create and edit", () => {
    const fnSource = extractHandleSubmitSource();

    expect(fnSource).not.toContain("balance = existingWallet.balance");
    expect(fnSource).toContain("const balance = Number(form.balance);");
  });

  it("rejects NaN/negative balances with the existing validation message, for BOTH create and edit (no separate/weaker edit-path validation)", () => {
    const fnSource = extractHandleSubmitSource();

    expect(fnSource).toContain(
      "if (Number.isNaN(balance) || balance < 0) {",
    );
    expect(fnSource).toContain('setSaveError("Vui lòng nhập số dư hợp lệ");');
    // Exactly one validation block — not duplicated per branch.
    expect(fnSource.split("Number.isNaN(balance)").length - 1).toBe(1);
  });

  it("zero is a legitimate balance — the check is strictly `< 0`, never a falsy/truthy check that would also reject 0", () => {
    const fnSource = extractHandleSubmitSource();
    expect(fnSource).not.toMatch(/if\s*\(!balance\)/);
    expect(fnSource).toContain("balance < 0");
  });

  it("edit still writes through the single existing updateWallet() call — no new adjustment/transaction call introduced", () => {
    const fnSource = extractHandleSubmitSource();

    expect(fnSource).toContain("await updateWallet(wallet)");
    expect(fnSource).toContain("await addWallet(wallet)");
    expect(fnSource).not.toContain("await addTransaction(");
  });

  it("no new transaction type or adjustment concept was invented anywhere in this file", () => {
    expect(source).not.toMatch(/type:\s*"adjustment"/);
    expect(source).not.toContain("createAdjustment");
    expect(source).not.toContain("balanceAdjustment");
  });

  it("save failure keeps the modal open and reports the error — does not close the form or fake success", () => {
    const fnSource = extractHandleSubmitSource();
    const errorBranchStart = fnSource.indexOf("if (error) {");
    expect(errorBranchStart).toBeGreaterThan(-1);
    const errorBranchEnd = fnSource.indexOf("}", errorBranchStart);
    const errorBranch = fnSource.slice(errorBranchStart, errorBranchEnd);

    expect(errorBranch).toContain("setSaveError(error)");
    expect(errorBranch).toContain("return;");
    // setIsFormOpen(false) only happens AFTER this error-return, on the
    // success path — confirmed by it appearing later in the function.
    const closeIdx = fnSource.indexOf("setIsFormOpen(false)", errorBranchEnd);
    expect(closeIdx).toBeGreaterThan(errorBranchEnd);
  });

  it("double-submit protection (isSavingWallet guard) is untouched", () => {
    const fnSource = extractHandleSubmitSource();
    expect(fnSource).toContain("if (isSavingWallet) return;");
    expect(fnSource).toContain("setIsSavingWallet(true)");
    expect(fnSource).toContain("setIsSavingWallet(false)");
  });

  it("Cancel ('Hủy') just closes the form without submitting — no mutation, matching pre-existing behavior", () => {
    const start = source.indexOf(
      'onClick={() => setIsFormOpen(false)}\n                    disabled={isSavingWallet}',
    );
    // Whitespace-normalized fallback lookup in case of CRLF/formatting drift.
    if (start === -1) {
      expect(normalized).toContain(
        "onClick={() => setIsFormOpen(false)} disabled={isSavingWallet}",
      );
    } else {
      expect(start).toBeGreaterThan(-1);
    }
  });

  it("the help text no longer claims the balance is automatic/uneditable, and explains the new direct-edit semantics", () => {
    expect(source).not.toContain(
      "Số dư được cập nhật tự động qua giao dịch và không thể",
    );
    expect(source).toContain(
      "Bạn có thể cập nhật số dư hiện tại của ví.",
    );
  });

  it("the wallet transfer path is untouched — transfers still create a transaction and never call updateWallet directly", () => {
    const start = source.indexOf(
      "async function handleTransferSubmit(event: React.FormEvent) {",
    );
    const end = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
      start,
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const transferFnSource = source.slice(start, end);

    expect(transferFnSource).toContain("await addTransaction(transaction)");
    expect(transferFnSource).not.toContain("await updateWallet(");
    expect(transferFnSource).toContain(
      "Do not call updateWallet() here, otherwise the source/destination balances",
    );
  });

  it("NETWORTH-HISTORY-1 keeps snapshot capture out of the browser edit path", () => {
    const fnSource = extractHandleSubmitSource();

    expect(fnSource).not.toContain("capture_current_net_worth_snapshot");
    expect(fnSource).not.toContain("NetWorthSnapshot");
    expect(source).not.toContain("saveNetWorthSnapshot");
    expect(source).toContain("database snapshot trigger captures the");
    expect(source).toContain("previously recorded monthly Net Worth snapshot remains unchanged");
  });

  it("unrelated wallet fields (name/type) are unaffected by this change", () => {
    expect(source).toContain('label="Tên ví"');
    expect(source).toContain("Loại ví");
    expect(source).toContain("form.name.trim()");
  });
});
