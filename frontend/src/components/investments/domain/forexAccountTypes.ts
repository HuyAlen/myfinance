import type {
  ForexAccount,
  ForexAccountStatus,
  ForexCashTransactionType,
} from "@/src/types/finance";

export type ForexAccountFormState = {
  id?: string;
  name: string;
  broker: string;
  accountNumber: string;
  currency: string;
  status: ForexAccountStatus;
  openedAt: string;
  notes: string;
};

export type ForexCashTransactionFormState = {
  id?: string;
  forexAccountId: string;
  walletId: string;
  type: ForexCashTransactionType;
  amount: string;
  fee: string;
  transactionDate: string;
  transactionTime: string;
  notes: string;
};

export type ForexAccountCashMetrics = ForexAccount & {
  deposits: number;
  withdrawals: number;
  fees: number;
  netCashFlow: number;
  transactionCount: number;
};

export type ForexCashAccountSummary = {
  accountCount: number;
  activeCount: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalFees: number;
  netCashFlow: number;
};
