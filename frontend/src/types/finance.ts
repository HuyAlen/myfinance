export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "saving"
  | "investment";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type WalletType = "cash" | "bank" | "ewallet" | "investment";

export type SavingType =
  | "savings_account"
  | "term_deposit"
  | "certificate"
  | "emergency_fund"
  | "other";

export type CategoryType = "income" | "expense";

export type CategoryPlanningGroup =
  | "income"
  | "fixed"
  | "variable"
  | "saving"
  | "investment";

/**
 * Legacy classification value retained only so existing Supabase rows can
 * round-trip without a destructive schema migration. No active product rule
 * consumes this type.
 */
export type FinancialGroup = "income" | "needs" | "wants" | "saving";

export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  balance: number;
};

export type SavingAccount = {
  id: string;
  name: string;
  type: SavingType;
  balance: number;
  targetAmount?: number;
  interestRate?: number;
  maturityDate?: string;
  notes?: string;
};

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  /**
   * Financial planning classification used by Budget/Dashboard AI.
   * Stored in Supabase as `planning_group`.
   *
   * income     -> income category
   * fixed      -> fixed monthly expense, e.g. rent, utilities, insurance
   * variable   -> controllable/flexible expense, e.g. food, shopping
   * saving     -> saving allocation, e.g. emergency fund
   * investment -> investing allocation, e.g. trading, ETF, crypto
   */
  planningGroup?: CategoryPlanningGroup;

  /**
   * Legacy classification field retained only for storage compatibility.
   * Stored in Supabase as `financial_group` and intentionally not exposed
   * as an active budgeting rule.
   */
  financialGroup?: FinancialGroup;

  /** Category-level recurring schedule used by Dashboard upcoming bills/income. */
  isRecurring?: boolean;
  recurrence?: RecurrenceFrequency;
  defaultAmount?: number;
  defaultWalletId?: string;
  nextRunDate?: string;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  walletId: string;
  note: string;
  date: string;
  // Sprint Wallet Transfer v2 — wallet transfers
  transferToWalletId?: string;
  transferFee?: number;
  exchangeRate?: number;
  transferReference?: string;
  // Phase 2 — recurring transactions
  isRecurring?: boolean;
  recurrence?: RecurrenceFrequency;
  nextRunDate?: string;
};

export type Debt = {
  id: string;
  name: string;
  totalAmount: number;
  remainingAmount: number;
  // Phase 3 — advanced debt model
  interestRate?: number;
  minimumPayment?: number;
  dueDate?: string;
  loanTermMonths?: number;
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  /**
   * Saving categories that automatically contribute to this goal.
   * Stored in Supabase as `saving_category_ids`.
   */
  savingCategoryIds?: string[];
};

export type Budget = {
  id: string;
  categoryId: string;
  month: string;
  limitAmount: number;
  // Phase 4 — advanced budgets
  rolloverAmount?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
};

export type InvestmentType = "stock" | "crypto" | "fund" | "gold" | "other";

export type Investment = {
  id: string;
  name: string;
  type: InvestmentType;
  symbol?: string;
  investedAmount: number;
  currentValue: number;
  purchaseDate?: string;
  notes?: string;
  // Phase 5 — advanced investment data
  quantity?: number;
  averageCost?: number;
  currentPrice?: number;
};

export type NetWorthSnapshot = {
  id: string;
  snapshotMonth: string;
  cashAndWallets: number;
  savings: number;
  investments: number;
  forex: number;
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  capturedAt: string;
};

export type ForexAccountStatus = "active" | "inactive" | "archived";

export type ForexCashTransactionType = "deposit" | "withdrawal";

export type ForexAccount = {
  id: string;
  name: string;
  broker: string;
  accountNumber?: string;
  currency: string;
  status: ForexAccountStatus;
  openedAt?: string;
  notes?: string;
  /**
   * User-entered current account equity (Balance ± running/open P&L), as
   * shown on the broker's own platform (e.g. MT4/MT5). This is the account's
   * actual current value — distinct from net capital contributed (deposits
   * − withdrawals − fees), which is a cost-basis figure. `null`/undefined
   * when the user hasn't entered it yet.
   */
  currentEquity?: number | null;
};

export type ForexCashTransaction = {
  id: string;
  forexAccountId: string;
  walletId: string;
  type: ForexCashTransactionType;
  /** VND amount moved between the wallet and Forex cash account. */
  amount: number;
  /** Always VND in INV-4.2. */
  currency: "VND";
  /** Fee charged in VND. */
  fee?: number;
  transactionDate: string;
  /** Local transaction time in HH:mm format. */
  transactionTime: string;
  /** Combined timestamp returned by the read model when available. */
  transactedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
};

export type UnifiedTransactionSource = "transaction" | "forex_cash";

export type UnifiedTransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "forex_deposit"
  | "forex_withdrawal";

export type UnifiedTransaction = {
  id: string;
  source: UnifiedTransactionSource;
  sourceId: string;
  kind: UnifiedTransactionKind;
  amount: number;
  fee: number;
  date: string;
  note: string;
  walletId?: string;
  walletName?: string;
  destinationWalletId?: string;
  destinationWalletName?: string;
  forexAccountId?: string;
  forexAccountName?: string;
  categoryId?: string;
  categoryName?: string;
  editable: boolean;
  deletable: boolean;
};
