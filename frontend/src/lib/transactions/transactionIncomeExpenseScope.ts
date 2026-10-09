import type { Category, Transaction } from "@/src/types/finance";
import {
  getRealExpenseTransactions,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import {
  isInternalTransferTransaction,
  isInvestmentManagedTransaction,
  isSavingsManagedTransaction,
} from "@/src/lib/transactions/transactionClassification";

/**
 * TRANSACTIONS-INCOME-EXPENSE-SCOPE-1
 * The Transactions page owns an ordinary income/expense feed, not the capital
 * ledgers for Investments, Forex, or Savings. System-managed transfer mirrors
 * stay in the database for reconciliation but not in the editable feed.
 */
export function isOrdinaryTransactionFeedRow(transaction: Transaction) {
  return (
    !isInvestmentManagedTransaction(transaction) &&
    !isSavingsManagedTransaction(transaction)
  );
}

export type TransactionIncomeExpenseScope = {
  effectiveRange: { startDate: string; endDate: string };
  dateFrom?: string;
  dateTo?: string;
  walletId?: string;
};

function effectiveWindow(scope: TransactionIncomeExpenseScope) {
  const startDate =
    scope.dateFrom && scope.dateFrom > scope.effectiveRange.startDate
      ? scope.dateFrom
      : scope.effectiveRange.startDate;
  const endDate =
    scope.dateTo && scope.dateTo < scope.effectiveRange.endDate
      ? scope.dateTo
      : scope.effectiveRange.endDate;
  return { startDate, endDate };
}

/**
 * Only the period, local date, and Wallet context scope the summary cards.
 * Keyword/type/category/amount affect the ordinary feed, not the overview.
 * A destination Wallet qualifies only for wallet-to-wallet transfers.
 */
export function scopeTransactionSummaryRows(
  transactions: Transaction[],
  scope: TransactionIncomeExpenseScope,
): Transaction[] {
  const { startDate, endDate } = effectiveWindow(scope);
  return transactions.filter((transaction) => {
    if (!isOrdinaryTransactionFeedRow(transaction)) return false;
    const day = String(transaction.date ?? "").slice(0, 10);
    if (day < startDate || day > endDate) return false;
    if (!scope.walletId) return true;
    return (
      transaction.walletId === scope.walletId ||
      (transaction.type === "transfer" &&
        transaction.transferToWalletId === scope.walletId)
    );
  });
}

export type TransactionIncomeExpenseSummary = {
  income: number;
  expense: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  transferTurnover: number;
};

/**
 * Canonical personal-finance semantics. Category planning group decides whether
 * an expense is real consumption vs. a legacy Savings/Investment allocation.
 * No synthetic income/expense is created for principal withdrawals/deposits.
 */
export function summarizeTransactionIncomeExpense(input: {
  transactions: Transaction[];
  categories: Category[];
  scope: TransactionIncomeExpenseScope;
}): TransactionIncomeExpenseSummary {
  const scoped = scopeTransactionSummaryRows(input.transactions, input.scope);
  const realExpenses = getRealExpenseTransactions(scoped, input.categories);
  const income = getTotalIncome(scoped);
  const expense = realExpenses.reduce((sum, item) => sum + item.amount, 0);
  const walletTransfers = scoped.filter(
    (transaction) =>
      transaction.type === "transfer" &&
      isInternalTransferTransaction(transaction) &&
      Boolean(transaction.transferToWalletId) &&
      transaction.transferToWalletId !== transaction.walletId,
  );

  return {
    income,
    expense,
    net: income - expense,
    incomeCount: scoped.filter((transaction) => transaction.type === "income").length,
    expenseCount: realExpenses.length,
    transferCount: walletTransfers.length,
    transferTurnover: walletTransfers.reduce(
      (sum, transaction) => sum + Math.abs(transaction.amount),
      0,
    ),
  };
}
