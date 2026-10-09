import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, relativePath), "utf8");

describe("FINANCE-FLOW-SSOT-1 cross-page adoption", () => {
  it("Dashboard derives period expense and Savings/Forex allocation from the canonical flow snapshot", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    expect(dashboard).toContain("calculateFinanceFlowSnapshot({");
    expect(dashboard).toContain("const periodFinanceFlow = useMemo(");
    expect(dashboard).toContain("expense: periodFinanceFlow.realExpense");
    expect(dashboard).toContain(
      "savingAmount: periodFinanceFlow.savingContribution",
    );
    expect(dashboard).toContain(
      "savingWithdrawal: periodFinanceFlow.savingWithdrawal",
    );
    expect(dashboard).toContain(
      "investmentAmount: periodFinanceFlow.investmentContribution",
    );
    expect(dashboard).toContain(
      "investmentWithdrawal: periodFinanceFlow.investmentWithdrawal",
    );
    expect(dashboard).toContain(
      "totalAmount: periodFinanceFlow.futureContribution",
    );
    expect(dashboard).toContain(
      "totalWithdrawal: periodFinanceFlow.futureWithdrawal",
    );
    expect(dashboard).toContain(
      "netAmount: periodFinanceFlow.futureNetAllocation",
    );
    expect(dashboard).toContain("buildCategorySpendingData(nonTransferFilteredTransactions, categories)");
    expect(dashboard).toContain(
      'from "@/src/lib/transactions/transactionClassification"',
    );
    expect(dashboard).not.toContain("INTERNAL_TRANSFER_KEYWORDS");
    expect(dashboard).not.toContain("function getNetSavingAllocation(");
    expect(dashboard).not.toContain("function getNetInvestmentAllocation(");
  });

  it("Dashboard Today and Monthly Pulse no longer count raw expense rows", () => {
    const dashboard = read("../../components/dashboard/DashboardPage.tsx");
    const todayStart = dashboard.indexOf("const todaySnapshot = useMemo(");
    const pulseStart = dashboard.indexOf("const monthlyPulse = useMemo(");
    const pulseEnd = dashboard.indexOf(
      "const monthlyProgressReady =",
      pulseStart,
    );
    const today = dashboard.slice(todayStart, pulseStart);
    const pulse = dashboard.slice(pulseStart, pulseEnd);

    expect(today).toContain("calculateFinanceFlowSnapshot({");
    expect(today).toContain("operatingCashIn: flow.operatingCashIn");
    expect(today).toContain("operatingCashOut: flow.operatingCashOut");
    expect(today).toContain(
      "operatingNetCashFlow: flow.operatingNetCashFlow",
    );
    expect(pulse).toContain("calculateFinanceFlowSnapshot({");
    expect(pulse).toContain("const expense = monthFlow.realExpense;");
    expect(today).not.toContain('transaction.type === "expense"');
    expect(pulse).not.toContain('transaction.type === "expense"');
  });

  it("Reports consumes saving_transactions + Forex ledger through the same flow snapshot and removes created-at allocation fallback", () => {
    const reports = read("../../components/reports/ReportsPage.tsx");
    expect(reports).toContain('from("saving_transactions")');
    expect(reports).toContain("calculateFinanceFlowSnapshot({");
    expect(reports).toContain("savingMovements");
    expect(reports).toContain("forexCashTransactions");
    expect(reports).not.toContain("getSavingCapitalTotal");
    expect(reports).not.toContain("getInvestmentCapitalTotal");
    expect(reports).not.toContain("savingAllocationFromSavings");
  });

  it("Transactions uses wallet cash movement cards without changing canonical real-expense semantics", () => {
    const transactions = read("../../components/transactions/TransactionsPage.tsx");
    const cards = read("../../lib/transactions/transactionCashMovementCards.ts");
    const finance = read("./financeCalculations.ts");

    // Transactions reports cash in/out of spendable wallets, not a second
    // income/real-expense definition. Keep ordinary expense semantics in SSOT.
    expect(transactions).toContain("summarizeTransactionWalletCashMovement({");
    expect(transactions).toContain('label="Tiền vào ví"');
    expect(transactions).toContain('label="Tiền ra ví"');
    expect(transactions).toContain("if (!isOrdinaryTransactionFeedRow(t)) return false;");
    expect(cards).toContain("return calculateFinanceFlowSnapshot({");
    expect(finance).toContain("const realExpenses = getRealExpenseTransactions(transactions, categories);");
    expect(finance).toContain("const operatingCashOut = realExpense;");
    expect(transactions).not.toContain("function getCategoryPlanningGroup(");
  });

  it("Wallet analytics consume the canonical liquidity ledgers and preserve reconciliation realtime refresh", () => {
    const wallets = read("../../components/wallets/WalletsPage.tsx");
    expect(wallets).toContain("getCategories(),");
    expect(wallets).toContain("setCategories(loadedCategories)");
    expect(wallets).toContain("getSavingTransactionsInRange(startDate, endDate)");
    expect(wallets).toContain("getForexCashTransactionsInRange(startDate, endDate)");
    expect(wallets).toContain("calculateWalletCashMovementSnapshot({");
    expect(wallets).not.toContain("getTotalExpense(periodTxns, categories)");

    const realtimeStart = wallets.indexOf("useRealtimeTable(");
    const realtimeEnd = wallets.indexOf(");", realtimeStart);
    expect(realtimeStart).toBeGreaterThan(-1);
    const realtimeRegion = wallets.slice(realtimeStart, realtimeEnd);

    expect(realtimeRegion).toContain('"wallets"');
    expect(realtimeRegion).toContain('"transactions"');
    expect(realtimeRegion).toContain('"categories"');
    expect(realtimeRegion).toContain('"saving_transactions"');
    expect(realtimeRegion).toContain('"forex_cash_transactions"');
    expect(realtimeRegion).toContain('"wallet_reconciliations"');
  });

  it("AI monthly forecast receives Categories so saving/investment allocations cannot leak into projected expense", () => {
    const forecast = read("analytics/forecastAnalytics.ts");
    const advisor = read("analytics/aiAdvisorEngine.ts");
    expect(forecast).toContain("categories: Category[] = []");
    expect(forecast).toContain(
      "getTotalExpense(byMonth.get(m) ?? [], categories)",
    );
    expect(advisor).toContain(
      "forecast: computeMonthlyForecast(transactions, 6, categories)",
    );
  });
});
