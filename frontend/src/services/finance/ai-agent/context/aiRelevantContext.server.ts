import type {
  Debt,
  ForexAccount,
  ForexCashTransaction,
  Goal,
  Investment,
  SavingAccount,
  Transaction,
  Wallet,
} from "@/src/types/finance";
import {
  calculateBalanceSheetSnapshot,
  calculateGoalFundingSnapshot,
} from "@/src/services/finance/financeCalculations";
import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { detectAIFinanceContextIntent } from "./aiContextIntent.server";
import { resolveAIFinanceCapabilities } from "./aiCapabilityResolver.server";
import { resolveAIFinanceDataRequirements } from "./aiDataRequirementResolver.server";
import { resolveAIFinanceEntities } from "./aiEntityResolver.server";
import { resolveAIFinanceSemanticSearch } from "./aiSemanticFinanceSearch.server";
import { resolveAIWriteIntent } from "./aiWriteIntentResolver.server";
import type {
  AIFinanceContextDomain,
  AIFinanceRelevantContext,
} from "./aiContextTypes";

const MAX_ROWS_PER_DOMAIN = 50;
const MAX_RECENT_TRANSACTIONS = 12;
const MAX_CONTEXT_CHARACTERS = 24_000;

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

type QueryBuilder = PromiseLike<QueryResponse> & {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
};

type QueryClient = {
  from: (table: string) => QueryBuilder;
};

function clientOf(context: AIFinanceToolContext) {
  return context.supabase as unknown as QueryClient;
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function numberOf(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function queryRows(input: {
  context: AIFinanceToolContext;
  table: string;
  configure?: (query: QueryBuilder) => QueryBuilder;
  limit?: number;
}) {
  const client = clientOf(input.context);

  let query = client
    .from(input.table)
    .select("*")
    .eq("user_id", input.context.userId);

  if (input.configure) {
    query = input.configure(query);
  }

  query = query.limit(input.limit ?? MAX_ROWS_PER_DOMAIN);

  const { data, error } = await query;

  if (error) {
    throw new Error(`${input.table}: ${error.message}`);
  }

  return rowsOf(data);
}

function summarizeTransactions(transactions: Record<string, unknown>[]) {
  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();

  for (const transaction of transactions) {
    const amount = numberOf(transaction.amount);
    const type = stringOf(transaction.type);
    const categoryId = stringOf(
      transaction.categoryId ?? transaction.category_id,
    );

    if (type === "income") {
      income += amount;
    } else if (type === "expense") {
      expense += amount;
      byCategory.set(categoryId, (byCategory.get(categoryId) ?? 0) + amount);
    }
  }

  return {
    income,
    expense,
    cashFlow: income - expense,
    topCategoryIds: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([categoryId, amount]) => ({ categoryId, amount })),
    recent: transactions.slice(0, MAX_RECENT_TRANSACTIONS).map((item) => ({
      id: item.id,
      type: item.type,
      amount: item.amount,
      categoryId: item.categoryId ?? item.category_id,
      walletId: item.walletId ?? item.wallet_id,
      date: item.date,
      note: typeof item.note === "string" ? item.note.slice(0, 120) : undefined,
    })),
  };
}

function summarizeWallets(rows: Record<string, unknown>[]) {
  return {
    totalBalance: rows.reduce((sum, item) => sum + numberOf(item.balance), 0),
    wallets: rows.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      balance: item.balance,
    })),
  };
}

