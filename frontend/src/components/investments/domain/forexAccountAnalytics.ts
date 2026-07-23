import type { ForexAccount, ForexCashTransaction } from "@/src/types/finance";
import type {
  ForexAccountCashMetrics,
  ForexCashAccountSummary,
} from "./forexAccountTypes";

export function calculateForexAccountCashMetrics(
  account: ForexAccount,
  transactions: ForexCashTransaction[],
): ForexAccountCashMetrics {
  const accountTransactions = transactions.filter(
    (transaction) => transaction.forexAccountId === account.id,
  );
  const deposits = accountTransactions
    .filter((transaction) => transaction.type === "deposit")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const withdrawals = accountTransactions
    .filter((transaction) => transaction.type === "withdrawal")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const fees = accountTransactions.reduce(
    (sum, transaction) => sum + (transaction.fee ?? 0),
    0,
  );

  return {
    ...account,
    deposits,
    withdrawals,
    fees,
    netCashFlow: deposits - withdrawals,
    transactionCount: accountTransactions.length,
  };
}

export function summarizeForexCashAccounts(
  accounts: ForexAccount[],
  transactions: ForexCashTransaction[],
): ForexCashAccountSummary {
  const metrics = accounts.map((account) =>
    calculateForexAccountCashMetrics(account, transactions),
  );

  return {
    accountCount: accounts.length,
    activeCount: accounts.filter((account) => account.status === "active")
      .length,
    totalDeposited: metrics.reduce((sum, account) => sum + account.deposits, 0),
    totalWithdrawn: metrics.reduce(
      (sum, account) => sum + account.withdrawals,
      0,
    ),
    totalFees: metrics.reduce((sum, account) => sum + account.fees, 0),
    netCashFlow: metrics.reduce((sum, account) => sum + account.netCashFlow, 0),
  };
}
