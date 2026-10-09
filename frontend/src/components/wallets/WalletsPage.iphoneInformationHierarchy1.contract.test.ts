import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "WalletsPage.tsx"), "utf8").replace(/\r\n/g, "\n");
const center = readFileSync(path.resolve(__dirname, "WalletReconciliationCenter.tsx"), "utf8").replace(/\r\n/g, "\n");
const normalizedPage = page.replace(/\s+/g, " ");

describe("WALLETS-IPHONE-INFORMATION-HIERARCHY-1", () => {
  it("keeps Wallet DOM order aligned with visual order across iPhone orientations and keyboard navigation", () => {
    const overview = page.indexOf('data-wallets-section="overview"');
    const walletList = page.indexOf('data-wallets-section="wallet-list"');
    const reconciliation = page.indexOf('data-wallets-section="reconciliation"');
    const walletTypes = page.indexOf('data-wallets-section="wallet-types"');

    expect(overview).toBeGreaterThan(-1);
    expect(reconciliation).toBeGreaterThan(overview);
    expect(walletTypes).toBeGreaterThan(reconciliation);
    expect(walletList).toBeGreaterThan(walletTypes);
    expect(page).not.toContain("md:order-none");
    expect(page).not.toMatch(/className="order-[1-4]/);
  });

  it("promotes net cash movement into the fourth primary KPI and demotes internal transfers to secondary context", () => {
    expect(page).toContain('label="Ròng kỳ này"');
    expect(page).not.toContain('label="Chuyển giữa ví"');
    expect(page).toContain('Chuyển nội bộ');
    expect(page).toContain('formatVND(periodTransferTotal)');
    expect(page).toContain('periodTransfers.length');
  });

  it("labels linked transaction metadata as all-time rather than selected-period activity", () => {
    expect(normalizedPage).toContain(
      '<span className="text-slate-400 sm:hidden"> · {txCount === null ? "—" : txCount} GD tổng </span>',
    );
    expect(normalizedPage).toContain(
      '<span className="hidden text-slate-400 sm:inline"> · {txCount === null ? "—" : txCount} GD liên kết tổng </span>',
    );
    expect(page).not.toContain('· {txCount === null ? "—" : txCount} GD liên kết\n');
  });

  it("prioritizes never-reconciled wallets, then due rechecks, then the oldest latest receipt", () => {
    expect(center).toContain('const reconciliationDataReady = !isLoading && !error;');
    expect(center).toContain('const oldestReconciledWallet =');
    expect(center).toContain('const needsReview = walletRows.filter((row) => row.status === "needs_review");');
    expect(center).toContain('const reconciliationPriorityWallet =');
    expect(center).toContain('neverReconciled[0]?.wallet ?? needsReview[0]?.wallet ?? oldestReconciledWallet');
    expect(center).toContain('onReconcile(reconciliationPriorityWallet)');
    expect(center).toContain('Đối soát lâu nhất');
  });

  it("does not render unresolved reconciliation reads as validated coverage and keeps receipt history desktop-secondary", () => {
    expect(center).toContain('reconciliationDataReady && wallets.length > 0');
    expect(center).toContain('className="mt-2 hidden max-w-2xl text-xs leading-5 text-slate-500 sm:block sm:text-sm"');
    expect(center).toContain('className="mt-4 hidden sm:block"');
  });

  it("exposes all Wallet action overlays as named modal dialogs", () => {
    expect((page.match(/role="dialog"/g) ?? []).length).toBe(4);
    expect((page.match(/aria-modal="true"/g) ?? []).length).toBe(4);
    expect(page).toContain('aria-labelledby="wallet-transfer-title"');
    expect(page).toContain('aria-labelledby="wallet-reconcile-title"');
    expect(page).toContain('aria-labelledby="wallet-form-title"');
    expect(page).toContain('aria-labelledby="wallet-delete-title"');
    expect(page).toContain('aria-label="Đóng chuyển tiền"');
    expect(page).toContain('aria-label="Đóng biểu mẫu ví"');
  });
});