function summarizeBalanceSheet(input: {
  wallets: Record<string, unknown>[];
  savings: Record<string, unknown>[];
  investments: Record<string, unknown>[];
  debts: Record<string, unknown>[];
  forexAccounts: Record<string, unknown>[];
  forexCashTransactions: Record<string, unknown>[];
}) {
  const wallets: Wallet[] = input.wallets.map((item) => ({
    id: stringOf(item.id),
    name: stringOf(item.name),
    type: stringOf(item.type) as Wallet["type"],
    balance: numberOf(item.balance),
  }));
  const savings: SavingAccount[] = input.savings.map(toGoalFundingSaving);
  const investments: Investment[] = input.investments.map((item) => ({
    id: stringOf(item.id),
    name: stringOf(item.name),
    type: stringOf(item.type) as Investment["type"],
    investedAmount: numberOf(item.investedAmount ?? item.invested_amount),
    currentValue: numberOf(item.currentValue ?? item.current_value),
  }));
  const debts: Debt[] = input.debts.map((item) => ({
    id: stringOf(item.id),
    name: stringOf(item.name),
    totalAmount: numberOf(item.totalAmount ?? item.total_amount),
    remainingAmount: numberOf(item.remainingAmount ?? item.remaining_amount),
  }));
  const forexAccounts: ForexAccount[] = input.forexAccounts.map((item) => ({
    id: stringOf(item.id),
    name: stringOf(item.name),
    broker: stringOf(item.broker),
    currency: stringOf(item.currency),
    status: (stringOf(item.status) || "active") as ForexAccount["status"],
    currentEquity:
      item.current_equity === null || item.current_equity === undefined
        ? undefined
        : numberOf(item.current_equity),
  }));
  const forexCashTransactions: ForexCashTransaction[] =
    input.forexCashTransactions.map((item) => ({
      id: stringOf(item.id),
      forexAccountId: stringOf(item.forex_account_id),
      walletId: stringOf(item.wallet_id),
      type: stringOf(item.type) as ForexCashTransaction["type"],
      amount: numberOf(item.amount),
      currency: "VND",
      fee: numberOf(item.fee),
      transactionDate: stringOf(item.transaction_date),
      transactionTime: stringOf(item.transaction_time),
    }));

  return calculateBalanceSheetSnapshot({
    wallets,
    savings,
    investments,
    debts,
    forexAccounts,
    forexCashTransactions,
  });
}

function summarizeBudgets(rows: Record<string, unknown>[]) {
  return rows.map((item) => ({
    id: item.id,
    categoryId: item.categoryId ?? item.category_id,
    month: item.month,
    limitAmount: item.limitAmount ?? item.limit_amount,
  }));
}

function toGoalFundingTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: stringOf(row.id),
    type: stringOf(row.type) as Transaction["type"],
    amount: numberOf(row.amount),
    categoryId: stringOf(row.categoryId ?? row.category_id),
    walletId: stringOf(row.walletId ?? row.wallet_id),
    note: stringOf(row.note),
    date: stringOf(row.date),
  };
}

function toGoalFundingSaving(row: Record<string, unknown>): SavingAccount {
  const interestRate = row.interestRate ?? row.interest_rate;

  return {
    id: stringOf(row.id),
    name: stringOf(row.name),
    type: stringOf(row.type) as SavingAccount["type"],
    balance: numberOf(row.balance),
    interestRate:
      interestRate === null || interestRate === undefined
        ? undefined
        : numberOf(interestRate),
    maturityDate: stringOf(row.maturityDate ?? row.maturity_date) || undefined,
    notes: stringOf(row.notes) || undefined,
  };
}

