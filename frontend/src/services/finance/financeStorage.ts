import { supabase } from "@/src/lib/supabase";

import { buildDemoFinanceData } from "@/src/data/demoFinanceData";

import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  FinancialGroup,
  Debt,
  Goal,
  Investment,
  ForexAccount,
  ForexCashTransaction,
  Transaction,
  Wallet,
} from "@/src/types/finance";

// ─── Auth helper ──────────────────────────────────────────────────────────────

// `supabase.auth.getUser()` re-verifies the session with a network round trip
// to the Auth server on every call. This file calls getAuthUserId() from ~40
// independent read/write functions, and the Dashboard alone fires close to a
// dozen of them in parallel on load — that used to mean a dozen redundant
// network requests just to look up the same user id AuthProvider already has
// cached. `getSession()` reads the already-verified session from local
// storage (refreshing the token in the background only if it's expired), so
// it resolves the same user id without a network round trip in the common
// case. Row-level security on every Supabase query still enforces the real
// access control, so this is not a security downgrade.
async function getAuthUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

const ERR_NO_AUTH = "Không có phiên đăng nhập. Vui lòng đăng nhập lại.";

const LEGACY_FUTURE_ALLOCATION_CATEGORY_IDS = new Set([
  "saving-demo",
  "trading-capital",
]);

function isLegacyFutureAllocationCategoryId(
  categoryId: string | null | undefined,
): boolean {
  return Boolean(
    categoryId && LEGACY_FUTURE_ALLOCATION_CATEGORY_IDS.has(categoryId),
  );
}

function sanitizeDemoFinanceData(
  demoData: ReturnType<typeof buildDemoFinanceData>,
): ReturnType<typeof buildDemoFinanceData> {
  const categories = demoData.categories.filter(
    (category) => !isLegacyFutureAllocationCategoryId(category.id),
  );

  const transactions = demoData.transactions.filter(
    (transaction) =>
      !isLegacyFutureAllocationCategoryId(transaction.categoryId),
  );

  const budgets = demoData.budgets.filter(
    (budget) => !isLegacyFutureAllocationCategoryId(budget.categoryId),
  );

  const goals = demoData.goals.map((goal) => ({
    ...goal,
    savingCategoryIds: (goal.savingCategoryIds ?? []).filter(
      (categoryId) => !isLegacyFutureAllocationCategoryId(categoryId),
    ),
  }));

  return {
    ...demoData,
    categories,
    transactions,
    budgets,
    goals,
  };
}

// ─── Category planning group mapping ─────────────────────────────────────────
// `planning_group` remains the operational classification.
// `financial_group` is an optional, backward-compatible 50/30/20 classification.
// Existing rows with NULL financial_group remain valid and are not backfilled here.

type CategoryDbRow = Omit<
  Category,
  | "planningGroup"
  | "financialGroup"
  | "isRecurring"
  | "recurrence"
  | "defaultAmount"
  | "defaultWalletId"
  | "nextRunDate"
> & {
  planning_group?: CategoryPlanningGroup | null;
  financial_group?: FinancialGroup | null;
  is_recurring?: boolean | null;
  recurrence?: Category["recurrence"] | null;
  default_amount?: number | string | null;
  default_wallet_id?: string | null;
  next_run_date?: string | null;
  user_id?: string;
};

function inferDefaultPlanningGroup(
  category: Pick<Category, "type" | "name">,
): CategoryPlanningGroup {
  const name = category.name.toLowerCase();

  if (category.type === "income") return "income";

  if (
    name.includes("nhà") ||
    name.includes("điện") ||
    name.includes("nước") ||
    name.includes("gửi xe") ||
    name.includes("phí quản lý") ||
    name.includes("internet") ||
    name.includes("bảo hiểm") ||
    name.includes("học phí")
  ) {
    return "fixed";
  }

  if (
    name.includes("trading") ||
    name.includes("đầu tư") ||
    name.includes("crypto") ||
    name.includes("cổ phiếu") ||
    name.includes("etf") ||
    name.includes("vàng")
  ) {
    return "investment";
  }

  if (
    name.includes("tiết kiệm") ||
    name.includes("quỹ") ||
    name.includes("dự phòng")
  ) {
    return "saving";
  }

  return "variable";
}

function fromCategoryRow(row: CategoryDbRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    planningGroup: row.planning_group ?? inferDefaultPlanningGroup(row),
    financialGroup: row.financial_group ?? undefined,
    isRecurring: row.is_recurring ?? false,
    recurrence: row.recurrence ?? undefined,
    defaultAmount:
      row.default_amount === null || row.default_amount === undefined
        ? undefined
        : Number(row.default_amount),
    defaultWalletId: row.default_wallet_id ?? undefined,
    nextRunDate: row.next_run_date ?? undefined,
  };
}

function toCategoryRow(category: Category): Omit<CategoryDbRow, "user_id"> {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    planning_group:
      category.planningGroup ?? inferDefaultPlanningGroup(category),
    financial_group: category.financialGroup ?? null,
    is_recurring: category.isRecurring ?? false,
    recurrence: category.isRecurring ? (category.recurrence ?? null) : null,
    default_amount:
      category.isRecurring && category.defaultAmount !== undefined
        ? category.defaultAmount
        : null,
    default_wallet_id: category.isRecurring
      ? (category.defaultWalletId ?? null)
      : null,
    next_run_date: category.isRecurring ? (category.nextRunDate ?? null) : null,
  };
}

type GoalDbRow = Goal & {
  saving_category_ids?: string[] | null;
  user_id?: string;
};

function fromGoalRow(row: GoalDbRow): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount,
    currentAmount: row.currentAmount,
    savingCategoryIds: row.saving_category_ids ?? row.savingCategoryIds ?? [],
  };
}

function toGoalRow(goal: Goal): Omit<GoalDbRow, "user_id"> {
  return {
    id: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    saving_category_ids: goal.savingCategoryIds ?? [],
  };
}

type TransactionDbRow = Omit<
  Transaction,
  | "transferFee"
  | "exchangeRate"
  | "transferReference"
  | "transferReferenceType"
  | "sourceType"
  | "destinationType"
