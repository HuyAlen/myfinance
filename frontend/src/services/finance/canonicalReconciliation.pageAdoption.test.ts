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
    expect(source).toContain("calculateForexPerformanceSnapshot(");
    expect(source).toContain("periodFinanceFlow.realExpense");
    expect(source).toContain("periodFinanceFlow.futureContribution");
    expect(source).toContain("periodFinanceFlow.futureWithdrawal");
    expect(source).toContain("periodFinanceFlow.futureNetAllocation");
  });

  it("keeps Transactions on real income/expense while Wallets retains canonical liquidity", () => {
    const transactions = read("components/transactions/TransactionsPage.tsx");
    const selectors = read("lib/transactions/transactionIncomeExpenseScope.ts");
    const wallets = read("components/wallets/WalletsPage.tsx");

    expect(transactions).toContain("summarizeTransactionIncomeExpense({");
    expect(transactions).toContain("if (!isOrdinaryTransactionFeedRow(t)) return false;");
    expect(selectors).toContain("getTotalIncome(scoped)");
    expect(selectors).toContain("getRealExpenseTransactions(scoped, input.categories)");
    expect(wallets).toContain("calculateWalletCashMovementSnapshot({");
    expect(wallets).toContain("periodWalletCashMovement.cashIn");
    expect(wallets).toContain("periodWalletCashMovement.cashOut");
    expect(wallets).not.toContain("getTotalExpense(periodTxns, categories)");
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
    expect(investments).toContain("calculateForexPerformanceSnapshot(accounts, transactions)");
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
