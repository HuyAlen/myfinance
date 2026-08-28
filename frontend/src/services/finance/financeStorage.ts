import { supabase } from "@/src/lib/supabase";

import { buildDemoFinanceData } from "@/src/data/demoFinanceData";

import { inferCategoryPlanningGroup } from "@/src/services/finance/financeCalculations";

import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  FinancialGroup,
  Debt,
  Goal,
  Investment,
  NetWorthSnapshot,
  SavingAccount,
  ForexAccount,
  ForexCashTransaction,
  Transaction,
  Wallet,
} from "@/src/types/finance";

// ─── Local UI mode ────────────────────────────────────────────────────────────

const LOCAL_UI_MODE =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LOCAL_UI_MODE === "true";
const LOCAL_UI_USER_ID = "local-ui-user";

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
  if (LOCAL_UI_MODE) return LOCAL_UI_USER_ID;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

const ERR_NO_AUTH = "Không có phiên đăng nhập. Vui lòng đăng nhập lại.";

// ─── NETWORTH-HISTORY-1 / FINANCE-DATA-2 backup contract ────────────────────

export const FINANCE_BACKUP_FORMAT = "myfinance-backup" as const;
export const FINANCE_BACKUP_VERSION = 3 as const;
export const FINANCE_BACKUP_V2_VERSION = 2 as const;
export const FINANCE_BACKUP_V2_DOMAINS = [
  "wallets",
  "categories",
  "transactions",
  "debts",
  "goals",
  "budgets",
  "investments",
  "savings",
  "saving_transactions",
  "forex_accounts",
  "forex_cash_transactions",
] as const;
export const FINANCE_BACKUP_DOMAINS = [
  ...FINANCE_BACKUP_V2_DOMAINS,
  "net_worth_snapshots",
] as const;

export type FinanceBackupDomain = (typeof FINANCE_BACKUP_DOMAINS)[number];
export type FinanceBackupV2Domain = (typeof FINANCE_BACKUP_V2_DOMAINS)[number];
export type FinanceBackupRow = Record<string, unknown>;
export type FinanceBackupData = Record<FinanceBackupDomain, FinanceBackupRow[]>;
export type FinanceBackupV2Data = Record<
  FinanceBackupV2Domain,
  FinanceBackupRow[]
>;

export type FinanceBackupV2 = {
  format: typeof FINANCE_BACKUP_FORMAT;
  version: typeof FINANCE_BACKUP_V2_VERSION;
  exported_at: string;
  data: FinanceBackupV2Data;
};

export type FinanceBackupV3 = {
  format: typeof FINANCE_BACKUP_FORMAT;
  version: typeof FINANCE_BACKUP_VERSION;
  exported_at: string;
  data: FinanceBackupData;
};

export type FinanceBackupValidationResult =
  | { ok: true; backup: FinanceBackupV3; sourceVersion: 2 | 3 }
  | { ok: false; error: string };

