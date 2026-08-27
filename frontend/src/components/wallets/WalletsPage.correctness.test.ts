import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WALLETS-CORRECTNESS-1 — Load Integrity, Spendable Scope & Transfer Safety.
 * Source-inspection contract, matching the existing Wallet regression style.
 */
describe("WALLETS-CORRECTNESS-1 — Wallet domain correctness", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  );

  it("scopes current-month analytics to spendable Wallet-domain ids", () => {
    expect(source).toContain("const spendableWalletIds = useMemo(");
    expect(source).toContain("isSpendableWalletTransaction(");
    expect(source).toContain(
      "isSpendableWalletTransaction(transaction, spendableWalletIds)",
    );
    expect(source).toContain(
      "if (!spendableWalletIds.has(transaction.walletId)) return false;",
    );
  });

  it("requires both ends of a wallet transfer to be spendable, preventing legacy investment leakage", () => {
    const start = source.indexOf("function isSpendableWalletTransaction(");
    const end = source.indexOf("// Bursts of realtime events", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const helper = source.slice(start, end);

    expect(helper).toContain("if (isWalletTransfer(transaction))");
    expect(helper).toContain("transaction.transferToWalletId");
    expect(helper).toContain(
      "spendableWalletIds.has(transaction.transferToWalletId)",
    );
  });

  it("does not present monthly values or per-wallet flow as validated before monthly analytics succeeds", () => {
    expect(source).toContain(
      "const walletAnalyticsReady = walletSnapshotReady && monthlyAnalyticsReady;",
    );
    expect(source).toContain("isLoading={walletAnalyticsLoading}");
    expect(source).toContain("{walletAnalyticsReady ? (");
    expect(source).toContain("walletAnalyticsError");
  });

  it("does not show a fake zero linked-transaction count before caption metadata loads", () => {
    expect(source).toContain("walletLinkCountsReady");
    expect(source).toContain(
      "const txCount = walletLinkCountsReady",
    );
    expect(source).toContain(
      '· {txCount === null ? "—" : txCount} giao dịch',
    );
  });

  it("validates transfer date server-state independently of the browser input constraint", () => {
    const start = source.indexOf(
      "async function handleTransferSubmit(event: React.FormEvent) {",
    );
    const end = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
      start,
    );
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("const transferDate = transferForm.date.trim();");
    expect(fnSource).toContain("isValidLocalDateInputValue(transferDate)");
    expect(fnSource).toContain('setSaveError("Vui lòng chọn ngày chuyển hợp lệ")');
    expect(fnSource).toContain("transferDate > getLocalDateInputValue()");
    expect(fnSource).toContain('setSaveError("Ngày chuyển không được ở tương lai")');
    expect(fnSource).toContain("date: transferDate");
  });

  it("also constrains the date input to today while preserving local-date semantics", () => {
    expect(source).toContain('label="Ngày chuyển"');
    expect(source).toContain('max={getLocalDateInputValue()}');
    expect(source).toMatch(/label="Ngày chuyển"[\s\S]*?required/);
    expect(source).not.toContain("toISOString().slice(0, 10)");
  });

  it("preserves the single addTransaction transfer mutation and never adds direct wallet balance writes", () => {
    const start = source.indexOf(
      "async function handleTransferSubmit(event: React.FormEvent) {",
    );
    const end = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
      start,
    );
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("await addTransaction(transaction)");
    expect(fnSource).not.toContain("await updateWallet(");
  });
});