> & {
  user_id?: string;
  transfer_fee?: number | null;
  exchange_rate?: number | null;
  transfer_reference?: string | null;
  transfer_reference_type?: string | null;
  source_type?: string | null;
  destination_type?: string | null;
  transferFee?: number | null;
  exchangeRate?: number | null;
  transferReference?: string | null;
  transferReferenceType?: string | null;
  sourceType?: string | null;
  destinationType?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function fromTransactionRow(row: TransactionDbRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    categoryId: row.categoryId,
    walletId: row.walletId,
    note: row.note ?? "",
    date: row.date,
    transferToWalletId: row.transferToWalletId ?? undefined,
    transferFee: row.transfer_fee ?? row.transferFee ?? undefined,
    exchangeRate: row.exchange_rate ?? row.exchangeRate ?? undefined,
    transferReference:
      row.transfer_reference ?? row.transferReference ?? undefined,
    transferReferenceType:
      row.transfer_reference_type ?? row.transferReferenceType ?? undefined,
    sourceType: row.source_type ?? row.sourceType ?? undefined,
    destinationType: row.destination_type ?? row.destinationType ?? undefined,
    isRecurring: row.isRecurring ?? undefined,
    recurrence: row.recurrence ?? undefined,
    nextRunDate: row.nextRunDate ?? undefined,
    ...((row.created_at ?? row.createdAt)
      ? { createdAt: row.created_at ?? row.createdAt ?? undefined }
      : {}),
    ...((row.updated_at ?? row.updatedAt)
      ? { updatedAt: row.updated_at ?? row.updatedAt ?? undefined }
      : {}),
  } as Transaction;
}

function toTransactionRow(
  transaction: Transaction,
): Omit<TransactionDbRow, "user_id"> {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    categoryId: transaction.categoryId,
    walletId: transaction.walletId,
    note: transaction.note ?? "",
    date: transaction.date,
    transferToWalletId: transaction.transferToWalletId,
    isRecurring: transaction.isRecurring,
    recurrence: transaction.recurrence,
    nextRunDate: transaction.nextRunDate,
    transfer_fee: transaction.transferFee,
    exchange_rate: transaction.exchangeRate,
    transfer_reference: transaction.transferReference,
    transfer_reference_type:
      getTransferReferenceType(transaction) ??
      inferTransferReferenceType(transaction),
    source_type: getSourceType(transaction) ?? inferSourceType(transaction),
    destination_type:
      getDestinationType(transaction) ?? inferDestinationType(transaction),
  };
}

type WalletDbRow = {
  id: string;
  user_id: string;
  name: string;
  type: Wallet["type"];
  balance: number;
};

type DebtDbRow = {
  id: string;
  user_id: string;
  name: string;
  totalAmount: number;
  remainingAmount: number;
  interestRate?: number | null;
  minimumPayment?: number | null;
  dueDate?: string | null;
  loanTermMonths?: number | null;
};

type BudgetDbRow = {
  id: string;
  user_id: string;
  categoryId: string;
  month: string;
  limitAmount: number;
  rolloverAmount?: number | null;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
};

type InvestmentDbRow = {
  id: string;
  user_id: string;
  name: string;
  type: Investment["type"];
  symbol?: string | null;
  investedAmount: number;
  currentValue: number;
  purchaseDate?: string | null;
  notes?: string | null;
  quantity?: number | null;
  averageCost?: number | null;
  currentPrice?: number | null;
};