const LEGACY_BACKUP_KEYS = [
  "pf_wallets",
  "pf_categories",
  "pf_transactions",
  "pf_debts",
  "pf_goals",
  "pf_budgets",
  "pf_investments",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBackupDomains(
  data: Record<string, unknown>,
  domains: readonly string[],
): string | null {
  for (const domain of domains) {
    const rows = data[domain];
    if (!Array.isArray(rows)) {
      return `Backup thiếu dữ liệu bắt buộc: ${domain}.`;
    }
    if (!rows.every(isRecord)) {
      return `Backup có dữ liệu không hợp lệ trong ${domain}.`;
    }
  }
  return null;
}

export function validateFinanceBackup(
  input: unknown,
): FinanceBackupValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: "File backup không hợp lệ." };
  }

  if (LEGACY_BACKUP_KEYS.some((key) => key in input)) {
    return {
      ok: false,
      error:
        "Đây là backup phiên bản cũ và không chứa đầy đủ Savings/Forex. Không thể khôi phục tự động để tránh mất dữ liệu.",
    };
  }

  if (input.format !== FINANCE_BACKUP_FORMAT) {
    return {
      ok: false,
      error: "File không phải backup MyFinance hợp lệ.",
    };
  }

  if (
    typeof input.exported_at !== "string" ||
    Number.isNaN(Date.parse(input.exported_at))
  ) {
    return {
      ok: false,
      error: "Backup thiếu thời điểm export hợp lệ.",
    };
  }

  if (!isRecord(input.data)) {
    return { ok: false, error: "Backup thiếu khối dữ liệu bắt buộc." };

  }
  const backupData = input.data;

  if (input.version !== 2 && input.version !== 3) {
    return {
      ok: false,
      error: `Phiên bản backup không được hỗ trợ. Cần version ${FINANCE_BACKUP_VERSION} (hoặc V2 để nâng cấp an toàn).`,
    };
  }

  const sourceVersion = input.version;
  const requiredDomains =
    sourceVersion === FINANCE_BACKUP_V2_VERSION
      ? FINANCE_BACKUP_V2_DOMAINS
      : FINANCE_BACKUP_DOMAINS;
  const domainError = validateBackupDomains(backupData, requiredDomains);
  if (domainError) return { ok: false, error: domainError };

  if (sourceVersion === FINANCE_BACKUP_V2_VERSION) {
    const normalizedData = Object.fromEntries(
      FINANCE_BACKUP_V2_DOMAINS.map((domain) => [domain, backupData[domain]]),
    ) as FinanceBackupV2Data;

    return {
      ok: true,
      sourceVersion,
      backup: {
        format: FINANCE_BACKUP_FORMAT,
        version: FINANCE_BACKUP_VERSION,
        exported_at: input.exported_at,
        data: {
          ...normalizedData,
          net_worth_snapshots: [],
        },
      },
    };
  }

  const normalizedData = Object.fromEntries(
    FINANCE_BACKUP_DOMAINS.map((domain) => [domain, backupData[domain]]),
  ) as FinanceBackupData;

  return {
    ok: true,
    sourceVersion,
    backup: {
      format: FINANCE_BACKUP_FORMAT,
      version: FINANCE_BACKUP_VERSION,
      exported_at: input.exported_at,
      data: normalizedData,
    },
  };
}

function mapFinanceBackupError(error: { code?: string; message: string }) {
  switch (error.code) {
    case "MFB01":
      return ERR_NO_AUTH;
    case "MFB02":
      return "File backup không hợp lệ hoặc không đầy đủ.";
    case "MFB03":
      return `Phiên bản backup không được hỗ trợ. Cần version ${FINANCE_BACKUP_VERSION} (V2 vẫn có thể được nâng cấp khi restore).`;
    case "MFB04":
      return "Đây là backup phiên bản cũ và không chứa đầy đủ Savings/Forex. Không thể khôi phục tự động để tránh mất dữ liệu.";
    default:
      return error.message;
  }
}

export async function exportFinanceBackup(): Promise<FinanceBackupV3> {
  if (LOCAL_UI_MODE) {
    throw new Error(
      "Backup cloud không khả dụng khi NEXT_PUBLIC_LOCAL_UI_MODE=true.",
    );
  }

  const { data, error } = await supabase.rpc("export_finance_backup");
  if (error) {
    console.error("[financeStorage] exportFinanceBackup:", error.message);
    throw new Error(mapFinanceBackupError(error));
  }

  const validation = validateFinanceBackup(data);
  if (!validation.ok) {
    console.error(
      "[financeStorage] exportFinanceBackup returned invalid payload:",
      validation.error,
    );
    throw new Error(validation.error);
  }

  if (validation.sourceVersion !== FINANCE_BACKUP_VERSION) {
    throw new Error("Máy chủ trả về backup cũ. Vui lòng áp dụng migration Net Worth History trước khi export.");
  }

  return validation.backup;
}

export async function restoreFinanceBackup(
  input: unknown,
): Promise<{ error: string | null }> {
  if (LOCAL_UI_MODE) {
    return {
      error: "Khôi phục backup cloud không khả dụng trong Local UI Mode.",
    };
  }

  const validation = validateFinanceBackup(input);
  if (!validation.ok) return { error: validation.error };

  // V2 is normalized client-side to a V3 envelope with an empty snapshot
  // collection. The server then restores state and captures exactly one
  // current-month baseline rather than fabricating historical months.
  const { error } = await supabase.rpc("restore_finance_backup", {
    p_backup: validation.backup,
  });

  if (error) {
    console.error("[financeStorage] restoreFinanceBackup:", error.message);
    return { error: mapFinanceBackupError(error) };
  }

  return { error: null };
}

