import type { AIFinanceToolContext } from "../tools/aiToolTypes";
import { detectAIFinanceContextIntent } from "./aiContextIntent.server";
import { resolveAIFinanceEntities } from "./aiEntityResolver.server";
import { resolveAIFinanceSemanticSearch } from "./aiSemanticFinanceSearch.server";
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

function summarizeBudgets(rows: Record<string, unknown>[]) {
  return rows.map((item) => ({
    id: item.id,
    categoryId: item.categoryId ?? item.category_id,
    month: item.month,
    limitAmount: item.limitAmount ?? item.limit_amount,
  }));
}

function summarizeGoals(rows: Record<string, unknown>[]) {
  return rows.map((item) => {
    const targetAmount = numberOf(item.targetAmount ?? item.target_amount);
    const currentAmount = numberOf(item.currentAmount ?? item.current_amount);

    return {
      id: item.id,
      name: item.name,
      targetAmount,
      currentAmount,
      remaining: Math.max(0, targetAmount - currentAmount),
      progressPercent:
        targetAmount > 0 ? Math.round((currentAmount / targetAmount) * 100) : 0,
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
  const intent = detectAIFinanceContextIntent(input.question);
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
    intent.domains.includes("overview")
      ? queryRows({
          context: input.context,
          table: "investments",
        })
      : Promise.resolve([]);

  const [
    categories,
    transactions,
    wallets,
    budgets,
    goals,
    debts,
    investments,
  ] = await Promise.all([
    categoryPromise,
    transactionPromise,
    walletPromise,
    budgetPromise,
    goalPromise,
    debtPromise,
    investmentPromise,
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
    snapshot.goals = summarizeGoals(goals);
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