type ForexAccountDbRow = {
  id: string;
  user_id: string;
  name: string;
  broker: string;
  account_number?: string | null;
  currency: string;
  status: ForexAccount["status"];
  opened_at?: string | null;
  notes?: string | null;
  current_equity?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ForexCashTransactionDbRow = {
  id: string;
  user_id: string;
  forex_account_id: string;
  wallet_id: string;
  type: ForexCashTransaction["type"];
  amount: number;
  currency: string;
  fee?: number | null;
  transaction_date: string;
  transaction_time?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function fromForexAccountRow(row: ForexAccountDbRow): ForexAccount {
  const equityRaw = row.current_equity;
  const equityParsed =
    equityRaw === null || equityRaw === undefined || equityRaw === ""
      ? null
      : Number(equityRaw);

  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    accountNumber: row.account_number ?? undefined,
    currency: "VND",
    status: row.status,
    openedAt: row.opened_at ?? undefined,
    notes: row.notes ?? undefined,
    currentEquity:
      equityParsed !== null && Number.isFinite(equityParsed)
        ? equityParsed
        : null,
  };
}

function toForexAccountRow(
  account: ForexAccount,
  userId: string,
): ForexAccountDbRow {
  return {
    id: account.id,
    user_id: userId,
    name: account.name,
    broker: account.broker,
    account_number: account.accountNumber ?? null,
    currency: account.currency,
    status: account.status,
    opened_at: account.openedAt ?? null,
    notes: account.notes ?? null,
  };
}

function fromForexCashTransactionRow(
  row: ForexCashTransactionDbRow,
): ForexCashTransaction {
  return {
    id: row.id,
    forexAccountId: row.forex_account_id,
    walletId: row.wallet_id,
    type: row.type,
    amount: Number(row.amount ?? 0),
    currency: "VND",
    fee: Number(row.fee ?? 0),
    transactionDate: row.transaction_date,
    transactionTime: String(row.transaction_time ?? "00:00").slice(0, 5),
    transactedAt: `${row.transaction_date}T${String(row.transaction_time ?? "00:00:00").slice(0, 8)}`,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function toWalletRow(wallet: Wallet, userId: string): WalletDbRow {
  return {
    id: wallet.id,
    user_id: userId,
    name: wallet.name,
    type: wallet.type,
    balance: wallet.balance,
  };
}

function toDebtRow(debt: Debt, userId: string): DebtDbRow {
  return {
    id: debt.id,
    user_id: userId,
    name: debt.name,
    totalAmount: debt.totalAmount,
    remainingAmount: debt.remainingAmount,
    interestRate: debt.interestRate ?? null,
    minimumPayment: debt.minimumPayment ?? null,
    dueDate: debt.dueDate ?? null,
    loanTermMonths: debt.loanTermMonths ?? null,
  };
}

function toBudgetRow(budget: Budget, userId: string): BudgetDbRow {
  return {
    id: budget.id,
    user_id: userId,
    categoryId: budget.categoryId,
    month: budget.month,
    limitAmount: budget.limitAmount,
    rolloverAmount: budget.rolloverAmount ?? null,
    warningThreshold: budget.warningThreshold ?? null,
    criticalThreshold: budget.criticalThreshold ?? null,
  };
}

function toInvestmentRow(
  investment: Investment,
  userId: string,
): InvestmentDbRow {
  return {
    id: investment.id,
    user_id: userId,
    name: investment.name,
    type: investment.type,
    symbol: investment.symbol ?? null,
    investedAmount: investment.investedAmount,
    currentValue: investment.currentValue,
    purchaseDate: investment.purchaseDate ?? null,
    notes: investment.notes ?? null,
    quantity: investment.quantity ?? null,
    averageCost: investment.averageCost ?? null,
    currentPrice: investment.currentPrice ?? null,
  };
}

function toCategoryInsertRow(
  category: Category,
  userId: string,
): Omit<CategoryDbRow, "userId"> {
  return {
    ...toCategoryRow(category),
    user_id: userId,
  };
}

function toGoalInsertRow(
  goal: Goal,
  userId: string,
): Omit<GoalDbRow, "userId"> {
  return {
    ...toGoalRow(goal),
    user_id: userId,
  };
}

type TransactionWithEngineFields = Transaction & {
  transferReferenceType?: string | null;
  transfer_reference_type?: string | null;
  sourceType?: string | null;
  source_type?: string | null;
  destinationType?: string | null;
  destination_type?: string | null;
};

function getTransferReferenceType(transaction: Transaction) {
  const tx = transaction as TransactionWithEngineFields;
  return tx.transferReferenceType ?? tx.transfer_reference_type ?? undefined;
}

function getSourceType(transaction: Transaction) {
  const tx = transaction as TransactionWithEngineFields;
  return tx.sourceType ?? tx.source_type ?? undefined;
}

function getDestinationType(transaction: Transaction) {
  const tx = transaction as TransactionWithEngineFields;
  return tx.destinationType ?? tx.destination_type ?? undefined;
}

function inferTransferReferenceType(transaction: Transaction) {
  const explicitType = normalizeEngineText(
    getTransferReferenceType(transaction),
  );
  if (explicitType) return explicitType;

  const kind = inferTransactionKind(transaction);
  if (
    kind === "saving_deposit" ||
    kind === "saving_withdraw" ||
    kind === "saving_close"
  ) {
    return "saving";
  }

  if (transaction.type === "transfer") return "wallet";
  return undefined;
}

function inferSourceType(transaction: Transaction) {
  const explicitType = normalizeEngineText(getSourceType(transaction));
  if (explicitType) return explicitType;

  const kind = inferTransactionKind(transaction);
  if (kind === "income") return "external";
  if (kind === "expense") return "wallet";
  if (kind === "saving_deposit") return "wallet";
  if (kind === "saving_withdraw" || kind === "saving_close") return "saving";
  if (kind === "wallet_transfer") return "wallet";

  return undefined;
}

function inferDestinationType(transaction: Transaction) {
  const explicitType = normalizeEngineText(getDestinationType(transaction));
  if (explicitType) return explicitType;

  const kind = inferTransactionKind(transaction);
  if (kind === "income") return "wallet";
  if (kind === "expense") return "external";
  if (kind === "saving_deposit") return "saving";
  if (kind === "saving_withdraw" || kind === "saving_close") return "wallet";
  if (kind === "wallet_transfer") return "wallet";

  return undefined;
}

function normalizeTransactionForStorage(transaction: Transaction): Transaction {
  // Finance Engine v2 stores every asset movement as a transfer.
  // Saving deposit / withdraw / close are classified by
  // transfer_reference_type + source_type + destination_type, not by income/expense.
  return {
    ...transaction,
    type:
      inferTransferReferenceType(transaction) === "saving"
        ? "transfer"
        : transaction.type,
  } as Transaction;
}

function toTransactionInsertRow(
  transaction: Transaction,
  userId: string,
): Omit<TransactionDbRow, "userId"> {
  const normalizedTransaction = normalizeTransactionForStorage(transaction);
  const row = toTransactionRow(normalizedTransaction);

  return {
    ...row,
    user_id: userId,
  };
}

// ─── Readers ─────────────────────────────────────────────────────────────────

export async function getWallets(): Promise<Wallet[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getWallets:", error.message);
  return (data ?? []) as Wallet[];
}

export async function getCategories(): Promise<Category[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getCategories:", error.message);
  return ((data ?? []) as CategoryDbRow[])
    .filter((row) => !isLegacyFutureAllocationCategoryId(row.id))
    .map(fromCategoryRow);
}

export async function getTransactions(): Promise<Transaction[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) console.error("[financeStorage] getTransactions:", error.message);
  return ((data ?? []) as TransactionDbRow[])
    .filter((row) => !isLegacyFutureAllocationCategoryId(row.categoryId))
    .map(fromTransactionRow);
}

/**
 * Same as getTransactions(), scoped to an inclusive date range. Callers that
 * only need a bounded window (e.g. the Dashboard, which only ever derives
 * figures for the selected year) should use this instead of fetching the
 * user's entire transaction history.
 */
export async function getTransactionsInRange(
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });
  if (error)
    console.error("[financeStorage] getTransactionsInRange:", error.message);
  return ((data ?? []) as TransactionDbRow[])
    .filter((row) => !isLegacyFutureAllocationCategoryId(row.categoryId))
    .map(fromTransactionRow);
}

export async function getDebts(): Promise<Debt[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getDebts:", error.message);
  return (data ?? []) as Debt[];
}

export async function getGoals(): Promise<Goal[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getGoals:", error.message);
  return ((data ?? []) as GoalDbRow[]).map((row) => {
    const goal = fromGoalRow(row);
    return {
      ...goal,
      savingCategoryIds: (goal.savingCategoryIds ?? []).filter(
        (categoryId) => !isLegacyFutureAllocationCategoryId(categoryId),
      ),
    };
  });
}

export async function getBudgets(): Promise<Budget[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getBudgets:", error.message);
  return ((data ?? []) as Budget[]).filter(
    (budget) => !isLegacyFutureAllocationCategoryId(budget.categoryId),
  );
}

export async function getInvestments(): Promise<Investment[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("investments")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getInvestments:", error.message);
  return (data ?? []) as Investment[];
}

export async function getForexAccounts(): Promise<ForexAccount[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("forex_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[financeStorage] getForexAccounts:", error.message);
    throw new Error(error.message);
  }

  return ((data ?? []) as ForexAccountDbRow[]).map(fromForexAccountRow);
}