function createEmptyFinanceBackupV3(
  exportedAt = new Date().toISOString(),
): FinanceBackupV3 {
  const data: FinanceBackupData = {
    wallets: [],
    categories: [],
    transactions: [],
    debts: [],
    goals: [],
    budgets: [],
    investments: [],
    savings: [],
    saving_transactions: [],
    forex_accounts: [],
    forex_cash_transactions: [],
    net_worth_snapshots: [],
  };

  return {
    format: FINANCE_BACKUP_FORMAT,
    version: FINANCE_BACKUP_VERSION,
    exported_at: exportedAt,
    data,
  };
}

function withSnapshotTimestamps<T extends FinanceBackupRow>(
  row: T,
  timestamp: string,
): FinanceBackupRow {
  return {
    ...row,
    created_at: row.created_at ?? timestamp,
    updated_at: row.updated_at ?? timestamp,
  };
}

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
    linkedSavingIds: goal.linkedSavingIds ?? [],
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

function getLocalUiDemoData() {
  return sanitizeDemoFinanceData(buildDemoFinanceData(LOCAL_UI_USER_ID));
}

// ─── Category planning group mapping ─────────────────────────────────────────
// `planning_group` remains the operational classification.
// `financial_group` is retained only for backward-compatible row round-tripping.
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
  return inferCategoryPlanningGroup(category);
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

const GOAL_SAVING_LINK_PREFIX = "saving:";
const GOAL_CATEGORY_LINK_PREFIX = "category:";

function decodeGoalFundingLinks(row: GoalDbRow) {
  const rawLinks = row.saving_category_ids ?? row.savingCategoryIds ?? [];
  const linkedSavingIds = [...(row.linkedSavingIds ?? [])];
  const savingCategoryIds: string[] = [];

  for (const rawLink of rawLinks) {
    if (rawLink.startsWith(GOAL_SAVING_LINK_PREFIX)) {
      linkedSavingIds.push(rawLink.slice(GOAL_SAVING_LINK_PREFIX.length));
      continue;
    }
    if (rawLink.startsWith(GOAL_CATEGORY_LINK_PREFIX)) {
      savingCategoryIds.push(rawLink.slice(GOAL_CATEGORY_LINK_PREFIX.length));
      continue;
    }

    // Pre-GOAL-SAVINGS-SSOT-1 rows are intentionally left unclassified here.
    // `resolveGoalFundingLinks` owns the migration because only callers that
    // have the real Savings snapshot can safely distinguish an old Saving ID
    // from a legacy Category ID.
    savingCategoryIds.push(rawLink);
  }

  return {
    linkedSavingIds: [...new Set(linkedSavingIds.filter(Boolean))],
    savingCategoryIds: [...new Set(savingCategoryIds.filter(Boolean))],
  };
}

function encodeGoalFundingLinks(goal: Goal) {
  return [
    ...(goal.savingCategoryIds ?? []).map(
      (id) => `${GOAL_CATEGORY_LINK_PREFIX}${id}`,
    ),
    ...(goal.linkedSavingIds ?? []).map(
      (id) => `${GOAL_SAVING_LINK_PREFIX}${id}`,
    ),
  ];
}

function fromGoalRow(row: GoalDbRow): Goal {
  const links = decodeGoalFundingLinks(row);
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.targetAmount,
    currentAmount: row.currentAmount,
    ...links,
  };
}

function toGoalRow(goal: Goal): Omit<GoalDbRow, "user_id"> {
  return {
    id: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    saving_category_ids: encodeGoalFundingLinks(goal),
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
    current_equity: account.currentEquity ?? null,
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
  if (LOCAL_UI_MODE) return getLocalUiDemoData().wallets;

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] getWallets:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Wallet[];
}

export async function getCategories(): Promise<Category[]> {
  if (LOCAL_UI_MODE) return getLocalUiDemoData().categories;

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] getCategories:", error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as CategoryDbRow[])
    .filter((row) => !isLegacyFutureAllocationCategoryId(row.id))
    .map(fromCategoryRow);
}

export async function getTransactions(): Promise<Transaction[]> {
  if (LOCAL_UI_MODE) {
    return [...getLocalUiDemoData().transactions].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
  }

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) {
    console.error("[financeStorage] getTransactions:", error.message);
    throw new Error(error.message);
  }
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
  if (LOCAL_UI_MODE) {
    return getLocalUiDemoData()
      .transactions.filter(
        (transaction) =>
          transaction.date >= startDate && transaction.date <= endDate,
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });
  if (error) {
    console.error("[financeStorage] getTransactionsInRange:", error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as TransactionDbRow[])
    .filter((row) => !isLegacyFutureAllocationCategoryId(row.categoryId))
    .map(fromTransactionRow);
}

