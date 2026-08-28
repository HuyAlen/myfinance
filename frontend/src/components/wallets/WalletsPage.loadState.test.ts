import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WALLETS-CORRECTNESS-1 / FINANCE-DATA-1B — Wallet snapshot loading must
 * distinguish unknown / failure / legitimate-empty, and secondary reads must
 * not be able to suppress a successful Wallet snapshot.
 */
describe("WalletsPage load integrity (WALLETS-CORRECTNESS-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("tracks explicit Wallet and monthly-analytics readiness instead of treating initial [] as zero", () => {
    expect(source).toContain("walletSnapshotReady");
    expect(source).toContain("monthlyAnalyticsReady");
    expect(source).toContain(
      "const walletAnalyticsReady = walletSnapshotReady && monthlyAnalyticsReady;",
    );
    expect(source).toContain("isLoadingMonthAnalytics");
    expect(source).toContain("monthAnalyticsError");
  });

  it("applies critical Wallet, monthly analytics, and caption-only link counts independently", () => {
    const start = source.indexOf("const reloadData = useCallback(async () => {");
    const end = source.indexOf("}, []);", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("const walletTask = getWallets()");
    expect(fnSource).toContain("const monthlyAnalyticsTask = Promise.all([");
    expect(fnSource).toContain("getTransactionsInRange(startDate, endDate)");
    expect(fnSource).toContain("getCategories()");
    expect(fnSource).toContain("setCategories(loadedCategories)");
    expect(fnSource).toContain("const linkCountsTask = Promise.all([");
    expect(fnSource).toContain("getTransactionWalletLinks()");
    expect(fnSource).toContain("getForexCashWalletLinks()");
    expect(fnSource).toContain(
      "await Promise.all([walletTask, monthlyAnalyticsTask, linkCountsTask])",
    );
    expect(fnSource).not.toContain(
      "const [w, monthTxns, txnLinks, forexLinks] = await Promise.all",
    );
  });

  it("a caption-only link-count failure never becomes a Wallet load error", () => {
    const start = source.indexOf("const linkCountsTask = Promise.all([");
    const end = source.indexOf(
      "await Promise.all([walletTask, monthlyAnalyticsTask, linkCountsTask])",
      start,
    );
    const linkSource = source.slice(start, end);

    expect(linkSource).toContain("wallet link-count reload failed");
    expect(linkSource).not.toContain("setWalletsLoadError(");
    expect(linkSource).not.toContain("setWallets([])");
  });

  it("Wallet summary and classification surfaces are readiness-gated, so unknown never renders as 0đ/0 wallets", () => {
    expect(source).toContain(
      'value={walletSnapshotReady ? formatVND(totalAssets) : "—"}',
    );
    expect(source).toContain(
      "isLoading={!walletSnapshotReady && isLoadingWallets}",
    );
    expect(normalized).toContain(
      '{walletSnapshotReady ? `${spendableWallets.length} ví` : isLoadingWallets ? "Đang tải..." : "—"}',
    );
    expect(source).toContain("!walletSnapshotReady ? (");
  });

  it("keeps the list empty-state split between loading / failure / legitimate-empty", () => {
    expect(normalized).toContain(
      "{spendableWallets.length === 0 && isLoadingWallets && (",
    );
    expect(normalized).toContain(
      "{spendableWallets.length === 0 && !isLoadingWallets && walletsLoadError && (",
    );
    expect(normalized).toContain(
      "{spendableWallets.length === 0 && !isLoadingWallets && !walletsLoadError && (",
    );
    expect(source).toContain("Chưa có ví tiền nào");
  });
});
