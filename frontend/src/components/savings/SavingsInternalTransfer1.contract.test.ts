import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const modal = readFileSync(
  path.resolve(__dirname, "SavingsInternalTransferModal.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-INTERNAL-TRANSFER-1 UI contract", () => {
  it("adds a transfer action and dedicated modal", () => {
    expect(page).toContain("openInternalTransfer");
    expect(page).toContain("Chuyển");
    expect(page).toContain("<SavingsInternalTransferModal");
  });

  it("supports transfer-all without routing through wallets", () => {
    expect(modal).toContain("Chuyển toàn bộ");
    expect(modal).toContain("createSavingInternalTransfer");
    expect(modal).toContain("Tổng tiết kiệm không thay đổi");
    expect(modal).not.toContain("updateWallet");
  });

  it("preserves iPhone viewport integrity and double-submit protection", () => {
    expect(modal).toContain("--savings-visual-viewport-height");
    expect(modal).toContain("overflow-x-hidden overflow-y-auto");
    expect(modal).toContain("env(safe-area-inset-bottom)");
    expect(modal).toContain("if (isSubmitting) return;");
  });
});