/**
 * Minimal whole-history transaction reader for cumulative Goal funding.
 *
 * General analytics pages should keep using bounded date-range reads. Goal
 * progress is different: legacy category-linked goals are cumulative, so a
 * selected year/analytics window must never change their effective balance.
 * Only the fields read by `calculateGoalFundingSnapshot` are selected.
 */
export async function getGoalFundingTransactions(): Promise<Transaction[]> {
  if (LOCAL_UI_MODE) {
    return getLocalUiDemoData()
      .transactions.filter(
        (transaction) =>
          transaction.type === "expense" || transaction.type === "saving",
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("transactions")
    .select("id,type,amount,categoryId,walletId,note,date")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) {
    console.error(
      "[financeStorage] getGoalFundingTransactions:",
      error.message,
    );
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{
    id: string;
    type: Transaction["type"];
    amount: number;
    categoryId: string;
    walletId: string;
    note: string | null;
    date: string;
  }>)
    .filter(
      (row) =>
        !isLegacyFutureAllocationCategoryId(row.categoryId) &&
        (row.type === "expense" || row.type === "saving"),
    )
    .map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount || 0),
      categoryId: row.categoryId,
      walletId: row.walletId,
      note: row.note ?? "",
      date: row.date,
    }));
}

export async function getDebts(): Promise<Debt[]> {
  if (LOCAL_UI_MODE) return getLocalUiDemoData().debts;

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] getDebts:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Debt[];
}

export async function getGoals(): Promise<Goal[]> {
  if (LOCAL_UI_MODE) return getLocalUiDemoData().goals;

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] getGoals:", error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as GoalDbRow[]).map((row) => {
    const goal = fromGoalRow(row);
    return {
      ...goal,
      linkedSavingIds: goal.linkedSavingIds ?? [],
      savingCategoryIds: (goal.savingCategoryIds ?? []).filter(
        (categoryId) => !isLegacyFutureAllocationCategoryId(categoryId),
      ),
    };
  });
}

export async function getSavings(): Promise<SavingAccount[]> {
  if (LOCAL_UI_MODE) return [];

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("savings")
    .select("id,name,type,balance,interest_rate,maturity_date,notes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[financeStorage] getSavings:", error.message);
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    type: SavingAccount["type"];
    balance: number | string | null;
    interest_rate: number | string | null;
    maturity_date: string | null;
    notes: string | null;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Number(row.balance ?? 0),
    interestRate:
      row.interest_rate === null || row.interest_rate === undefined
        ? undefined
        : Number(row.interest_rate),
    maturityDate: row.maturity_date ?? undefined,
    notes: row.notes ?? undefined,
  }));
}

export async function getBudgets(): Promise<Budget[]> {
  if (LOCAL_UI_MODE) return getLocalUiDemoData().budgets;

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] getBudgets:", error.message);
    throw new Error(error.message);
  }
  return ((data ?? []) as Budget[]).filter(
    (budget) => !isLegacyFutureAllocationCategoryId(budget.categoryId),
  );
}