export async function getForexCashTransactions(): Promise<
  ForexCashTransaction[]
> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("forex_cash_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .order("transaction_time", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[financeStorage] getForexCashTransactions:", error.message);
    throw new Error(error.message);
  }

  return ((data ?? []) as ForexCashTransactionDbRow[]).map(
    fromForexCashTransactionRow,
  );
}

export async function getForexCashTransactionsInRange(
  startDate: string,
  endDate: string,
): Promise<ForexCashTransaction[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("forex_cash_transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate)
    .order("transaction_date", { ascending: false })
    .order("transaction_time", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[financeStorage] getForexCashTransactionsInRange:",
      error.message,
    );
    throw new Error(error.message);
  }

  return ((data ?? []) as ForexCashTransactionDbRow[]).map(
    fromForexCashTransactionRow,
  );
}

// ─── Demo seed guard ──────────────────────────────────────────────────────────
// Key stored in localStorage per user. When set, initFinanceDemoData() is a
// no-op — ensures demo data never re-seeds after "Clear All Data".

function seedGuardKey(userId: string): string {
  return `mf-skip-auto-seed-${userId}`;
}

function isSeedBlocked(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(seedGuardKey(userId)) === "1";
}

function blockSeed(userId: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(seedGuardKey(userId), "1");
  }
}

function unblockSeed(userId: string): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(seedGuardKey(userId));
  }
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

/**
 * Seeds demo data on first login ONLY.
 * Skipped when:
 *  (a) the user already has wallets in Supabase, OR
 *  (b) the seed-guard flag is set (e.g. after "Clear All Data").
 * Safe to call on every page mount — it is a no-op in both cases above.
 */
