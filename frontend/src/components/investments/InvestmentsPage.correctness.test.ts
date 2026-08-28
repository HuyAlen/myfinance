import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INVESTMENTS-CORRECTNESS-1 — Local Time, Atomic Deletion & Recoverable Data Readiness.
 *
 * Source-contract tests are used in this repository instead of mounting the
 * component. These assertions protect the correctness boundaries that are
 * easy to regress while polishing the page later.
 */
describe("InvestmentsPage correctness hardening (INVESTMENTS-CORRECTNESS-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "InvestmentsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("builds the default form date from local calendar fields instead of UTC ISO", () => {
    expect(source).toContain("function toLocalDateInputValue");
    expect(source).toContain("date.getFullYear()");
    expect(source).toContain("date.getMonth() + 1");
    expect(source).toContain("date.getDate()");
    expect(source).not.toContain('new Date().toISOString().slice(0, 10)');
  });

  it("uses the local date helper for both account and transaction defaults", () => {
    expect(normalized).toContain('openedAt: today(),');
    expect(normalized).toContain('transactionDate: today(),');
  });

  it("rejects impossible HH:mm values instead of validating only the shape", () => {
    expect(source).toContain('const timeMatch = /^(\\d{2}):(\\d{2})$/.exec(form.transactionTime);');
    expect(source).toContain("if (hour > 23 || minute > 59)");
    expect(source).toContain("Giờ giao dịch không hợp lệ.");
  });

  it("bounds all three initial read domains with a timeout", () => {
    expect(source).toContain("const FOREX_LOAD_TIMEOUT_MS = 10_000;");
    expect(source).toContain('withForexLoadTimeout("Danh sách ví", getWallets())');
    expect(source).toContain('withForexLoadTimeout(\n      "Tài khoản Forex"');
    expect(source).toContain('withForexLoadTimeout(\n      "Lịch sử nạp/rút Forex"');
  });

  it("starts wallet, account and cash-ledger reads before awaiting the combined result", () => {
    const walletIndex = source.indexOf("const walletsRequest =");
    const accountIndex = source.indexOf("const accountsRequest =");
    const transactionIndex = source.indexOf("const transactionsRequest =");
    const awaitIndex = source.indexOf("await Promise.all([", transactionIndex);
    expect(walletIndex).toBeGreaterThan(-1);
    expect(accountIndex).toBeGreaterThan(walletIndex);
    expect(transactionIndex).toBeGreaterThan(accountIndex);
    expect(awaitIndex).toBeGreaterThan(transactionIndex);
  });

  it("retries the initial load once after a bounded failure", () => {
    expect(source).toContain("const FOREX_INITIAL_RETRY_DELAY_MS = 750;");
    expect(source).toContain("void reload(2);");
    expect(source).toContain("await sleep(FOREX_INITIAL_RETRY_DELAY_MS);");
  });

  it("keeps last-known-good finance arrays when a refresh fails", () => {
    const reloadStart = source.indexOf("const reload = useCallback(");
    const reloadEnd = source.indexOf("useEffect(() => {", reloadStart);
    const reloadRegion = source.slice(reloadStart, reloadEnd);
    expect(reloadRegion).toContain("applyForexPageData(data)");
    expect(reloadRegion).toContain("setLoadError(");
    expect(reloadRegion).not.toContain("setAccounts([])");
    expect(reloadRegion).not.toContain("setTransactions([])");
    expect(reloadRegion).not.toContain("setWallets([])");
  });

  it("prevents overlapping refreshes while preserving one trailing reload", () => {
    expect(source).toContain("const isReloadingRef = useRef(false);");
    expect(source).toContain("const pendingReloadRef = useRef(false);");
    expect(source).toContain("if (isReloadingRef.current)");
    expect(source).toContain("pendingReloadRef.current = true;");
    expect(source).toContain("} while (pendingReloadRef.current && mountedRef.current);");
  });

  it("recovers when the browser comes online or the app returns to foreground", () => {
    expect(source).toContain('window.addEventListener("online", recover)');
    expect(source).toContain('document.addEventListener("visibilitychange", handleVisibilityChange)');
    expect(source).toContain('document.visibilityState === "visible"');
  });

  it("surfaces an explicit retry action instead of leaving only a stale loading/error surface", () => {
    expect(source).toContain("Thử lại");
    expect(source).toContain("onClick={() => void reload(1)}");
  });

  it("deletes a Forex account through one atomic RPC rather than client-side transaction loops", () => {
    const start = source.indexOf("function requestDeleteAccount");
    const end = source.indexOf("function requestDeleteTransaction", start);
    const region = source.slice(start, end);
    expect(region).toContain('supabase.rpc("delete_forex_account_atomic"');
    expect(region).toContain("p_account_id: account.id");
    expect(region).not.toContain("for (const transactionId");
    expect(region).not.toContain('.from("forex_accounts")');
    expect(region).not.toContain('"delete_forex_cash_transaction"');
  });

  it("excludes archived accounts from current portfolio exposure while retaining inactive accounts", () => {
    expect(source).toContain('const currentPortfolioAccounts = accountMetrics.filter(');
    expect(source).toContain('account.status !== "archived"');
    expect(source).toContain("const totalDeposited = currentPortfolioAccounts.reduce(");
    expect(source).toContain("const knownEquityAccounts = currentPortfolioAccounts.filter(");
  });
});