export async function getInvestments(): Promise<Investment[]> {
  if (LOCAL_UI_MODE) return getLocalUiDemoData().investments;

  const userId = await getAuthUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("investments")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("[financeStorage] getInvestments:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as Investment[];
}

type NetWorthSnapshotDbRow = {
  id: string;
  snapshot_month: string;
  cash_and_wallets: number | string;
  savings: number | string;
  investments: number | string;
  forex: number | string;
  total_assets: number | string;
  total_debt: number | string;
  net_worth: number | string;
  captured_at: string;
};

function fromNetWorthSnapshotRow(row: NetWorthSnapshotDbRow): NetWorthSnapshot {
  return {
    id: row.id,
    snapshotMonth: row.snapshot_month,
    cashAndWallets: Number(row.cash_and_wallets),
    savings: Number(row.savings),
    investments: Number(row.investments),
    forex: Number(row.forex),
    totalAssets: Number(row.total_assets),
    totalDebt: Number(row.total_debt),
    netWorth: Number(row.net_worth),
    capturedAt: row.captured_at,
  };
}

/**
 * Reads persisted canonical monthly Net Worth snapshots for one bounded range.
 * Missing months remain missing; this function never reconstructs history from
 * current balances or transaction deltas.
 */
export async function getNetWorthSnapshotsInRange(
  startMonth: string,
  endMonth: string,
): Promise<NetWorthSnapshot[]> {
  if (LOCAL_UI_MODE) return [];

  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select(
      "id,snapshot_month,cash_and_wallets,savings,investments,forex,total_assets,total_debt,net_worth,captured_at",
    )
    .eq("user_id", userId)
    .gte("snapshot_month", startMonth)
    .lte("snapshot_month", endMonth)
    .order("snapshot_month", { ascending: true });

  if (error) {
    console.error(
      "[financeStorage] getNetWorthSnapshotsInRange:",
      error.message,
    );
    throw new Error(error.message);
  }

  return ((data ?? []) as NetWorthSnapshotDbRow[]).map(
    fromNetWorthSnapshotRow,
  );
}

export async function getForexAccounts(): Promise<ForexAccount[]> {
  if (LOCAL_UI_MODE) return [];

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
  if (LOCAL_UI_MODE) return [];

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
  if (LOCAL_UI_MODE) return [];

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
 * Builds the exact V3 snapshot used by both first-login auto-seed and explicit
 * "Reset Demo Data". Keeping one serializer prevents the two flows from
 * drifting on field names, timestamp defaults, or domain coverage.
 */
function buildDemoFinanceBackup(
  userId: string,
  timestamp = new Date().toISOString(),
): FinanceBackupV3 {
  const demoData = sanitizeDemoFinanceData(buildDemoFinanceData(userId));
  const backup = createEmptyFinanceBackupV3(timestamp);

  backup.data.wallets = demoData.wallets.map((wallet) =>
    withSnapshotTimestamps(toWalletRow(wallet, userId), timestamp),
  );
  backup.data.categories = demoData.categories.map((category) =>
    withSnapshotTimestamps(toCategoryInsertRow(category, userId), timestamp),
  );
  backup.data.transactions = demoData.transactions.map((transaction) =>
    withSnapshotTimestamps(
      toTransactionInsertRow(transaction, userId),
      timestamp,
    ),
  );
  backup.data.debts = demoData.debts.map((debt) =>
    withSnapshotTimestamps(toDebtRow(debt, userId), timestamp),
  );
  backup.data.goals = demoData.goals.map((goal) =>
    withSnapshotTimestamps(toGoalInsertRow(goal, userId), timestamp),
  );
  backup.data.budgets = demoData.budgets.map((budget) =>
    withSnapshotTimestamps(toBudgetRow(budget, userId), timestamp),
  );
  backup.data.investments = demoData.investments.map((investment) =>
    withSnapshotTimestamps(toInvestmentRow(investment, userId), timestamp),
  );

  return backup;
}

/**
 * Seeds demo data on first login ONLY.
 *
 * FINANCE-SEED-1: the browser no longer performs a fail-open "wallets empty?"
 * read followed by independent table upserts. One server-authoritative RPC:
 *   1. serializes competing seed requests for this user;
 *   2. freezes writes to every persisted finance domain for the short
 *      check-and-seed transaction;
 *   3. checks ALL persisted finance domains, including Net Worth history;
 *   4. delegates the replacement to restore_finance_backup, whose function
 *      call is already the all-or-nothing PostgreSQL transaction boundary.
 *
 * The local seed guard remains a UX/product opt-out after Clear All. Database
 * correctness never depends on it: if the RPC fails or any data already
 * exists, no partial seed can be committed.
 */
export async function initFinanceDemoData() {
  if (LOCAL_UI_MODE) return;

  const userId = await getAuthUserId();
  if (!userId) return;

  // Respect explicit "do not auto-seed" flag set by clearAllUserData.
  if (isSeedBlocked(userId)) return;

  const seedSnapshot = buildDemoFinanceBackup(userId);
  const { error } = await supabase.rpc("seed_finance_demo_data", {
    p_seed: seedSnapshot,
  });

  if (error) {
    console.error("[financeStorage] initFinanceDemoData:", error.message);
  }
}

export async function resetFinanceDemoData(): Promise<{
  error: string | null;
}> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // NETWORTH-HISTORY-1: reset remains a complete V3 atomic replacement across all persisted finance domains.
  // FINANCE-SEED-1 reuses the same snapshot serializer as first-login seed so
  // both paths cannot drift on demo rows or persisted field names.
  const backup = buildDemoFinanceBackup(userId);

  const result = await restoreFinanceBackup(backup);
  if (result.error) return result;

  // Only re-enable automatic demo seeding after the atomic replacement has
  // actually committed. A failed reset must never change this guard.
  unblockSeed(userId);
  return { error: null };
}

export async function clearAllUserData(): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // FINANCE-DATA-3: an empty V3 snapshot covers all persisted finance domains, including Net Worth history:
  // wallets, categories, transactions, debts, goals, budgets, investments,
  // savings, saving_transactions, forex_accounts, forex_cash_transactions, and
  // net_worth_snapshots.
  // restore_finance_backup performs the destructive work inside one PostgreSQL
  // transaction, so Clear All can no longer stop halfway through.
  const result = await restoreFinanceBackup(createEmptyFinanceBackupV3());
  if (result.error) return result;

  // Prevent auto-seed from re-populating demo data on next page load. Set this
  // only after the database clear has committed successfully.
  blockSeed(userId);
  return { error: null };
}

