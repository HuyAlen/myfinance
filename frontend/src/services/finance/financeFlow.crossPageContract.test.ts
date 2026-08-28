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
    expect(dashboard).toContain("savingAmount: periodFinanceFlow.savingAllocation");
    expect(dashboard).toContain(
      "investmentAmount: periodFinanceFlow.investmentAllocation",
    );
    expect(dashboard).toContain("buildCategorySpendingData(monthTransactions, categories)");
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
    expect(today).toContain("expense: flow.realExpense");
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

  it("Transactions uses the canonical real-expense collection for both amount and count", () => {
    const transactions = read("../../components/transactions/TransactionsPage.tsx");
    expect(transactions).toContain("getRealExpenseTransactions(");
    expect(transactions).toContain("realExpenseTransactions.reduce(");
    expect(transactions).toContain("`${realExpenseTransactions.length} giao dịch`");
    expect(transactions).not.toContain(
      'cashFlowTransactions.filter((item) => item.type === "expense").length',
    );
    expect(transactions).not.toContain("function getCategoryPlanningGroup(");
  });

  it("Wallet analytics load Categories as a required dependency and pass them into real-expense totals", () => {
    const wallets = read("../../components/wallets/WalletsPage.tsx");
    expect(wallets).toContain("getCategories(),");
    expect(wallets).toContain("setCategories(loadedCategories)");
    expect(wallets).toContain("getTotalExpense(currentMonthTxns, categories)");
    expect(wallets).toContain("expense: getTotalExpense(wt, categories)");
    expect(wallets).toContain('["wallets", "transactions", "categories"]');
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
