import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-UX-1 — Separate Saving Edit & Money Movement Flows.
 *
 * Source-inspection contract because this project intentionally does not use
 * React Testing Library for this page. The goal is to keep edit metadata,
 * money movement, and transaction history as distinct interaction surfaces
 * while preserving the wallet failure-state safety contract.
 */
describe("SavingsPage separates edit, money movement, and history flows", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  const editStart = source.indexOf(
    "/* SAVINGS-UX-1: create/edit metadata is intentionally separate",
  );
  const movementStart = source.indexOf(
    "/* SAVINGS-UX-1: focused money-movement sheet.",
  );
  const historyStart = source.indexOf(
    "/* SAVINGS-UX-1: history is a read-only sheet, not part of edit.",
  );
  const deleteStart = source.indexOf("{deleteTarget ? (", historyStart);

  const editSource = source.slice(editStart, movementStart);
  const movementSource = source.slice(movementStart, historyStart);
  const historySource = source.slice(historyStart, deleteStart);

  it("routes card actions directly to focused money movement and history flows", () => {
    expect(source).toContain('openMoneyMovementModal(item, "deposit")');
    expect(source).toContain('openMoneyMovementModal(item, "withdraw")');
    expect(source).toContain("openHistoryModal(item)");
  });

  it("keeps edit focused on saving metadata instead of embedding transaction operations", () => {
    expect(editSource).toContain("Chỉnh sửa khoản tiết kiệm");
    expect(editSource).toContain("Chỉ cập nhật thông tin.");
    expect(editSource).toContain("Lưu thay đổi");
    expect(editSource).not.toContain("handleAddTransaction");
    expect(editSource).not.toContain("selectedTransactions.map");
    expect(editSource).not.toContain("Xóa khoản này");
  });

  it("shows the authoritative current saving balance as a summary in edit instead of an editable balance field", () => {
    expect(editSource).toContain("Số dư hiện tại");
    expect(editSource).toContain("formatCurrency(selectedSaving.balance)");
    expect(editSource).toContain("{!isEditing ? (");
    expect(editSource).not.toContain("readOnly={isEditing}");
  });

  it("keeps the create preview compact and create-only", () => {
    expect(editSource).toContain("Kiểm tra trước khi tạo");
    expect(editSource).toContain("Số tiền gửi");
    expect(editSource).toContain("Ví sau chuyển");
    expect(editSource).toContain("!isEditing ? (");
  });

  it("provides a dedicated money-movement sheet with deposit, withdraw, settlement, and before/after balances", () => {
    expect(movementSource).toContain("MONEY MOVEMENT");
    expect(movementSource).toContain('["deposit", "withdraw", "settlement"]');
    expect(movementSource).toContain("handleAddTransaction()");
    expect(movementSource).toContain("transactionSavingBalanceAfter");
    expect(movementSource).toContain("transactionWalletBalanceAfter");
    expect(movementSource).toContain("Dùng toàn bộ số dư hiện tại.");
  });

  it("provides a read-only history sheet with no form controls", () => {
    expect(historySource).toContain("HISTORY");
    expect(historySource).toContain("selectedTransactions.map");
    expect(historySource).toContain("Chưa có giao dịch");
    expect(historySource).not.toContain("<input");
    expect(historySource).not.toContain("<select");
  });

  it("refreshes wallet balances for the focused money-movement flow rather than coupling that refresh to edit mode", () => {
    expect(source).toContain(
      "if (!transactionSavingId || !transactionForm.walletId) return;",
    );
    expect(source).toContain(
      "}, [transactionSavingId, transactionForm.walletId]);",
    );
  });

  it("preserves FINANCE-DATA-1B unknown-wallet semantics", () => {
    const normalized = source.replace(/\s+/g, " ");
    expect(source).toContain(
      "const hasUnknownWalletBalance = !selectedInitialWallet && !!walletsLoadError;",
    );
    expect(source).toContain("!hasUnknownWalletBalance &&");
    expect(normalized).toContain(
      'hasUnknownWalletBalance ? "Không thể tải số dư" : formatCurrency(selectedWalletBalance)',
    );
  });
});