export async function initFinanceDemoData() {
  const userId = await getAuthUserId();
  if (!userId) return;

  // Respect explicit "do not auto-seed" flag set by clearAllUserData
  if (isSeedBlocked(userId)) return;

  // Check whether this user already has data
  const { data } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (data && data.length > 0) return;

  const demoData = sanitizeDemoFinanceData(buildDemoFinanceData(userId));

  await Promise.all([
    supabase.from("wallets").upsert(
      demoData.wallets.map((wallet) => toWalletRow(wallet, userId)),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase
      .from("categories")
      .upsert(
        demoData.categories.map((category) =>
          toCategoryInsertRow(category, userId),
        ) as never,
        { onConflict: "id", ignoreDuplicates: true },
      ),
    supabase
      .from("transactions")
      .upsert(
        demoData.transactions.map((transaction) =>
          toTransactionInsertRow(transaction, userId),
        ) as never,
        { onConflict: "id", ignoreDuplicates: true },
      ),
    supabase.from("debts").upsert(
      demoData.debts.map((debt) => toDebtRow(debt, userId)),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase
      .from("goals")
      .upsert(
        demoData.goals.map((goal) => toGoalInsertRow(goal, userId)) as never,
        { onConflict: "id", ignoreDuplicates: true },
      ),
    supabase.from("budgets").upsert(
      demoData.budgets.map((budget) => toBudgetRow(budget, userId)),
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase.from("investments").upsert(
      demoData.investments.map((investment) =>
        toInvestmentRow(investment, userId),
      ),
      { onConflict: "id", ignoreDuplicates: true },
    ),
  ]);
}

export async function resetFinanceDemoData(): Promise<{
  error: string | null;
}> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // Allow auto-seed to work again after an explicit reset
  unblockSeed(userId);

  const deleteErrors = await Promise.all([
    supabase.from("forex_cash_transactions").delete().eq("user_id", userId),
    supabase.from("forex_accounts").delete().eq("user_id", userId),
    supabase.from("transactions").delete().eq("user_id", userId),
    supabase.from("budgets").delete().eq("user_id", userId),
    supabase.from("goals").delete().eq("user_id", userId),
    supabase.from("debts").delete().eq("user_id", userId),
    supabase.from("investments").delete().eq("user_id", userId),
    supabase.from("categories").delete().eq("user_id", userId),
    supabase.from("wallets").delete().eq("user_id", userId),
  ]);
  const firstDeleteErr = deleteErrors.find((r) => r.error)?.error;
  if (firstDeleteErr) {
    console.error(
      "[financeStorage] resetFinanceDemoData delete:",
      firstDeleteErr.message,
    );
    return { error: firstDeleteErr.message };
  }

  const demoData = sanitizeDemoFinanceData(buildDemoFinanceData(userId));

  const insertErrors = await Promise.all([
    supabase
      .from("wallets")
      .insert(demoData.wallets.map((wallet) => toWalletRow(wallet, userId))),
    supabase
      .from("categories")
      .insert(
        demoData.categories.map((category) =>
          toCategoryInsertRow(category, userId),
        ) as never,
      ),
    supabase
      .from("transactions")
      .insert(
        demoData.transactions.map((transaction) =>
          toTransactionInsertRow(transaction, userId),
        ) as never,
      ),
    supabase
      .from("debts")
      .insert(demoData.debts.map((debt) => toDebtRow(debt, userId))),
    supabase
      .from("goals")
      .insert(
        demoData.goals.map((goal) => toGoalInsertRow(goal, userId)) as never,
      ),
    supabase
      .from("budgets")
      .insert(demoData.budgets.map((budget) => toBudgetRow(budget, userId))),
    supabase
      .from("investments")
      .insert(
        demoData.investments.map((investment) =>
          toInvestmentRow(investment, userId),
        ),
      ),
  ]);
  const firstInsertErr = insertErrors.find((r) => r.error)?.error;
  if (firstInsertErr) {
    console.error(
      "[financeStorage] resetFinanceDemoData insert:",
      firstInsertErr.message,
    );
    return { error: firstInsertErr.message };
  }

  return { error: null };
}

export async function clearAllUserData(): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const deleteSteps = [
    {
      label: "Giao dịch Forex",
      run: () =>
        supabase.from("forex_cash_transactions").delete().eq("user_id", userId),
    },
    {
      label: "Tài khoản Forex",
      run: () => supabase.from("forex_accounts").delete().eq("user_id", userId),
    },
    {
      label: "Giao dịch",
      run: () => supabase.from("transactions").delete().eq("user_id", userId),
    },
    {
      label: "Ngân sách",
      run: () => supabase.from("budgets").delete().eq("user_id", userId),
    },
    {
      label: "Mục tiêu",
      run: () => supabase.from("goals").delete().eq("user_id", userId),
    },
    {
      label: "Khoản nợ",
      run: () => supabase.from("debts").delete().eq("user_id", userId),
    },
    {
      label: "Đầu tư",
      run: () => supabase.from("investments").delete().eq("user_id", userId),
    },
    {
      label: "Danh mục",
      run: () => supabase.from("categories").delete().eq("user_id", userId),
    },
    {
      label: "Ví tiền",
      run: () => supabase.from("wallets").delete().eq("user_id", userId),
    },
  ] as const;

  for (const step of deleteSteps) {
    const { error } = await step.run();
    if (error) {
      console.error(
        `[financeStorage] clearAllUserData – ${step.label}:`,
        error.message,
      );
      return { error: `Không thể xóa ${step.label}: ${error.message}` };
    }
  }

  // Prevent auto-seed from re-populating demo data on next page load
  blockSeed(userId);

  return { error: null };
}

/** @deprecated Use clearAllUserData() — kept for internal use by importAllData */
export const clearAllData = clearAllUserData;

export async function importAllData(data: {
  wallets?: Wallet[];
  categories?: Category[];
  transactions?: Transaction[];
  debts?: Debt[];
  goals?: Goal[];
  budgets?: Budget[];
  investments?: Investment[];
  forexAccounts?: ForexAccount[];
  forexCashTransactions?: ForexCashTransaction[];
}): Promise<{ error: string | null }> {
  const clearResult = await clearAllUserData();
  if (clearResult.error) return clearResult;

  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const inserts: PromiseLike<{ error: { message: string } | null }>[] = [];

  if (data.wallets?.length) {
    inserts.push(
      supabase
        .from("wallets")
        .insert(data.wallets.map((wallet) => toWalletRow(wallet, userId))),
    );
  }

  const importCategories = (data.categories ?? []).filter(
    (category) => !isLegacyFutureAllocationCategoryId(category.id),
  );

  if (importCategories.length) {
    inserts.push(
      supabase
        .from("categories")
        .insert(
          importCategories.map((category) =>
            toCategoryInsertRow(category, userId),
          ) as never,
        ),
    );
  }

  const importTransactions = (data.transactions ?? []).filter(
    (transaction) =>
      !isLegacyFutureAllocationCategoryId(transaction.categoryId),
  );

  if (importTransactions.length) {
    inserts.push(
      supabase
        .from("transactions")
        .insert(
          importTransactions.map((transaction) =>
            toTransactionInsertRow(transaction, userId),
          ) as never,
        ),
    );
  }

  if (data.debts?.length) {
    inserts.push(
      supabase
        .from("debts")
        .insert(data.debts.map((debt) => toDebtRow(debt, userId))),
    );
  }

  if (data.goals?.length) {
    inserts.push(
      supabase
        .from("goals")
        .insert(
          data.goals.map((goal) => toGoalInsertRow(goal, userId)) as never,
        ),
    );
  }

  const importBudgets = (data.budgets ?? []).filter(
    (budget) => !isLegacyFutureAllocationCategoryId(budget.categoryId),
  );

  if (importBudgets.length) {
    inserts.push(
      supabase
        .from("budgets")
        .insert(importBudgets.map((budget) => toBudgetRow(budget, userId))),
    );
  }

  if (data.investments?.length) {
    inserts.push(
      supabase
        .from("investments")
        .insert(
          data.investments.map((investment) =>
            toInvestmentRow(investment, userId),
          ),
        ),
    );
  }

  if (data.forexAccounts?.length) {
    inserts.push(
      supabase
        .from("forex_accounts")
        .insert(
          data.forexAccounts.map((account) =>
            toForexAccountRow({ ...account, currency: "VND" }, userId),
          ),
        ),
    );
  }

  // Forex cash transactions must be restored through the RPC so wallet and
  // Forex balances stay atomic and consistent. They are intentionally not
  // inserted directly into the table here.
  if (data.forexCashTransactions?.length) {
    for (const transaction of data.forexCashTransactions) {
      const result = await addForexCashTransaction({
        ...transaction,
        currency: "VND",
      });
      if (result.error) return result;
    }
  }

  const results = await Promise.all(inserts);
  const firstErr =
    results.find((result) => result.error !== null)?.error ?? null;
  if (firstErr) {
    console.error("[financeStorage] importAllData:", firstErr.message);
    return { error: firstErr.message };
  }

  return { error: null };
}

// ─── Finance Engine v2: Transaction CRUD + Balance Sync ────────────────

type TransactionKind =
  | "income"
  | "expense"
  | "wallet_transfer"
  | "saving_deposit"
  | "saving_withdraw"
  | "saving_close";

type BalanceEffect = {
  walletId: string;
  delta: number;
};

function normalizeEngineText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function inferTransactionKind(transaction: Transaction): TransactionKind {
  const transferReferenceType = normalizeEngineText(
    getTransferReferenceType(transaction),
  );
  const sourceType = normalizeEngineText(getSourceType(transaction));
  const destinationType = normalizeEngineText(getDestinationType(transaction));

  if (transaction.type === "transfer" && transferReferenceType === "saving") {
    if (sourceType === "saving" && destinationType === "wallet") {
      const reference = normalizeEngineText(transaction.transferReference);
      const note = normalizeEngineText(transaction.note);
      if (
        reference.includes("saving_close") ||
        note.includes("tat toan tiet kiem")
      ) {
        return "saving_close";
      }
      return "saving_withdraw";
    }

    if (sourceType === "wallet" && destinationType === "saving") {
      return "saving_deposit";
    }
  }

  if (transaction.type === "income") return "income";
  if (transaction.type === "expense") return "expense";

  const note = normalizeEngineText(transaction.note);
  const reference = normalizeEngineText(transaction.transferReference);
  const text = `${note} ${reference}`.trim();

  if (
    text.includes("tat toan tiet kiem") ||
    text.startsWith("tat toan") ||
    text.includes("saving_close")
  ) {
    return "saving_close";
  }

  if (
    text.startsWith("rut tu tiet kiem") ||
    text.startsWith("rut tien tu tiet kiem") ||
    text.includes("saving_withdraw")
  ) {
    return "saving_withdraw";
  }

  if (
    text.startsWith("nap vao tiet kiem") ||
    text.startsWith("gui vao tiet kiem") ||
    text.startsWith("nap them vao tiet kiem") ||
    text.includes("saving_deposit")
  ) {
    return "saving_deposit";
  }

  return "wallet_transfer";
}

function getTransactionEffects(transaction: Transaction): BalanceEffect[] {
  const amount = Math.max(0, Number(transaction.amount) || 0);
  const kind = inferTransactionKind(transaction);

  switch (kind) {
    case "income":
      return [{ walletId: transaction.walletId, delta: amount }];

    case "expense":
      return [{ walletId: transaction.walletId, delta: -amount }];

    case "wallet_transfer":
      if (!transaction.transferToWalletId) return [];
      return [
        { walletId: transaction.walletId, delta: -amount },
        { walletId: transaction.transferToWalletId, delta: amount },
      ];

    case "saving_deposit":
      // Money leaves a wallet and becomes a saving asset.
      // Saving balance is handled by the Savings module / saving_transactions.
      return [{ walletId: transaction.walletId, delta: -amount }];

    case "saving_withdraw":
    case "saving_close":
      // Money leaves a saving asset and enters the selected wallet.
      // Saving balance is handled by the Savings module / saving_transactions.
      return [{ walletId: transaction.walletId, delta: amount }];
  }
}

/**
 * Maps the custom SQLSTATEs raised by the create/update/delete_finance_
 * transaction RPCs (see supabase/finance-engine-2-atomic-transactions.sql)
 * back to the same user-facing Vietnamese messages the previous JS-side
 * compensation logic used, so no caller/UI copy needed to change.
 */
function mapFinanceEngineError(error: { code?: string; message: string }) {
  switch (error.code) {
    case "MFE01":
      return ERR_NO_AUTH;
    case "MFE02":
      return "Không tìm thấy ví liên quan đến giao dịch.";
    case "MFE03":
      return "Không tìm thấy giao dịch.";
    case "MFE04":
      return "Dữ liệu giao dịch không hợp lệ.";
    case "MFE05":
    // wallets_balance_nn CHECK constraint — final backstop for the same rule.
    case "23514":
      return "Số dư ví không đủ để thực hiện thao tác này. Vui lòng chọn ví khác, giảm số tiền hoặc nạp thêm tiền vào ví.";
    case "MFE07":
      return "Giao dịch đã được thay đổi bởi một thao tác khác. Vui lòng tải lại và thử lại.";
    default:
      return error.message;
  }
}

export async function addTransaction(
  transaction: Transaction,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  if (
    transaction.type === "transfer" &&
    inferTransactionKind(transaction) === "wallet_transfer"
  ) {
    if (!transaction.transferToWalletId)
      return { error: "Vui lòng chọn ví nhận tiền." };
    if (transaction.walletId === transaction.transferToWalletId) {
      return { error: "Ví chuyển và ví nhận không được trùng nhau." };
    }
  }

  const effects = getTransactionEffects(transaction);
  if (effects.length === 0) {
    return { error: "Không xác định được ảnh hưởng ví của giao dịch." };
  }

  const row = toTransactionInsertRow(transaction, userId);

  // Finance Engine v2: the transaction insert and its wallet balance
  // effect(s) are applied atomically inside create_finance_transaction (see
  // supabase/finance-engine-2-atomic-transactions.sql) — a single Postgres
  // function call, one implicit DB transaction. No manual JS-side rollback
  // is needed: any failure inside the function rolls back the insert and
  // every balance update together.
  const { error } = await supabase.rpc("create_finance_transaction", {
    p_id: row.id,
    p_type: row.type,
    p_amount: row.amount,
    p_category_id: row.categoryId,
    p_wallet_id: row.walletId,
    p_note: row.note,
    p_date: row.date,
    p_transfer_to_wallet_id: row.transferToWalletId ?? null,
    p_is_recurring: row.isRecurring ?? false,
    p_recurrence: row.recurrence ?? null,
    p_next_run_date: row.nextRunDate ?? null,
    p_transfer_fee: row.transfer_fee ?? null,
    p_exchange_rate: row.exchange_rate ?? null,
    p_transfer_reference: row.transfer_reference ?? null,
    p_transfer_reference_type: row.transfer_reference_type ?? null,
    p_source_type: row.source_type ?? null,
    p_destination_type: row.destination_type ?? null,
    p_effect_wallet_id_1: effects[0].walletId,
    p_effect_delta_1: effects[0].delta,
    p_effect_wallet_id_2: effects[1]?.walletId ?? null,
    p_effect_delta_2: effects[1]?.delta ?? null,
  });

  if (error) {
    console.error("[financeStorage] addTransaction:", error.message);
    return { error: mapFinanceEngineError(error) };
  }

  return { error: null };
}

export async function updateTransaction(
  updatedTransaction: Transaction,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { data: oldData, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", updatedTransaction.id)
    .eq("user_id", userId)
    .limit(1);

  if (fetchErr) {
    console.error(
      "[financeStorage] updateTransaction – fetch:",
      fetchErr.message,
    );
    return { error: fetchErr.message };
  }

  const oldTransaction = oldData?.[0]
    ? fromTransactionRow(oldData[0] as TransactionDbRow)
    : undefined;

  if (!oldTransaction) {
    return { error: "Không tìm thấy giao dịch cần cập nhật." };
  }

  if (
    updatedTransaction.type === "transfer" &&
    inferTransactionKind(updatedTransaction) === "wallet_transfer"
  ) {
    if (!updatedTransaction.transferToWalletId)
      return { error: "Vui lòng chọn ví nhận tiền." };
    if (updatedTransaction.walletId === updatedTransaction.transferToWalletId) {
      return { error: "Ví chuyển và ví nhận không được trùng nhau." };
    }
  }

  const oldEffects = getTransactionEffects(oldTransaction);
  const newEffects = getTransactionEffects(updatedTransaction);
  if (oldEffects.length === 0 || newEffects.length === 0) {
    return { error: "Không xác định được ảnh hưởng ví của giao dịch." };
  }

  const row = toTransactionInsertRow(updatedTransaction, userId);

  // Finance Engine v2: reverse-old-effects + apply-new-effects + row update
  // all happen atomically inside update_finance_transaction. The function
  // also verifies (via p_expected_*) that the row still matches what this
  // client read as "old" — if another request changed it in between, this
  // call is rejected instead of silently reversing stale effects.
  const { error } = await supabase.rpc("update_finance_transaction", {
    p_id: updatedTransaction.id,
    p_type: row.type,
    p_amount: row.amount,
    p_category_id: row.categoryId,
    p_wallet_id: row.walletId,
    p_note: row.note,
    p_date: row.date,
    p_expected_amount: oldTransaction.amount,
    p_expected_wallet_id: oldTransaction.walletId,
    p_expected_type: oldTransaction.type,
    p_expected_transfer_to_wallet_id:
      oldTransaction.transferToWalletId ?? null,
    p_transfer_to_wallet_id: row.transferToWalletId ?? null,
    p_is_recurring: row.isRecurring ?? false,
    p_recurrence: row.recurrence ?? null,
    p_next_run_date: row.nextRunDate ?? null,
    p_transfer_fee: row.transfer_fee ?? null,
    p_exchange_rate: row.exchange_rate ?? null,
    p_transfer_reference: row.transfer_reference ?? null,
    p_transfer_reference_type: row.transfer_reference_type ?? null,
    p_source_type: row.source_type ?? null,
    p_destination_type: row.destination_type ?? null,
    p_old_effect_wallet_id_1: oldEffects[0].walletId,
    p_old_effect_delta_1: oldEffects[0].delta,
    p_old_effect_wallet_id_2: oldEffects[1]?.walletId ?? null,
    p_old_effect_delta_2: oldEffects[1]?.delta ?? null,
    p_new_effect_wallet_id_1: newEffects[0].walletId,
    p_new_effect_delta_1: newEffects[0].delta,
    p_new_effect_wallet_id_2: newEffects[1]?.walletId ?? null,
    p_new_effect_delta_2: newEffects[1]?.delta ?? null,
  });

  if (error) {
    console.error("[financeStorage] updateTransaction:", error.message);
    return { error: mapFinanceEngineError(error) };
  }

  return { error: null };
}

export async function deleteTransaction(
  transactionId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { data: transactionData, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .limit(1);

  if (fetchErr) {
    console.error(
      "[financeStorage] deleteTransaction – fetch:",
      fetchErr.message,
    );
    return { error: fetchErr.message };
  }

  const transaction = transactionData?.[0]
    ? fromTransactionRow(transactionData[0] as TransactionDbRow)
    : undefined;

  if (!transaction) {
    return { error: "Không tìm thấy giao dịch cần xóa." };
  }

  const effects = getTransactionEffects(transaction);

  // Finance Engine v2: reversing the wallet effect(s) and deleting the row
  // happen atomically inside delete_finance_transaction, with the same
  // optimistic conflict check as update (see there for the reasoning).
  const { error } = await supabase.rpc("delete_finance_transaction", {
    p_id: transactionId,
    p_expected_amount: transaction.amount,
    p_expected_wallet_id: transaction.walletId,
    p_expected_type: transaction.type,
    p_expected_transfer_to_wallet_id: transaction.transferToWalletId ?? null,
    p_effect_wallet_id_1: effects[0]?.walletId ?? null,
    p_effect_delta_1: effects[0]?.delta ?? null,
    p_effect_wallet_id_2: effects[1]?.walletId ?? null,
    p_effect_delta_2: effects[1]?.delta ?? null,
  });

  if (error) {
    console.error("[financeStorage] deleteTransaction:", error.message);
    return { error: mapFinanceEngineError(error) };
  }

  return { error: null };
}

// ─── Wallet CRUD ──────────────────────────────────────────────────────────────

export async function addWallet(
  wallet: Wallet,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("wallets")
    .insert(toWalletRow(wallet, userId));
  if (error) {
    console.error("[financeStorage] addWallet:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateWallet(
  updatedWallet: Wallet,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("wallets")
    .update(toWalletRow(updatedWallet, userId))
    .eq("id", updatedWallet.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateWallet:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteWallet(
  walletId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("wallets")
    .delete()
    .eq("id", walletId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteWallet:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/**
 * On-demand, lightweight dependency check for wallet deletion. Uses
 * head-only exact counts (no rows transferred) instead of downloading full
 * transaction history — safe to call once per delete attempt.
 *
 * No DB foreign key enforces this (walletId/transferToWalletId → wallets is
 * intentionally omitted; see supabase_schema.sql), so this application-layer
 * check remains the only integrity guard before delete.
 */
export async function hasWalletReferences(
  walletId: string,
): Promise<{ hasReferences: boolean; error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { hasReferences: false, error: ERR_NO_AUTH };

  const [sourceResult, destinationResult, forexResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("walletId", walletId),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("transferToWalletId", walletId),
    supabase
      .from("forex_cash_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("wallet_id", walletId),
  ]);

  const results = [sourceResult, destinationResult, forexResult];
  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    console.error("[financeStorage] hasWalletReferences:", firstError.message);
    return { hasReferences: false, error: firstError.message };
  }

  const hasReferences = results.some((result) => (result.count ?? 0) > 0);
  return { hasReferences, error: null };
}

/**
 * Narrow-projection, all-time read used only to compute the per-wallet
 * "linked transaction count" shown on wallet cards. Selects just the two id
 * columns needed for counting instead of full transaction rows (amount,
 * category, note, date, transfer metadata, ...), so it stays cheap even
 * across a full transaction history.
 */
export async function getTransactionWalletLinks(): Promise<
  { walletId: string; transferToWalletId: string | null }[]
> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("walletId, transferToWalletId")
    .eq("user_id", userId);

  if (error) {
    console.error("[financeStorage] getTransactionWalletLinks:", error.message);
    return [];
  }

  return (data ?? []) as { walletId: string; transferToWalletId: string | null }[];
}

/** Same narrow-projection intent as getTransactionWalletLinks, for Forex cash. */
export async function getForexCashWalletLinks(): Promise<
  { walletId: string }[]
> {
  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("forex_cash_transactions")
    .select("wallet_id")
    .eq("user_id", userId);

  if (error) {
    console.error("[financeStorage] getForexCashWalletLinks:", error.message);
    return [];
  }

  return ((data ?? []) as { wallet_id: string }[]).map((row) => ({
    walletId: row.wallet_id,
  }));
}

// ─── Category CRUD ────────────────────────────────────────────────────────────

export async function addCategory(
  category: Category,
): Promise<{ error: string | null }> {
  if (isLegacyFutureAllocationCategoryId(category.id)) {
    return {
      error:
        "Danh mục demo Tiết kiệm/Đầu tư đã bị loại bỏ. Hãy dùng module Tiết kiệm hoặc Đầu tư.",
    };
  }

  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("categories")
    .insert(toCategoryInsertRow(category, userId) as never);
  if (error) {
    console.error("[financeStorage] addCategory:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateCategory(
  updatedCategory: Category,
): Promise<{ error: string | null }> {
  if (isLegacyFutureAllocationCategoryId(updatedCategory.id)) {
    return {
      error:
        "Danh mục demo Tiết kiệm/Đầu tư đã bị loại bỏ. Hãy dùng module Tiết kiệm hoặc Đầu tư.",
    };
  }

  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("categories")
    .update(toCategoryRow(updatedCategory) as never)
    .eq("id", updatedCategory.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateCategory:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteCategory(
  categoryId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteCategory:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Budget CRUD ──────────────────────────────────────────────────────────────

export async function addBudget(
  budget: Budget,
): Promise<{ error: string | null }> {
  if (isLegacyFutureAllocationCategoryId(budget.categoryId)) {
    return {
      error: "Không thể tạo ngân sách cho danh mục demo đã bị loại bỏ.",
    };
  }

  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("budgets")
    .insert(toBudgetRow(budget, userId));
  if (error) {
    console.error("[financeStorage] addBudget:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateBudget(
  updatedBudget: Budget,
): Promise<{ error: string | null }> {
  if (isLegacyFutureAllocationCategoryId(updatedBudget.categoryId)) {
    return {
      error: "Không thể cập nhật ngân sách cho danh mục demo đã bị loại bỏ.",
    };
  }

  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("budgets")
    .update(toBudgetRow(updatedBudget, userId))
    .eq("id", updatedBudget.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateBudget:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteBudget(
  budgetId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("budgets")
    .delete()
    .eq("id", budgetId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteBudget:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Goal CRUD ────────────────────────────────────────────────────────────────

export async function addGoal(goal: Goal): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("goals")
    .insert(toGoalInsertRow(goal, userId) as never);
  if (error) {
    console.error("[financeStorage] addGoal:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateGoal(
  updatedGoal: Goal,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("goals")
    .update(toGoalRow(updatedGoal) as never)
    .eq("id", updatedGoal.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateGoal:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteGoal(
  goalId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", goalId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteGoal:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Debt CRUD ────────────────────────────────────────────────────────────────

export async function addDebt(debt: Debt): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("debts")
    .insert(toDebtRow(debt, userId));
  if (error) {
    console.error("[financeStorage] addDebt:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateDebt(
  updatedDebt: Debt,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("debts")
    .update(toDebtRow(updatedDebt, userId))
    .eq("id", updatedDebt.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateDebt:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteDebt(
  debtId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("debts")
    .delete()
    .eq("id", debtId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteDebt:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Investment CRUD ──────────────────────────────────────────────────────────

export async function addInvestment(
  investment: Investment,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("investments")
    .insert(toInvestmentRow(investment, userId));
  if (error) {
    console.error("[financeStorage] addInvestment:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateInvestment(
  updatedInvestment: Investment,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("investments")
    .update(toInvestmentRow(updatedInvestment, userId))
    .eq("id", updatedInvestment.id)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] updateInvestment:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteInvestment(
  investmentId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };
  const { error } = await supabase
    .from("investments")
    .delete()
    .eq("id", investmentId)
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] deleteInvestment:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Forex Account CRUD ──────────────────────────────────────────────────────

export async function addForexAccount(
  account: ForexAccount,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase
    .from("forex_accounts")
    .insert(toForexAccountRow(account, userId));

  if (error) {
    console.error("[financeStorage] addForexAccount:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateForexAccount(
  account: ForexAccount,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase
    .from("forex_accounts")
    .update(toForexAccountRow(account, userId))
    .eq("id", account.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[financeStorage] updateForexAccount:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteForexAccount(
  accountId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase
    .from("forex_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", userId);

  if (error) {
    console.error("[financeStorage] deleteForexAccount:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

// ─── Forex Cash Transaction CRUD ────────────────────────────────────────────

export async function addForexCashTransaction(
  transaction: ForexCashTransaction,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase.rpc("create_forex_cash_transaction", {
    p_id: transaction.id,
    p_forex_account_id: transaction.forexAccountId,
    p_wallet_id: transaction.walletId,
    p_type: transaction.type,
    p_amount: transaction.amount,
    p_currency: "VND",
    p_fee: transaction.fee ?? 0,
    p_transaction_date: transaction.transactionDate,
    p_transaction_time: transaction.transactionTime,
    p_notes: transaction.notes ?? null,
  });

  if (error) {
    console.error("[financeStorage] addForexCashTransaction:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function updateForexCashTransaction(
  transaction: ForexCashTransaction,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase.rpc("update_forex_cash_transaction", {
    p_id: transaction.id,
    p_forex_account_id: transaction.forexAccountId,
    p_wallet_id: transaction.walletId,
    p_type: transaction.type,
    p_amount: transaction.amount,
    p_currency: "VND",
    p_fee: transaction.fee ?? 0,
    p_transaction_date: transaction.transactionDate,
    p_transaction_time: transaction.transactionTime,
    p_notes: transaction.notes ?? null,
  });

  if (error) {
    console.error(
      "[financeStorage] updateForexCashTransaction:",
      error.message,
    );
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteForexCashTransaction(
  transactionId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase.rpc("delete_forex_cash_transaction", {
    p_id: transactionId,
  });

  if (error) {
    console.error(
      "[financeStorage] deleteForexCashTransaction:",
      error.message,
    );
    return { error: error.message };
  }
  return { error: null };
}

// ─── INV-4.3 Forex read-model helpers ───────────────────────────────────────

export function calculateForexCashBalance(
  transactions: ForexCashTransaction[],
): number {
  return transactions.reduce((total, transaction) => {
    const amount = Math.max(0, Number(transaction.amount) || 0);
    return total + (transaction.type === "deposit" ? amount : -amount);
  }, 0);
}

export function calculateForexCashFees(
  transactions: ForexCashTransaction[],
): number {
  return transactions.reduce(
    (total, transaction) => total + Math.max(0, Number(transaction.fee) || 0),
    0,
  );
}
