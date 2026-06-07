export type TransactionType = "income" | "expense" | "transfer";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export type WalletType = "cash" | "bank" | "ewallet" | "investment";

export type CategoryType = "income" | "expense";

export type CategoryPlanningGroup =
  | "income"
  | "fixed"
  | "variable"
  | "saving"
  | "investment";

export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  balance: number;
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
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  walletId: string;
  note: string;
  date: string;
  // Phase 1 — wallet transfers
  transferToWalletId?: string;
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