function toGoalFundingGoal(row: Record<string, unknown>): Goal {
  const rawLinks = row.savingCategoryIds ?? row.saving_category_ids;
  return {
    id: stringOf(row.id),
    name: stringOf(row.name),
    targetAmount: numberOf(row.targetAmount ?? row.target_amount),
    currentAmount: numberOf(row.currentAmount ?? row.current_amount),
    savingCategoryIds: Array.isArray(rawLinks)
      ? rawLinks.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function summarizeGoals(
  rows: Record<string, unknown>[],
  fundingTransactions: Record<string, unknown>[],
  fundingSavings: Record<string, unknown>[],
) {
  const transactions = fundingTransactions.map(toGoalFundingTransaction);
  const savings = fundingSavings.map(toGoalFundingSaving);

  return rows.map((item) => {
    const goal = toGoalFundingGoal(item);
    const funding = calculateGoalFundingSnapshot({ goal, transactions, savings });

    return {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: funding.effectiveCurrentAmount,
      remaining: funding.remainingAmount,
      progressPercent: funding.progressPercent,
    };
  });
}

function summarizeDebts(rows: Record<string, unknown>[]) {
  return {
    totalRemaining: rows.reduce(
      (sum, item) =>
        sum + numberOf(item.remainingAmount ?? item.remaining_amount),
      0,
    ),
    debts: rows.map((item) => ({
      id: item.id,
      name: item.name,
      remainingAmount: item.remainingAmount ?? item.remaining_amount,
    })),
  };
}

function summarizeInvestments(rows: Record<string, unknown>[]) {
  return {
    totalCurrentValue: rows.reduce(
      (sum, item) => sum + numberOf(item.currentValue ?? item.current_value),
      0,
    ),
    investments: rows.map((item) => ({
      id: item.id,
      name: item.name,
      currentValue: item.currentValue ?? item.current_value,
    })),
  };
}

function pruneSnapshot(snapshot: Record<string, unknown>) {
  const serialized = JSON.stringify(snapshot);

  if (serialized.length <= MAX_CONTEXT_CHARACTERS) {
    return {
      snapshot,
      truncated: false,
      estimatedCharacters: serialized.length,
    };
  }

  const pruned = { ...snapshot };

  if (
    pruned.transactions &&
    typeof pruned.transactions === "object" &&
    !Array.isArray(pruned.transactions)
  ) {
    const transactions = pruned.transactions as Record<string, unknown>;
    pruned.transactions = {
      ...transactions,
      recent: Array.isArray(transactions.recent)
        ? transactions.recent.slice(0, 5)
        : [],
    };
  }

  const finalSerialized = JSON.stringify(pruned);

  return {
    snapshot: pruned,
    truncated: true,
    estimatedCharacters: finalSerialized.length,
  };
}

export async function buildAIFinanceRelevantContext(input: {
  context: AIFinanceToolContext;
  question: string;
  timezone?: string;
  currency?: string;
}): Promise<AIFinanceRelevantContext> {
  const detectedIntent = detectAIFinanceContextIntent(input.question);
  const writeIntent = resolveAIWriteIntent(input.question);
  const capabilityResolution = resolveAIFinanceCapabilities(input.question, {
    writeIntent,
  });
  const dataRequirement = resolveAIFinanceDataRequirements({
    question: input.question,
    capabilityResolution,
  });
  const intent = {
    ...detectedIntent,
    domains: [
      ...new Set([...detectedIntent.domains, ...capabilityResolution.domains]),
    ],
    needsRecentTransactions:
      detectedIntent.needsRecentTransactions ||
      capabilityResolution.domains.includes("transactions") ||
      capabilityResolution.domains.includes("cashflow"),
  };
  const snapshot: Record<string, unknown> = {};
  const loadedDomains = new Set<AIFinanceContextDomain>();

  const categoryPromise =
    intent.domains.includes("budgets") ||
    intent.domains.includes("transactions") ||
    intent.action !== "read"
      ? queryRows({
          context: input.context,
          table: "categories",
        })
      : Promise.resolve([]);

  const transactionPromise = intent.needsRecentTransactions
    ? queryRows({
        context: input.context,
        table: "transactions",
        configure: (query) =>
          query
            .gte("date", intent.dateRange.from)
            .lte("date", intent.dateRange.to)
            .order("date", { ascending: false }),
        limit: MAX_ROWS_PER_DOMAIN,
      })
    : Promise.resolve([]);

  const walletPromise =
    intent.domains.includes("wallets") ||
    intent.domains.includes("overview") ||
    intent.domains.includes("cashflow") ||
    intent.domains.includes("health")
      ? queryRows({
          context: input.context,
          table: "wallets",
        })
      : Promise.resolve([]);

  const budgetPromise = intent.domains.includes("budgets")
    ? queryRows({
        context: input.context,
        table: "budgets",
        configure: (query) =>
          query.eq("month", intent.dateRange.from.slice(0, 7)),
      })
    : Promise.resolve([]);

  const goalPromise = intent.domains.includes("goals")
    ? queryRows({
        context: input.context,
        table: "goals",
      })
    : Promise.resolve([]);

  // Goal progress depends on the same canonical funding inputs as the product
  // UI. These are dependency reads, not extra context domains: Saving links
  // provide the current balance and legacy category links need transaction
  // history to preserve old Goal rows during migration.
  const goalFundingSavingsPromise = intent.domains.includes("goals")
    ? queryRows({
        context: input.context,
        table: "savings",
      })
    : Promise.resolve([]);

  const goalFundingTransactionsPromise = intent.domains.includes("goals")
    ? queryRows({
        context: input.context,
        table: "transactions",
        configure: (query) => query.order("date", { ascending: false }),
        limit: MAX_ROWS_PER_DOMAIN,
      })
    : Promise.resolve([]);

  const debtPromise =
    intent.domains.includes("debts") ||
    intent.domains.includes("overview") ||
    intent.domains.includes("health")
      ? queryRows({
          context: input.context,
          table: "debts",
        })
      : Promise.resolve([]);

  const investmentPromise =
    intent.domains.includes("investments") ||
    intent.domains.includes("overview") ||
    intent.domains.includes("health")
      ? queryRows({
          context: input.context,
          table: "investments",
        })
      : Promise.resolve([]);

  const balanceSheetSavingsPromise =
    intent.domains.includes("overview") || intent.domains.includes("health")
      ? queryRows({ context: input.context, table: "savings" })
      : Promise.resolve([]);

  const balanceSheetForexAccountsPromise =
    intent.domains.includes("overview") || intent.domains.includes("health")
      ? queryRows({ context: input.context, table: "forex_accounts" })
      : Promise.resolve([]);

  const balanceSheetForexTransactionsPromise =
    intent.domains.includes("overview") || intent.domains.includes("health")
      ? queryRows({ context: input.context, table: "forex_cash_transactions" })
      : Promise.resolve([]);

  const [
    categories,
    transactions,
    wallets,
    budgets,
    goals,
    goalFundingSavings,
    goalFundingTransactions,
    debts,
    investments,
    balanceSheetSavings,
    balanceSheetForexAccounts,
    balanceSheetForexTransactions,
  ] = await Promise.all([
    categoryPromise,
    transactionPromise,
    walletPromise,
    budgetPromise,
    goalPromise,
    goalFundingSavingsPromise,
    goalFundingTransactionsPromise,
    debtPromise,
    investmentPromise,
    balanceSheetSavingsPromise,
    balanceSheetForexAccountsPromise,
    balanceSheetForexTransactionsPromise,
  ]);

  if (categories.length > 0) {
    snapshot.categories = categories.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
    }));
  }

  if (transactions.length > 0 || intent.needsRecentTransactions) {
    snapshot.transactions = summarizeTransactions(transactions);
    loadedDomains.add("transactions");
  }

  if (wallets.length > 0) {
    snapshot.wallets = summarizeWallets(wallets);
    loadedDomains.add("wallets");
  }

  if (budgets.length > 0 || intent.domains.includes("budgets")) {
    snapshot.budgets = summarizeBudgets(budgets);
    loadedDomains.add("budgets");
  }

  if (goals.length > 0 || intent.domains.includes("goals")) {
    snapshot.goals = summarizeGoals(
      goals,
      goalFundingTransactions,
      goalFundingSavings,
    );
    loadedDomains.add("goals");
  }

  if (debts.length > 0) {
    snapshot.debts = summarizeDebts(debts);
    loadedDomains.add("debts");
  }

  if (investments.length > 0) {
    snapshot.investments = summarizeInvestments(investments);
    loadedDomains.add("investments");
  }

  if (
    intent.domains.includes("overview") || intent.domains.includes("health")
  ) {
    snapshot.balanceSheet = summarizeBalanceSheet({
      wallets,
      savings: balanceSheetSavings,
      investments,
      debts,
      forexAccounts: balanceSheetForexAccounts,
      forexCashTransactions: balanceSheetForexTransactions,
    });
  }

  if (
    intent.domains.includes("overview") ||
    intent.domains.includes("cashflow") ||
    intent.domains.includes("health")
  ) {
    loadedDomains.add("overview");
  }

  const entityResolution = resolveAIFinanceEntities({
    question: input.question,
    categories,
    wallets,
    goals,
    recentTransactions: transactions,
  });

  if (entityResolution.candidates.length > 0) {
    snapshot.entityResolution = entityResolution;
  }

  const semanticResolution = resolveAIFinanceSemanticSearch({
    question: input.question,
    categories,
  });

  if (semanticResolution.candidates.length > 0) {
    snapshot.semanticResolution = semanticResolution;
  }

  const pruned = pruneSnapshot(snapshot);

  return {
    generatedAt: new Date().toISOString(),
    timezone: input.timezone ?? "Asia/Ho_Chi_Minh",
    currency: input.currency ?? "VND",
    intent,
    capabilityResolution,
    dataRequirement,
    writeIntent,
    snapshot: pruned.snapshot,
    limits: {
      maxRowsPerDomain: MAX_ROWS_PER_DOMAIN,
      maxRecentTransactions: MAX_RECENT_TRANSACTIONS,
    },
    diagnostics: {
      loadedDomains: [...loadedDomains],
      truncated: pruned.truncated,
      estimatedCharacters: pruned.estimatedCharacters,
    },
  };
}