/** @deprecated Use clearAllUserData(). */
export const clearAllData = clearAllUserData;

/**
 * @deprecated FINANCE-DATA-2 no longer accepts unversioned collection bags.
 * Kept as a compatibility alias so any stale caller fails safe through the
 * same V2 preflight instead of clearing data first.
 */
export async function importAllData(
  backup: unknown,
): Promise<{ error: string | null }> {
  return restoreFinanceBackup(backup);
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

export type WalletDeleteErrorCode = "referenced" | "not_found";

type WalletDeleteResult = {
  error: string | null;
  code?: WalletDeleteErrorCode;
};

function mapWalletDeleteError(error: {
  code?: string;
  message: string;
}): WalletDeleteResult {
  switch (error.code) {
    case "MFW01":
      return { error: ERR_NO_AUTH };
    case "MFW02":
    // Existing/legacy FK backstop. The RPC normally converts this to MFW02,
    // but keeping 23503 here makes the client safe against deployment drift.
    case "23503":
      return {
        error:
          "Không thể xóa ví vì vẫn còn dữ liệu tài chính liên kết. Hãy xóa hoặc chuyển các liên kết trước.",
        code: "referenced",
      };
    case "MFW03":
      return { error: "Không tìm thấy ví cần xóa.", code: "not_found" };
    case "PGRST202":
      // Fail closed: never fall back to a direct table DELETE because that
      // would reopen the check-then-delete race WALLETS-INTEGRITY-2 removes.
      return {
        error:
          "Không thể xóa ví an toàn lúc này. Vui lòng thử lại sau.",
      };
    default:
      return { error: error.message };
  }
}

export async function deleteWallet(
  walletId: string,
): Promise<WalletDeleteResult> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  // WALLETS-INTEGRITY-2: the authoritative dependency check and DELETE now
  // live in one PostgreSQL transaction. There is intentionally no direct
  // table-delete fallback here: if the RPC is unavailable,
  // deletion must fail closed rather than re-introduce the old race window.
  const { error } = await supabase.rpc("delete_wallet_atomic", {
    p_wallet_id: walletId,
  });

  if (error) {
    console.error("[financeStorage] deleteWallet:", error.message);
    return mapWalletDeleteError(error);
  }

  return { error: null };
}

/**
 * Lightweight UX preflight for wallet deletion. Uses head-only exact counts
 * (no rows transferred) instead of downloading full financial history.
 *
 * This check is NOT the correctness boundary: references can appear after it
 * returns. `delete_wallet_atomic` re-checks the same domains after locking the
 * wallet row, while DB foreign keys provide an independent final backstop.
 */
