import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AIInsightsPage recoverable analytics readiness and trustworthy semantics (AI-INSIGHTS-CORRECTNESS-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "AIInsightsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("bounds every critical source read with a 10-second timeout", () => {
    expect(source).toContain("const INSIGHTS_LOAD_TIMEOUT_MS = 10_000");
    for (const label of ["wallets", "categories", "transactions", "goal-funding-transactions", "debts", "goals", "investments", "budgets", "savings", "forex-accounts", "forex-cash-transactions"]) {
      expect(source).toContain(`\"${label}\"`);
    }
    expect(source).toContain("withInsightsLoadTimeout(");
  });

  it("retries an initial failed load once after a short delay", () => {
    expect(source).toContain("const INSIGHTS_INITIAL_RETRY_MS = 750");
    expect(normalized).toContain("if (!ok && !cancelled) { retryTimer = window.setTimeout(");
  });

  it("prevents overlapping reloads and coalesces one trailing reload", () => {
    expect(source).toContain("isReloadingRef");
    expect(source).toContain("hasPendingReloadRef");
    expect(normalized).toContain("do { hasPendingReloadRef.current = false; lastResult = await reloadData(); } while (hasPendingReloadRef.current)");
  });

  it("recovers when the app returns to foreground or comes back online", () => {
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('window.addEventListener("online"');
    expect(source).toContain('document.visibilityState === "visible"');
  });

  it("subscribes all balance-sheet and analytics datasets that can change advisor output", () => {
    for (const table of ["wallets", "categories", "transactions", "debts", "goals", "investments", "budgets", "savings", "forex_accounts", "forex_cash_transactions"]) {
      expect(source).toContain(`\"${table}\"`);
    }
    expect(source).toContain("useRealtimeTable(");
    expect(source).toContain("await runReload();");
  });

  it("keeps general analytics on a bounded local-calendar window while Goal funding uses a dedicated cumulative minimal ledger", () => {
    expect(source).toContain("getTransactionsInRange");
    expect(source).toContain("getGoalFundingTransactions");
    expect(source).not.toContain("getTransactions,");
    expect(source).toContain("INSIGHTS_TRANSACTION_WINDOW_MONTHS = 24");
    expect(source).toContain("toLocalDateKey");
    expect(source).not.toContain("toISOString().slice(0, 10)");
  });

  it("commits all eleven required reads only after Promise.all succeeds", () => {
    const start = source.indexOf("const reloadData = useCallback");
    const catchIdx = source.indexOf("} catch (error) {", start);
    const success = source.slice(start, catchIdx);
    expect(success).toContain("await Promise.all([");
    for (const setter of ["setWallets(nextWallets)", "setCategories(nextCategories)", "setTransactions(nextTransactions)", "setGoalFundingTransactions(nextGoalFundingTransactions)", "setDebts(nextDebts)", "setGoals(nextGoals)", "setInvestments(nextInvestments)", "setBudgets(nextBudgets)", "setSavings(nextSavings)", "setForexAccounts(nextForexAccounts)", "setForexCashTransactions(nextForexCashTransactions)"]) {
      expect(success).toContain(setter);
    }
  });

  it("tracks transaction-month coverage before presenting forecast confidence", () => {
    expect(source).toContain("transactionCoverage");
    expect(source).toContain("hasForecastHistory: months.size >= 6");
    expect(source).toContain("Mới có ${transactionCoverage.monthCount}/6 tháng dữ liệu");
    expect(source).toContain("Chưa đủ 6 tháng dữ liệu giao dịch");
  });

  it("does not label deterministic page analytics as an AI advisor", () => {
    expect(source).not.toContain("AI Cố vấn tài chính");
    expect(source).toContain("Phân tích tài chính thông minh");
    expect(source).toContain("Nhận xét từ dữ liệu");
  });

  it("removes version-like health-score copy from user-facing labels", () => {
    expect(source).not.toContain("Điểm sức khỏe V2");
    expect(source).toContain("Điểm sức khỏe tài chính");
  });
});
