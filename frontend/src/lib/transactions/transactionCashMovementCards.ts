import type { Category, ForexCashTransaction, Transaction } from "@/src/types/finance";
import {
  calculateFinanceFlowSnapshot,
  type FinanceFlowSnapshot,
  type SavingAllocationMovement,
} from "@/src/services/finance/financeCalculations";
import {
  isInvestmentManagedTransaction,
  isSavingsManagedTransaction,
} from "@/src/lib/transactions/transactionClassification";

/**
 * TRANSACTIONS-CASH-MOVEMENT-CARDS-1
 * This page displays only ordinary transaction rows. The canonical
 * Investment/Savings transfer mirrors remain persisted for integrity,
 * but their history/actions belong to their owning domain pages.
 */
export function isOrdinaryTransactionFeedRow(transaction: Transaction) {
  return (
    !isInvestmentManagedTransaction(transaction) &&
    !isSavingsManagedTransaction(transaction)
  );
}

export type CashMovementCardScope = {
  effectiveRange: { startDate: string; endDate: string };
  dateFrom?: string;
  dateTo?: string;
  walletId?: string;
};

function scopedDay(day: string, startDate: string, endDate: string) {
  const value = String(day ?? "").slice(0, 10);
  return value >= startDate && value <= endDate;
}

function effectiveWindow(scope: CashMovementCardScope) {
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

/** Only the wallet/date context scopes cards; text/category/type/amount are feed-only. */
export function scopeWalletCashMovementTransactions(
  transactions: Transaction[],
  scope: CashMovementCardScope,
): Transaction[] {
  const { startDate, endDate } = effectiveWindow(scope);
  return transactions.filter(
    (transaction) =>
      scopedDay(transaction.date, startDate, endDate) &&
      (!scope.walletId ||
        transaction.walletId === scope.walletId ||
        // Included for the internal-transfer turnover card. Transfers
        // between spendable wallets never count as cashIn/cashOut.
        (transaction.type === "transfer" &&
          transaction.transferToWalletId === scope.walletId)),
  );
}

/**
 * Reuse FINANCE-FLOW-SSOT-1 for wallet movement, never derive it from the
 * visible feed or fabricate ordinary income/expense transactions.
 * Forex withdrawals are net-of-fee wallet receipts; Savings-to-Savings
 * movements have no walletId and therefore cannot inflate cash movement.
 */
export function summarizeTransactionWalletCashMovement(input: {
  transactions: Transaction[];
  categories: Category[];
  savingMovements: SavingAllocationMovement[];
  forexCashTransactions: ForexCashTransaction[];
  scope: CashMovementCardScope;
}): FinanceFlowSnapshot {
  const window = effectiveWindow(input.scope);
  const scopedTransactions = scopeWalletCashMovementTransactions(
    input.transactions,
    input.scope,
  );
  const scopedSavings = input.savingMovements.filter(
    (movement) =>
      scopedDay(movement.date, window.startDate, window.endDate) &&
      (!input.scope.walletId || movement.walletId === input.scope.walletId),
  );
  const scopedForex = input.forexCashTransactions.filter(
    (movement) =>
      scopedDay(movement.transactionDate, window.startDate, window.endDate) &&
      (!input.scope.walletId || movement.walletId === input.scope.walletId),
  );

  return calculateFinanceFlowSnapshot({
    transactions: scopedTransactions,
    categories: input.categories,
    savingMovements: scopedSavings,
    forexCashTransactions: scopedForex,
    dateRange: window,
  });
}