export async function hasWalletReferences(
  walletId: string,
): Promise<{ hasReferences: boolean; error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { hasReferences: false, error: ERR_NO_AUTH };

  const [
    sourceResult,
    destinationResult,
    forexResult,
    savingsResult,
    savingTransactionsResult,
  ] = await Promise.all([
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
    supabase
      .from("savings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("wallet_id", walletId),
    supabase
      .from("saving_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("wallet_id", walletId),
  ]);

  const results = [
    sourceResult,
    destinationResult,
    forexResult,
    savingsResult,
    savingTransactionsResult,
  ];
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
  if (LOCAL_UI_MODE) {
    return getLocalUiDemoData().transactions.map((transaction) => ({
      walletId: transaction.walletId,
      transferToWalletId: transaction.transferToWalletId ?? null,
    }));
  }

  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("walletId, transferToWalletId")
    .eq("user_id", userId);

  if (error) {
    console.error("[financeStorage] getTransactionWalletLinks:", error.message);
    throw new Error(error.message);
  }

  return (data ?? []) as { walletId: string; transferToWalletId: string | null }[];
}

/** Same narrow-projection intent as getTransactionWalletLinks, for Forex cash. */
export async function getForexCashWalletLinks(): Promise<
  { walletId: string }[]
> {
  if (LOCAL_UI_MODE) return [];

  const userId = await getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("forex_cash_transactions")
    .select("wallet_id")
    .eq("user_id", userId);

  if (error) {
    console.error("[financeStorage] getForexCashWalletLinks:", error.message);
    throw new Error(error.message);
  }

  return ((data ?? []) as { wallet_id: string }[]).map((row) => ({
    walletId: row.wallet_id,
  }));
}

// ─── Finance Engine v3: Savings Atomic Money Movement ──────────────────────
//
// See supabase/finance-engine-3-savings-atomic.sql. Both RPCs return a
// single row combining the updated saving/wallet/ledger state, so callers
// never need to guess what the resulting balances are.

export type SavingMovementType = "deposit" | "withdraw" | "settlement";

export type SavingAccountRow = {
  id: string;
  user_id?: string | null;
  name: string;
  type: string;
  balance: number;
  wallet_id: string | null;
  interest_rate: number | null;
  maturity_date: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SavingTransactionRow = {
  id: string;
  saving_id: string;
  user_id?: string | null;
  type: string;
  amount: number;
  wallet_id?: string | null;
  transaction_date: string;
  note: string | null;
  created_at?: string;
};

export type SavingMovementResult = {
  saving: SavingAccountRow;
  wallet: Wallet;
  savingTransaction: SavingTransactionRow;
};

type SavingMovementRpcRow = {
  saving: SavingAccountRow;
  wallet: { id: string; name: string; type: Wallet["type"]; balance: number };
  saving_transaction: SavingTransactionRow;
};

/**
 * Maps the custom SQLSTATEs raised by create_saving_account/
 * create_saving_movement (see supabase/finance-engine-3-savings-atomic.sql)
 * to user-facing Vietnamese messages. Falls through to
 * mapFinanceEngineError for MFE* codes surfaced by the nested
 * create_finance_transaction call inside create_saving_movement.
 */
function mapSavingsEngineError(error: { code?: string; message: string }) {
  switch (error.code) {
    case "MFS01":
      return ERR_NO_AUTH;
    case "MFS02":
      return "Số dư tiết kiệm không đủ để thực hiện thao tác này.";
    case "MFS03":
      return "Không tìm thấy khoản tiết kiệm hoặc ví liên quan.";
    case "MFS04":
      return "Dữ liệu giao dịch tiết kiệm không hợp lệ.";
    case "MFS05":
      return "Số dư ví không đủ để tạo khoản tiết kiệm.";
    case "MFS06":
      return "Khoản tiết kiệm vẫn còn số dư. Vui lòng rút hết hoặc tất toán trước khi xóa.";
    default:
      return mapFinanceEngineError(error);
  }
}

function fromSavingMovementRpcRow(row: SavingMovementRpcRow): SavingMovementResult {
  return {
    saving: row.saving,
    wallet: {
      id: row.wallet.id,
      name: row.wallet.name,
      type: row.wallet.type,
      balance: Number(row.wallet.balance),
    },
    savingTransaction: row.saving_transaction,
  };
}

/**
 * Atomically creates a new saving account funded by an initial deposit —
 * wallet debit, saving row, and initial-deposit ledger row all commit or
 * roll back together. Does not create a row in the main "transactions"
 * table (matches existing product behavior — see the SQL migration header).
 */
export async function createSavingAccount(input: {
  id: string;
  name: string;
  type: string;
  balance: number;
  walletId: string;
  savingTransactionId: string;
  transactionDate: string;
  interestRate?: number | null;
  maturityDate?: string | null;
  notes?: string | null;
}): Promise<{ data: SavingMovementResult | null; error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: ERR_NO_AUTH };

  const { data, error } = await supabase.rpc("create_saving_account", {
    p_saving_id: input.id,
    p_name: input.name,
    p_type: input.type,
    p_balance: input.balance,
    p_wallet_id: input.walletId,
    p_saving_transaction_id: input.savingTransactionId,
    p_transaction_date: input.transactionDate,
    p_interest_rate: input.interestRate ?? null,
    p_maturity_date: input.maturityDate ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) {
    console.error("[financeStorage] createSavingAccount:", error.message);
    return { data: null, error: mapSavingsEngineError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | SavingMovementRpcRow
    | undefined;
  if (!row) {
    return { data: null, error: "Không nhận được phản hồi từ máy chủ." };
  }

  return { data: fromSavingMovementRpcRow(row), error: null };
}

/**
 * Atomically records a deposit, withdrawal, or settlement on an EXISTING
 * saving — wallet mutation, main "transactions" ledger row (via the nested
 * create_finance_transaction call), savings.balance mutation, and the
 * saving_transactions ledger row all commit or roll back together.
 *
 * For `type: "settlement"`, the amount actually moved is always the
 * account's authoritative server-side balance, not `input.amount` — see the
 * SQL migration header for why.
 */
export async function createSavingMovement(input: {
  savingId: string;
  walletId: string;
  type: SavingMovementType;
  amount: number;
  note: string;
  transactionDate: string;
  savingTransactionId: string;
  financeTransactionId: string;
}): Promise<{ data: SavingMovementResult | null; error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { data: null, error: ERR_NO_AUTH };

  const { data, error } = await supabase.rpc("create_saving_movement", {
    p_saving_id: input.savingId,
    p_wallet_id: input.walletId,
    p_type: input.type,
    p_amount: input.amount,
    p_note: input.note,
    p_transaction_date: input.transactionDate,
    p_saving_transaction_id: input.savingTransactionId,
    p_finance_transaction_id: input.financeTransactionId,
  });

  if (error) {
    console.error("[financeStorage] createSavingMovement:", error.message);
    return { data: null, error: mapSavingsEngineError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | SavingMovementRpcRow
    | undefined;
  if (!row) {
    return { data: null, error: "Không nhận được phản hồi từ máy chủ." };
  }

  return { data: fromSavingMovementRpcRow(row), error: null };
}

/**
 * Atomically deletes a saving account and its saving_transactions ledger —
 * but only when the RPC's own server-side, locked read of its balance is
 * exactly zero (MFS06 otherwise). This is the authoritative check; any
 * client-side `balance > 0` guard is UX convenience only and must not be
 * relied on for correctness.
 */
export async function deleteSavingAccount(
  savingId: string,
): Promise<{ error: string | null }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: ERR_NO_AUTH };

  const { error } = await supabase.rpc("delete_saving_account", {
    p_saving_id: savingId,
  });

  if (error) {
    console.error("[financeStorage] deleteSavingAccount:", error.message);
    return { error: mapSavingsEngineError(error) };
  }

  return { error: null };
}

function mapCategoryIntegrityError(error: {
  code?: string;
  message: string;
}) {
  if (error.code === "MFC02" || error.code === "23503") {
    return "Không thể xóa danh mục vì vẫn còn giao dịch hoặc ngân sách liên kết. Hãy xóa hoặc chuyển các liên kết trước.";
  }
  if (error.code === "MFC03") {
    return "Không tìm thấy danh mục cần xóa.";
  }
  if (error.code === "MFC01") return ERR_NO_AUTH;
  return error.message;
}

function mapBudgetCategoryIntegrityError(error: {
  code?: string;
  message: string;
}) {
  if (error.code === "23503") {
    return "Danh mục của ngân sách không tồn tại hoặc không thuộc tài khoản hiện tại.";
  }
  return error.message;
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

  // DATA-INTEGRITY-2: transaction/budget dependency checks and deletion are
  // one server-side lock/check/delete boundary. The Categories UI still does
  // a preflight for fast feedback, but correctness never depends on that
  // inherently-racy client snapshot.
  const { error } = await supabase.rpc("delete_category_atomic", {
    p_category_id: categoryId,
  });
  if (error) {
    console.error("[financeStorage] deleteCategory:", error.message);
    return { error: mapCategoryIntegrityError(error) };
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
    return { error: mapBudgetCategoryIntegrityError(error) };
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
    return { error: mapBudgetCategoryIntegrityError(error) };
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

  // DATA-INTEGRITY-2: deleting an account must reverse every linked cash
  // movement and delete the account in one PostgreSQL transaction. Never
  // expose a direct-table fallback here.
  const { error } = await supabase.rpc("delete_forex_account_atomic", {
    p_account_id: accountId,
  });

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
