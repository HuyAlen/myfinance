import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("CROSSPAGE-REGRESSION-1 page adoption gate", () => {
  it("keeps Dashboard on canonical flow, Goal funding and balance-sheet paths", () => {
    const source = read("components/dashboard/DashboardPage.tsx");
    expect(source).toContain("calculateFinanceFlowSnapshot({");
    expect(source).toContain("calculateGoalFundingSnapshot({");
    expect(source).toContain("getForexAssetValue(");
    expect(source).toContain("periodFinanceFlow.realExpense");
    expect(source).toContain("periodFinanceFlow.futureAllocation");
  });

  it("keeps Transactions and Wallets on canonical real-expense semantics", () => {
    const transactions = read("components/transactions/TransactionsPage.tsx");
    const wallets = read("components/wallets/WalletsPage.tsx");

    expect(transactions).toContain("getRealExpenseTransactions(");
    expect(transactions).toContain("realExpenseTransactions.reduce(");
    expect(wallets).toContain("getTotalExpense(currentMonthTxns, categories)");
    expect(wallets).toContain("expense: getTotalExpense(wt, categories)");
  });

  it("keeps Budgets and Goals delegated to their canonical calculators", () => {
    const budgets = read("components/budgets/BudgetsPage.tsx");
    const goals = read("components/goals/GoalsPage.tsx");

    expect(budgets).toContain("calculateBudgetSpending({");
    expect(goals).toContain("calculateGoalFundingSnapshot({");
  });

  it("keeps Reports as the reconciliation surface for balance sheet, flow and Goal funding", () => {
    const reports = read("components/reports/ReportsPage.tsx");

    expect(reports).toContain("calculateBalanceSheetSnapshot({");
    expect(reports).toContain("calculateFinanceFlowSnapshot({");
    expect(reports).toContain("calculateGoalFundingSnapshot({");
    expect(reports).toContain("balanceSheet.debtRatio");
    expect(reports).toContain("balanceSheet.forex");
  });

  it("keeps Debts and Investments on the same full asset base", () => {
    const debts = read("components/debts/DebtsPage.tsx");
    const investments = read("components/investments/InvestmentsPage.tsx");

    expect(debts).toContain("calculateBalanceSheetSnapshot({");
    expect(debts).toContain("setTotalAssets(balanceSheet.totalAssets)");
    expect(debts).toContain("getDebtRatio(summary.remainingAmount, totalAssets)");
    expect(investments).toContain("getForexAssetValue(accounts, transactions)");
    expect(investments).toContain("getInvestments()");
    expect(investments).toContain(
      "portfolioSummary.currentValue + summary.currentExposure",
    );
  });

  it("keeps AI Insights on the shared advisor instead of rebuilding KPI math in the page", () => {
    const ai = read("components/ai-insights/AIInsightsPage.tsx");

    expect(ai).toContain("runAdvisor({");
    expect(ai).toContain("forexAccounts,");
    expect(ai).toContain("forexCashTransactions,");
    expect(ai).toContain("goalFundingTransactions,");
    expect(ai).toContain("savings,");
  });
});
