import { supabase } from "@/src/lib/supabase";

import { buildDemoFinanceData } from "@/src/data/demoFinanceData";

import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  Debt,
  Goal,
  Investment,
  ForexAccount,
  ForexCashTransaction,
  Transaction,
  Wallet,
} from "@/src/types/finance";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const ERR_NO_AUTH = "Không có phiên đăng nhập. Vui lòng đăng nhập lại.";

// ─── Category planning group mapping ─────────────────────────────────────────

type CategoryDbRow = Category & {
  planning_group?: CategoryPlanningGroup | null;
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
    planningGroup:
      row.planning_group ?? row.planningGroup ?? inferDefaultPlanningGroup(row),
  };
}

function toCategoryRow(category: Category): Omit<CategoryDbRow, "user_id"> {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    planning_group:
      category.planningGroup ?? inferDefaultPlanningGroup(category),
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
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    accountNumber: row.account_number ?? undefined,
    currency: "VND",
    status: row.status,
    openedAt: row.opened_at ?? undefined,
    notes: row.notes ?? undefined,
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
  return ((data ?? []) as CategoryDbRow[]).map(fromCategoryRow);
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
  return ((data ?? []) as TransactionDbRow[]).map(fromTransactionRow);
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
  return ((data ?? []) as GoalDbRow[]).map(fromGoalRow);
}

