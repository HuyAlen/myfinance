import { describe, expect, it } from "vitest";
import { runAdvisor } from "./analytics/aiAdvisorEngine";
import {
  calculateBalanceSheetSnapshot,
  calculateBudgetSpendingCollection,
  calculateDashboardSummary,
  calculateFinanceFlowSnapshot,
  calculateGoalFundingSnapshot,
} from "./financeCalculations";
import {
  reconciliationBudgets,
  reconciliationCategories,
  reconciliationDebts,
  reconciliationExpected,
  reconciliationForexAccounts,
  reconciliationForexCashTransactions,
  reconciliationGoals,
  reconciliationInvestments,
  reconciliationPeriod,
  reconciliationSavingMovements,
  reconciliationSavings,
  reconciliationTransactions,
  reconciliationWallets,
} from "./canonicalReconciliation.fixture";

describe("CROSSPAGE-REGRESSION-1 canonical reconciliation gate", () => {
  const balanceSheet = calculateBalanceSheetSnapshot({
    wallets: reconciliationWallets,
    savings: reconciliationSavings,
    investments: reconciliationInvestments,
    debts: reconciliationDebts,
    forexAccounts: reconciliationForexAccounts,
    forexCashTransactions: reconciliationForexCashTransactions,
  });

  const flow = calculateFinanceFlowSnapshot({
    transactions: reconciliationTransactions,
    categories: reconciliationCategories,
    savingMovements: reconciliationSavingMovements,
    forexCashTransactions: reconciliationForexCashTransactions,
    dateRange: reconciliationPeriod,
  });

  const goalFunding = calculateGoalFundingSnapshot({
    goal: reconciliationGoals[0],
    savings: reconciliationSavings,
    transactions: reconciliationTransactions,
  });

  const budgetRows = calculateBudgetSpendingCollection({
    budgets: reconciliationBudgets,
    transactions: reconciliationTransactions,
    categories: reconciliationCategories,
  });

  const dashboard = calculateDashboardSummary({
    wallets: reconciliationWallets,
    savings: reconciliationSavings,
    investments: reconciliationInvestments,
    debts: reconciliationDebts,
    transactions: reconciliationTransactions,
    goalFundingTransactions: reconciliationTransactions,
    categories: reconciliationCategories,
    goals: reconciliationGoals,
    forexAssetValue: balanceSheet.forex,
  });

  const advisor = runAdvisor({
    wallets: reconciliationWallets,
    savings: reconciliationSavings,
    investments: reconciliationInvestments,
    forexAccounts: reconciliationForexAccounts,
    forexCashTransactions: reconciliationForexCashTransactions,
    debts: reconciliationDebts,
    transactions: reconciliationTransactions,
    goalFundingTransactions: reconciliationTransactions,
    categories: reconciliationCategories,
    goals: reconciliationGoals,
    budgets: reconciliationBudgets,
  });

  it("reconciles the current balance sheet used by Dashboard, Debts, Investments, Reports and AI", () => {
    expect(balanceSheet.cashAndWallets).toBe(reconciliationExpected.walletAssets);
    expect(balanceSheet.savings).toBe(reconciliationExpected.savingsAssets);
    expect(balanceSheet.investments).toBe(
      reconciliationExpected.portfolioAssets,
    );
    expect(balanceSheet.forex).toBe(reconciliationExpected.forexAssets);
    expect(balanceSheet.totalAssets).toBe(reconciliationExpected.totalAssets);
    expect(balanceSheet.totalDebt).toBe(reconciliationExpected.totalDebt);
    expect(balanceSheet.netWorth).toBe(reconciliationExpected.netWorth);
    expect(balanceSheet.debtRatio).toBe(reconciliationExpected.debtRatio);

    expect(balanceSheet.investments + balanceSheet.forex).toBe(
      reconciliationExpected.investmentDomainValue,
    );
  });

  it("reconciles real expense and future allocation used by Dashboard, Transactions, Wallets and Reports", () => {
    expect(flow.income).toBe(reconciliationExpected.income);
    expect(flow.realExpense).toBe(reconciliationExpected.realExpense);
    expect(flow.realExpenseCount).toBe(reconciliationExpected.realExpenseCount);
    expect(flow.savingAllocation).toBe(reconciliationExpected.savingAllocation);
    expect(flow.investmentAllocation).toBe(
      reconciliationExpected.investmentAllocation,
    );
    expect(flow.futureAllocation).toBe(reconciliationExpected.futureAllocation);
    expect(flow.futureAllocationRate).toBe(
      reconciliationExpected.futureAllocationRate,
    );
  });

  it("reconciles Budget spending to the same real-expense ledger for fully covered expense categories", () => {
    const coveredExpense = budgetRows.reduce((sum, row) => sum + row.spent, 0);

    expect(coveredExpense).toBe(reconciliationExpected.budgetCoveredExpense);
    expect(coveredExpense).toBe(flow.realExpense);
    expect(
      budgetRows.find((row) => row.budgetId === "budget-rent")?.spent,
    ).toBe(5_000_000);
    expect(
      budgetRows.find((row) => row.budgetId === "budget-food")?.spent,
    ).toBe(4_000_000);
  });

  it("reconciles Goal funding across Goal cards, Dashboard, Reports, notifications and AI", () => {
    expect(goalFunding.effectiveCurrentAmount).toBe(
      reconciliationExpected.goalEffectiveAmount,
    );
    expect(goalFunding.progressPercent).toBe(
      reconciliationExpected.goalProgressPercent,
    );
    expect(dashboard.goalScore).toBe(reconciliationExpected.goalProgressPercent);
    expect(advisor.goalScore).toBe(reconciliationExpected.goalProgressPercent);
  });

  it("reconciles Dashboard summary with the canonical balance sheet and real-expense semantics", () => {
    expect(dashboard.totalAssets).toBe(reconciliationExpected.totalAssets);
    expect(dashboard.totalDebt).toBe(reconciliationExpected.totalDebt);
    expect(dashboard.netWorth).toBe(reconciliationExpected.netWorth);
    expect(dashboard.debtRatio).toBe(reconciliationExpected.debtRatio);
    expect(dashboard.expense).toBe(reconciliationExpected.realExpense);
  });

  it("reconciles AI base metrics, FIRE and Forecast with the same canonical snapshot", () => {
    expect(advisor.totalAssets).toBe(reconciliationExpected.totalAssets);
    expect(advisor.totalDebt).toBe(reconciliationExpected.totalDebt);
    expect(advisor.debtRatio).toBe(reconciliationExpected.debtRatio);
    expect(advisor.expense).toBe(reconciliationExpected.realExpense);
    expect(advisor.fire.netWorth).toBe(reconciliationExpected.netWorth);
    expect(advisor.financialForecast.currentNetWorth).toBe(
      reconciliationExpected.netWorth,
    );
  });
});