export async function getBudgets(): Promise<Budget[]> {
  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId);
  if (error) console.error("[financeStorage] getBudgets:", error.message);
  return (data ?? []) as Budget[];
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

  const demoData = buildDemoFinanceData(userId);

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

  const demoData = buildDemoFinanceData(userId);

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

  if (data.categories?.length) {
    inserts.push(
      supabase
        .from("categories")
        .insert(
          data.categories.map((category) =>
            toCategoryInsertRow(category, userId),
          ) as never,
        ),
    );
  }

  if (data.transactions?.length) {
    inserts.push(
      supabase
        .from("transactions")
        .insert(
          data.transactions.map((transaction) =>
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

  if (data.budgets?.length) {
    inserts.push(
      supabase
        .from("budgets")
        .insert(data.budgets.map((budget) => toBudgetRow(budget, userId))),
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

function collectWalletIdsFromTransactions(transactions: Transaction[]) {
  const ids = new Set<string>();
  transactions.forEach((transaction) => {
    getTransactionEffects(transaction).forEach((effect) => {
      if (effect.walletId) ids.add(effect.walletId);
    });
  });
  return [...ids];
}

async function fetchWalletBalanceMap(userId: string, walletIds: string[]) {
  const uniqueWalletIds = [...new Set(walletIds)].filter(Boolean);
  if (uniqueWalletIds.length === 0) {
    return {
      wallets: [] as Wallet[],
      balanceMap: new Map<string, number>(),
      error: null as string | null,
    };
  }

  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .in("id", uniqueWalletIds);

  if (error) {
    return {
      wallets: [] as Wallet[],
      balanceMap: new Map<string, number>(),
      error: error.message,
    };
  }

  const wallets = (data ?? []) as Wallet[];
  const balanceMap = new Map(
    wallets.map((wallet) => [wallet.id, wallet.balance]),
  );

  for (const walletId of uniqueWalletIds) {
    if (!balanceMap.has(walletId)) {
      return {
        wallets,
        balanceMap,
        error: "Không tìm thấy ví liên quan đến giao dịch.",
      };
    }
  }

  return { wallets, balanceMap, error: null };
}

function applyEffectsToBalanceMap(
  balanceMap: Map<string, number>,
  transaction: Transaction,
  direction: 1 | -1,
) {
  for (const effect of getTransactionEffects(transaction)) {
    const currentBalance = balanceMap.get(effect.walletId);
    if (currentBalance === undefined) {
      return "Không tìm thấy ví liên quan đến giao dịch.";
    }
    balanceMap.set(effect.walletId, currentBalance + effect.delta * direction);
  }
  return null;
}

function getNegativeWalletError(balanceMap: Map<string, number>) {
  const negativeWallet = [...balanceMap.entries()].find(
    ([, balance]) => balance < 0,
  );
  if (!negativeWallet) return null;
  return "Số dư ví không đủ để thực hiện thao tác này. Vui lòng chọn ví khác, giảm số tiền hoặc nạp thêm tiền vào ví.";
}

async function persistWalletBalances(
  userId: string,
  originalWallets: Wallet[],
  nextBalanceMap: Map<string, number>,
) {
  const changedWallets = originalWallets.filter(
    (wallet) =>
      nextBalanceMap.has(wallet.id) &&
      nextBalanceMap.get(wallet.id) !== wallet.balance,
  );

  const updateResults = await Promise.all(
    changedWallets.map((wallet) =>
      supabase
        .from("wallets")
        .update({ balance: nextBalanceMap.get(wallet.id) ?? wallet.balance })
        .eq("id", wallet.id)
        .eq("user_id", userId),
    ),
  );

  const firstError = updateResults.find((result) => result.error)?.error;
  return firstError?.message ?? null;
}

async function restoreWalletBalances(userId: string, wallets: Wallet[]) {
  await Promise.all(
    wallets.map((wallet) =>
      supabase
        .from("wallets")
        .update({ balance: wallet.balance })
        .eq("id", wallet.id)
        .eq("user_id", userId),
    ),
  );
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

  const walletIds = collectWalletIdsFromTransactions([transaction]);
  const {
    wallets,
    balanceMap,
    error: walletFetchError,
  } = await fetchWalletBalanceMap(userId, walletIds);
  if (walletFetchError) {
    console.error(
      "[financeStorage] addTransaction – fetch wallets:",
      walletFetchError,
    );
    return { error: walletFetchError };
  }

  const effectError = applyEffectsToBalanceMap(balanceMap, transaction, 1);
  if (effectError) return { error: effectError };

  const negativeError = getNegativeWalletError(balanceMap);
  if (negativeError) return { error: negativeError };

  const { error: txErr } = await supabase
    .from("transactions")
    .insert(toTransactionInsertRow(transaction, userId) as never);

  if (txErr) {
    console.error("[financeStorage] addTransaction:", txErr.message);
    return { error: txErr.message };
  }

  const balanceError = await persistWalletBalances(userId, wallets, balanceMap);
  if (balanceError) {
    await supabase
      .from("transactions")
      .delete()
      .eq("id", transaction.id)
      .eq("user_id", userId);

    console.error(
      "[financeStorage] addTransaction – wallet balance:",
      balanceError,
    );
    return { error: balanceError };
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

  const walletIds = collectWalletIdsFromTransactions([
    oldTransaction,
    updatedTransaction,
  ]);
  const {
    wallets,
    balanceMap,
    error: walletFetchError,
  } = await fetchWalletBalanceMap(userId, walletIds);
  if (walletFetchError) {
    console.error(
      "[financeStorage] updateTransaction – fetch wallets:",
      walletFetchError,
    );
    return { error: walletFetchError };
  }

  const reverseError = applyEffectsToBalanceMap(balanceMap, oldTransaction, -1);
  if (reverseError) return { error: reverseError };

  const applyError = applyEffectsToBalanceMap(
    balanceMap,
    updatedTransaction,
    1,
  );
  if (applyError) return { error: applyError };

  const negativeError = getNegativeWalletError(balanceMap);
  if (negativeError) return { error: negativeError };

  const { error: txErr } = await supabase
    .from("transactions")
    .update({ ...toTransactionInsertRow(updatedTransaction, userId) } as never)
    .eq("id", updatedTransaction.id)
    .eq("user_id", userId);

  if (txErr) {
    console.error("[financeStorage] updateTransaction:", txErr.message);
    return { error: txErr.message };
  }

  const balanceError = await persistWalletBalances(userId, wallets, balanceMap);
  if (balanceError) {
    await supabase
      .from("transactions")
      .update({ ...toTransactionInsertRow(oldTransaction, userId) } as never)
      .eq("id", oldTransaction.id)
      .eq("user_id", userId);
    await restoreWalletBalances(userId, wallets);

    console.error(
      "[financeStorage] updateTransaction – wallet balance:",
      balanceError,
    );
    return { error: balanceError };
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

  const walletIds = collectWalletIdsFromTransactions([transaction]);
  const {
    wallets,
    balanceMap,
    error: walletFetchError,
  } = await fetchWalletBalanceMap(userId, walletIds);
  if (walletFetchError) {
    console.error(
      "[financeStorage] deleteTransaction – fetch wallets:",
      walletFetchError,
    );
    return { error: walletFetchError };
  }

  const reverseError = applyEffectsToBalanceMap(balanceMap, transaction, -1);
  if (reverseError) return { error: reverseError };

  const negativeError = getNegativeWalletError(balanceMap);
  if (negativeError) return { error: negativeError };

  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (delErr) {
    console.error("[financeStorage] deleteTransaction:", delErr.message);
    return { error: delErr.message };
  }

  const balanceError = await persistWalletBalances(userId, wallets, balanceMap);
  if (balanceError) {
    await supabase
      .from("transactions")
      .insert(toTransactionInsertRow(transaction, userId) as never);
    await restoreWalletBalances(userId, wallets);

    console.error(
      "[financeStorage] deleteTransaction – wallet balance:",
      balanceError,
    );
    return { error: balanceError };
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

// ─── Category CRUD ────────────────────────────────────────────────────────────

export async function addCategory(
  category: Category,
): Promise<{ error: string | null }> {
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
