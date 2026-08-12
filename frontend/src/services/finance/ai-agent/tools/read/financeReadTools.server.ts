import type { Database } from "@/src/lib/database.types";
import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  Debt,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";
import {
  calculateBudgetSpendingCollection,
  calculateNetWorth,
  getDebtScore,
  getEmergencyMonths,
  getSavingRate,
  getSavingScore,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import type {
  AIFinanceToolContext,
  AIFinanceToolRegistration,
  AIFinanceToolResult,
} from "../aiToolTypes";
import {
  parseEmptyArgs,
  parseOptionalLimitArgs,
  parseOptionalMonthArgs,
  parseSearchTransactionsArgs,
  type SearchTransactionsArgs,
  type SearchTransactionsDatePreset,
} from "../aiToolValidation";

type FinanceTableName = keyof Database["public"]["Tables"];

type FinanceQueryError = {
  message: string;
} | null;

type FinanceQueryResponse = {
  data: unknown;
  error: FinanceQueryError;
};

type FinanceQueryBuilder = PromiseLike<FinanceQueryResponse> & {
  eq: (column: string, value: unknown) => FinanceQueryBuilder;
  gte: (column: string, value: unknown) => FinanceQueryBuilder;
  lte: (column: string, value: unknown) => FinanceQueryBuilder;
  order: (
    column: string,
    options?: {
      ascending?: boolean;
    },
  ) => FinanceQueryBuilder;
  limit: (count: number) => FinanceQueryBuilder;
};

type FinanceSupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => FinanceQueryBuilder;
    };
  };
};

type TransactionRow = {
  id: string;
  type: string;
  amount: number;
  categoryId?: string;
  category_id?: string;
  walletId?: string;
  wallet_id?: string;
  note: string | null;
  date: string;
};

type WalletRow = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency?: string;
};

type BudgetRow = {
  id: string;
  categoryId: string;
  month: string;
  limitAmount: number;
};

type GoalRow = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
};

type DebtRow = {
  id: string;
  name: string;
  remainingAmount: number;
};

type InvestmentRow = {
  id: string;
  name: string;
  currentValue: number;
};

type CategoryRow = {
  id: string;
  name: string;
  type: string;
  // Canonical Budget Spending needs a category's planning group (see
  // financeCalculations.getCategoryPlanningGroup). Persisted as
  // `planning_group` on the categories table (financeStorage.ts's
  // fromCategoryRow is the authoritative mapper) and already returned by
  // this file's `select("*")` queries — just not read until now.
  planning_group?: CategoryPlanningGroup | null;
  planningGroup?: CategoryPlanningGroup | null;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toolError(error: unknown): AIFinanceToolResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Unknown tool error.",
  };
}

function createFinanceQuery(
  context: AIFinanceToolContext,
  table: FinanceTableName,
): FinanceQueryBuilder {
  const client = context.supabase as unknown as FinanceSupabaseClient;

  return client.from(String(table)).select("*").eq("user_id", context.userId);
}

async function getRows<T>(
  context: AIFinanceToolContext,
  table: FinanceTableName,
  configure?: (query: FinanceQueryBuilder) => FinanceQueryBuilder,
): Promise<T[]> {
  const baseQuery = createFinanceQuery(context, table);
  const query = configure ? configure(baseQuery) : baseQuery;
  const { data, error } = await query;

  if (error) {
    throw new Error(`${String(table)}: ${error.message}`);
  }

  return (data ?? []) as T[];
}

function transactionCategoryId(transaction: TransactionRow) {
  return transaction.categoryId ?? transaction.category_id ?? "";
}

function transactionWalletId(transaction: TransactionRow) {
  return transaction.walletId ?? transaction.wallet_id ?? "";
}

// ─── Row → domain adapters (canonical Budget Spending only) ────────────────
// Minimal, only populate what calculateBudgetSpending actually reads
// (categoryId/date/type/amount, categoryId/name/type/planningGroup,
// categoryId/month/limitAmount). No fabricated semantic values.

export function toDomainTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as Transaction["type"],
    amount: Number(row.amount || 0),
    categoryId: transactionCategoryId(row),
    walletId: transactionWalletId(row),
    note: row.note ?? "",
    date: row.date,
  };
}

export function toDomainCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Category["type"],
    planningGroup: row.planningGroup ?? row.planning_group ?? undefined,
  };
}

export function toDomainWallet(row: WalletRow): Wallet {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Wallet["type"],
    balance: Number(row.balance || 0),
  };
}

// totalAmount is not selected by this tool's row queries and is not read by
// any canonical calculation that consumes Debt (only `remainingAmount` is);
// it is set to `remainingAmount` here purely to satisfy the domain type.
export function toDomainDebt(row: DebtRow): Debt {
  return {
    id: row.id,
    name: row.name,
    totalAmount: Number(row.remainingAmount || 0),
    remainingAmount: Number(row.remainingAmount || 0),
  };
}

// investedAmount/type are not selected by this tool's row queries and are
// not read by any canonical calculation that consumes Investment for net
// worth (only `currentValue` is); defaulted here to satisfy the domain type.
export function toDomainInvestment(row: InvestmentRow): Investment {
  return {
    id: row.id,
    name: row.name,
    type: "other",
    investedAmount: 0,
    currentValue: Number(row.currentValue || 0),
  };
}

export function toDomainBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    month: row.month,
    limitAmount: Number(row.limitAmount || 0),
  };
}

// Preserves get_budget_status's existing external response contract
// ("over" | "near" | "on_track"), which never distinguished "no-budget"/
// "no-spend" (a zero-limit budget is a rare edge case; both map to
// "on_track", the closest match to the tool's pre-existing behavior).
export function toToolStatusLabel(
  status: ReturnType<typeof calculateBudgetSpendingCollection>[number]["status"],
): "over" | "near" | "on_track" {
  if (status === "over") return "over";
  if (status === "near") return "near";
  return "on_track";
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi-VN")
    .trim();
}

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const FINANCE_TIMEZONE = "Asia/Ho_Chi_Minh";

function calendarDateInFinanceTimezone(date = new Date()): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FINANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function calendarToUtc(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function utcToCalendar(date: Date): CalendarDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatCalendar(date: CalendarDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(
    2,
    "0",
  )}-${String(date.day).padStart(2, "0")}`;
}

function addDays(date: CalendarDate, days: number) {
  const target = calendarToUtc(date);
  target.setUTCDate(target.getUTCDate() + days);
  return utcToCalendar(target);
}

function shiftMonths(date: CalendarDate, months: number) {
  return utcToCalendar(
    new Date(Date.UTC(date.year, date.month - 1 + months, 1)),
  );
}

function monthStart(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: 1 };
}

function monthEnd(date: CalendarDate): CalendarDate {
  return utcToCalendar(new Date(Date.UTC(date.year, date.month, 0)));
}

function weekStart(date: CalendarDate) {
  const weekday = calendarToUtc(date).getUTCDay() || 7;
  return addDays(date, 1 - weekday);
}

function quarterStart(date: CalendarDate): CalendarDate {
  return {
    year: date.year,
    month: Math.floor((date.month - 1) / 3) * 3 + 1,
    day: 1,
  };
}

function resolveSearchDatePreset(preset: SearchTransactionsDatePreset) {
  const today = calendarDateInFinanceTimezone();
  let from: CalendarDate;
  let to: CalendarDate;

  switch (preset) {
    case "today":
      from = today;
      to = today;
      break;
    case "yesterday":
      from = addDays(today, -1);
      to = from;
      break;
    case "this_week":
      from = weekStart(today);
      to = addDays(from, 6);
      break;
    case "last_week": {
      const currentStart = weekStart(today);
      from = addDays(currentStart, -7);
      to = addDays(currentStart, -1);
      break;
    }
    case "this_month":
      from = monthStart(today);
      to = monthEnd(today);
      break;
    case "last_month": {
      const previous = shiftMonths(today, -1);
      from = monthStart(previous);
      to = monthEnd(previous);
      break;
    }
    case "this_quarter":
      from = quarterStart(today);
      to = addDays(shiftMonths(from, 3), -1);
      break;
    case "last_quarter": {
      const previous = shiftMonths(today, -3);
      from = quarterStart(previous);
      to = addDays(shiftMonths(from, 3), -1);
      break;
    }
    case "this_year":
      from = { year: today.year, month: 1, day: 1 };
      to = { year: today.year, month: 12, day: 31 };
      break;
    case "last_year":
      from = { year: today.year - 1, month: 1, day: 1 };
      to = { year: today.year - 1, month: 12, day: 31 };
      break;
  }

  return {
    from: formatCalendar(from),
    to: formatCalendar(to),
  };
}

function toInclusiveEndDate(value: string) {
  return value.includes("T") ? value : `${value}T23:59:59.999`;
}

function buildTransactionSearchSummary(input: {
  transactions: TransactionRow[];
  categoryMap: Map<string, string>;
  walletMap: Map<string, string>;
}) {
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryTotals = new Map<
    string,
    {
      categoryId: string;
      categoryName: string;
      income: number;
      expense: number;
      count: number;
    }
  >();

  const transactions = input.transactions.map((item) => {
    const categoryId = transactionCategoryId(item);
    const walletId = transactionWalletId(item);
    const amount = Number(item.amount || 0);

    if (item.type === "income") {
      totalIncome += amount;
    } else if (item.type === "expense") {
      totalExpense += amount;
    }

    const current = categoryTotals.get(categoryId) ?? {
      categoryId,
      categoryName: input.categoryMap.get(categoryId) ?? "Unknown",
      income: 0,
      expense: 0,
      count: 0,
    };

    if (item.type === "income") {
      current.income += amount;
    } else if (item.type === "expense") {
      current.expense += amount;
    }

    current.count += 1;
    categoryTotals.set(categoryId, current);

    return {
      id: item.id,
      type: item.type,
      amount,
      categoryId,
      category: input.categoryMap.get(categoryId) ?? "Unknown",
      walletId,
      wallet: input.walletMap.get(walletId) ?? "Unknown",
      note: item.note ?? "",
      date: item.date,
    };
  });

  return {
    transactions,
    count: transactions.length,
    totalIncome,
    totalExpense,
    netAmount: totalIncome - totalExpense,
    byCategory: [...categoryTotals.values()].sort(
      (a, b) => b.income + b.expense - (a.income + a.expense),
    ),
  };
}

export const getFinancialSummaryTool: AIFinanceToolRegistration<
  Record<string, never>
> = {
  name: "get_financial_summary",
  mode: "read",
  description:
    "Get the authenticated user's current assets, debts, net worth, income, expenses, and cash flow.",
  semantic: {
    capabilities: [
      "financial_overview",
      "cashflow_analysis",
      "income_analysis",
      "debt_summary",
      "investment_summary",
    ],
    returns: [
      "walletAssets",
      "investmentAssets",
      "totalAssets",
      "totalDebt",
      "netWorth",
      "income",
      "expense",
      "cashFlow",
      "savingRate",
    ],
    useWhen: [
      "The user asks for an overall financial summary, net worth, total assets, total debt, income, expenses, or cash flow.",
    ],
    doNotUseWhen: [
      "The user asks for individual wallet balances, wallet ranking, or low-balance wallets; use get_wallets instead.",
    ],
    examples: [
      "Tổng quan tài chính của tôi",
      "Tổng tài sản ròng là bao nhiêu?",
      "Dòng tiền tháng này thế nào?",
    ],
    priority: 60,
  },
  definition: {
    type: "function",
    name: "get_financial_summary",
    description:
      "Get the user's current financial summary. Use this for overview, net worth, assets, debt, income, expense, and cash-flow questions.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  validate: parseEmptyArgs,
  async execute(context) {
    try {
      const [wallets, transactions, debts, investments, categoryRows] =
        await Promise.all([
          getRows<WalletRow>(context, "wallets"),
          getRows<TransactionRow>(context, "transactions"),
          getRows<DebtRow>(context, "debts"),
          getRows<InvestmentRow>(context, "investments"),
          getRows<CategoryRow>(context, "categories"),
        ]);

      // Canonical net worth — see financeCalculations.ts. Savings and Forex
      // are not part of this tool's row set yet, so they default to 0
      // rather than being reconstructed here.
      const netWorthBreakdown = calculateNetWorth({
        wallets: wallets.map(toDomainWallet),
        investments: investments.map(toDomainInvestment),
        debts: debts.map(toDomainDebt),
      });
      const walletAssets = netWorthBreakdown.cashAndWallets;
      const investmentAssets = netWorthBreakdown.investments;
      const totalDebt = netWorthBreakdown.totalDebt;
      const totalAssets = netWorthBreakdown.totalAssets;
      const netWorth = netWorthBreakdown.netWorth;

      const month = currentMonth();
      const categories = categoryRows.map(toDomainCategory);
      const monthlyTransactions = transactions
        .filter((item) => item.date.startsWith(month))
        .map(toDomainTransaction);
      // Canonical income/expense — `getTotalExpense` excludes
      // saving/investment-planning-group transactions (real expense
      // semantics), matching Dashboard/Reports.
      const income = getTotalIncome(monthlyTransactions);
      const expense = getTotalExpense(monthlyTransactions, categories);

      return {
        ok: true,
        data: {
          month,
          walletAssets,
          investmentAssets,
          totalAssets,
          totalDebt,
          netWorth,
          income,
          expense,
          cashFlow: income - expense,
          savingRate: getSavingRate(income, expense),
          counts: {
            wallets: wallets.length,
            transactions: transactions.length,
            debts: debts.length,
            investments: investments.length,
          },
        },
      };
    } catch (error) {
      return toolError(error);
    }
  },
};

export const getWalletsTool: AIFinanceToolRegistration<Record<string, never>> =
  {
    name: "get_wallets",
    mode: "read",
    description:
      "Get every active wallet with its name, type, current balance, currency when available, and a server-side balance ranking.",
    semantic: {
      capabilities: [
        "wallet_list",
        "wallet_balance_lookup",
        "wallet_ranking",
        "wallet_low_balance",
      ],
      returns: [
        "wallets[].id",
        "wallets[].name",
        "wallets[].type",
        "wallets[].balance",
        "wallets[].currency",
        "totalBalance",
        "lowestBalanceWallet",
        "highestBalanceWallet",
      ],
      useWhen: [
        "The user asks for details of each wallet or account.",
        "The user asks which wallet has the most or least money.",
        "The user asks which wallet is nearly empty or needs funding.",
        "The user asks for the balance of a named wallet.",
      ],
      doNotUseWhen: [
        "The user only asks for total net worth or a broad financial overview.",
        "The user asks for transactions belonging to a wallet; use search_transactions with walletId.",
      ],
      examples: [
        "Chi tiết từng ví",
        "Ví nào sắp hết tiền?",
        "VCB còn bao nhiêu?",
        "Ví nào nhiều tiền nhất?",
      ],
      priority: 100,
    },
    definition: {
      type: "function",
      name: "get_wallets",
      description:
        "Return all wallets and current balances. Use this for wallet details, named-wallet balance lookup, wallet ranking, the highest balance, the lowest balance, and wallets that may be nearly empty.",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
    validate: parseEmptyArgs,
    async execute(context) {
      try {
        const wallets = await getRows<WalletRow>(context, "wallets");
        const normalized = wallets
          .map((wallet) => ({
            id: wallet.id,
            name: wallet.name,
            type: wallet.type,
            balance: Number(wallet.balance || 0),
            currency:
              "currency" in wallet && typeof wallet.currency === "string"
                ? wallet.currency
                : "VND",
          }))
          .sort((a, b) => b.balance - a.balance);

        return {
          ok: true,
          data: {
            wallets: normalized,
            count: normalized.length,
            totalBalance: normalized.reduce(
              (sum, item) => sum + item.balance,
              0,
            ),
            highestBalanceWallet: normalized[0] ?? null,
            lowestBalanceWallet:
              normalized.length > 0 ? normalized[normalized.length - 1] : null,
          },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  };

export const getBudgetStatusTool: AIFinanceToolRegistration<{
  month?: string;
}> = {
  name: "get_budget_status",
  mode: "read",
  description:
    "Get budget limits, actual spending, usage percentage, and over-budget status by category.",
  semantic: {
    capabilities: ["budget_status", "budget_risk"],
    returns: [
      "budgets[].limit",
      "budgets[].spent",
      "budgets[].remaining",
      "budgets[].usagePercent",
      "budgets[].status",
    ],
    useWhen: [
      "The user asks about budget status, remaining budget, budgets near the limit, or over-budget categories.",
    ],
    doNotUseWhen: ["The user asks only for raw transactions."],
    examples: [
      "Ngân sách nào sắp vượt?",
      "Ngân sách ăn uống còn bao nhiêu?",
      "Tôi có vượt ngân sách không?",
    ],
    priority: 90,
  },
  definition: {
    type: "function",
    name: "get_budget_status",
    description:
      "Get budget status for a month. The month must use YYYY-MM format. Omit month to use the current month.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Optional month in YYYY-MM format.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  validate: parseOptionalMonthArgs,
  async execute(context, args) {
    try {
      const month = args.month ?? currentMonth();
      const [budgetRows, transactionRows, categoryRows] = await Promise.all([
        getRows<BudgetRow>(context, "budgets", (query) =>
          query.eq("month", month),
        ),
        getRows<TransactionRow>(context, "transactions", (query) =>
          query.gte("date", `${month}-01`).lte("date", `${month}-31`),
        ),
        getRows<CategoryRow>(context, "categories"),
      ]);

      const categories = categoryRows.map(toDomainCategory);
      const categoryMap = new Map(
        categories.map((item) => [item.id, item.name]),
      );

      // Canonical Budget Spending Engine — see financeCalculations.ts.
      // Do not recompute spent/remaining/usagePercent/over-budget here.
      const spending = calculateBudgetSpendingCollection({
        budgets: budgetRows.map(toDomainBudget),
        transactions: transactionRows.map(toDomainTransaction),
        categories,
      });

      const status = spending.map((item) => ({
        budgetId: item.budgetId,
        categoryId: item.categoryId,
        categoryName: categoryMap.get(item.categoryId) ?? "Unknown",
        limit: item.limit,
        spent: item.spent,
        remaining: item.remaining,
        usagePercent: item.usagePercent,
        status: toToolStatusLabel(item.status),
      }));

      return {
        ok: true,
        data: {
          month,
          budgets: status.sort((a, b) => b.usagePercent - a.usagePercent),
          overBudgetCount: status.filter((item) => item.status === "over")
            .length,
          nearLimitCount: status.filter((item) => item.status === "near")
            .length,
        },
      };
    } catch (error) {
      return toolError(error);
    }
  },
};

export const getGoalsTool: AIFinanceToolRegistration<Record<string, never>> = {
  name: "get_goals",
  mode: "read",
  description: "Get the user's financial goals and progress toward each goal.",
  semantic: {
    capabilities: ["goal_progress", "saving_summary", "scenario_analysis"],
    returns: [
      "goal.name",
      "goal.targetAmount",
      "goal.currentAmount",
      "goal.remaining",
      "goal.progressPercent",
    ],
    useWhen: [
      "The user asks about goal progress, remaining amount, or which goal is behind.",
    ],
    doNotUseWhen: ["The user asks only for wallet balances."],
    examples: [
      "Mục tiêu nào chậm nhất?",
      "Tôi còn thiếu bao nhiêu để mua xe?",
      "Tiến độ mục tiêu mua nhà",
    ],
    priority: 85,
  },
  definition: {
    type: "function",
    name: "get_goals",
    description:
      "Get financial goals, remaining amounts, and progress percentages.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  validate: parseEmptyArgs,
  async execute(context) {
    try {
      const goals = await getRows<GoalRow>(context, "goals");

      return {
        ok: true,
        data: goals
          .map((goal) => ({
            id: goal.id,
            name: goal.name,
            targetAmount: Number(goal.targetAmount || 0),
            currentAmount: Number(goal.currentAmount || 0),
            remaining: Math.max(
              0,
              Number(goal.targetAmount || 0) - Number(goal.currentAmount || 0),
            ),
            progressPercent:
              Number(goal.targetAmount || 0) > 0
                ? Math.min(
                    100,
                    Math.round(
                      (Number(goal.currentAmount || 0) /
                        Number(goal.targetAmount || 0)) *
                        100,
                    ),
                  )
                : 0,
          }))
          .sort((a, b) => a.progressPercent - b.progressPercent),
      };
    } catch (error) {
      return toolError(error);
    }
  },
};

export const searchTransactionsTool: AIFinanceToolRegistration<SearchTransactionsArgs> =
  {
    name: "search_transactions",
    mode: "read",
    description:
      "Search and aggregate the authenticated user's transactions by date range, type, resolved category, resolved wallet, semantic query terms, merchant or note text, and amount range.",
    semantic: {
      capabilities: [
        "transaction_search",
        "transaction_ranking",
        "category_spending",
        "merchant_spending",
        "income_analysis",
        "period_comparison",
      ],
      returns: [
        "transactions",
        "count",
        "totalIncome",
        "totalExpense",
        "netAmount",
        "byCategory",
      ],
      useWhen: [
        "The user asks about transactions, spending by category or merchant, transaction ranking, income, or a specific time period.",
      ],
      doNotUseWhen: ["The user only asks for current wallet balances."],
      examples: [
        "Hôm qua tôi tiêu gì?",
        "Tháng này tiền ăn bao nhiêu?",
        "Giao dịch lớn nhất",
        "Chi tiêu ở Grab",
      ],
      priority: 95,
    },
    definition: {
      type: "function",
      name: "search_transactions",
      description:
        "Use this for transaction questions involving today, a date range, income or expense totals, category or wallet filters, semantic concepts, merchant or note text, and minimum or maximum amounts. Prefer semanticResolution categoryId or queryTerms, then entityResolution hints. The tool calculates totals server-side.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          datePreset: {
            type: "string",
            enum: [
              "today",
              "yesterday",
              "this_week",
              "last_week",
              "this_month",
              "last_month",
              "this_quarter",
              "last_quarter",
              "this_year",
              "last_year",
            ],
            description:
              "Preferred natural date preset. Use this instead of calculating dates yourself.",
          },
          from: {
            type: "string",
            description: "Optional inclusive start date in YYYY-MM-DD format.",
          },
          to: {
            type: "string",
            description: "Optional inclusive end date in YYYY-MM-DD format.",
          },
          type: {
            type: "string",
            enum: ["income", "expense"],
            description: "Optional transaction type.",
          },
          categoryId: {
            type: "string",
            description: "Optional exact category ID.",
          },
          walletId: {
            type: "string",
            description: "Optional exact wallet ID.",
          },
          query: {
            type: "string",
            description:
              "Optional exact text fragment to match against transaction note, category name, or wallet name.",
          },
          queryTerms: {
            type: "array",
            items: {
              type: "string",
            },
            minItems: 1,
            maxItems: 20,
            description:
              "Optional semantic expansion terms. A transaction matches when any term appears in its note, category name, or wallet name.",
          },
          minAmount: {
            type: "number",
            minimum: 0,
            description: "Optional minimum transaction amount.",
          },
          maxAmount: {
            type: "number",
            minimum: 0,
            description: "Optional maximum transaction amount.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description:
              "Maximum number of matching transactions returned. Defaults to 50.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
    validate: parseSearchTransactionsArgs,
    async execute(context, args) {
      try {
        const resolvedDateRange = args.datePreset
          ? resolveSearchDatePreset(args.datePreset)
          : {
              from: args.from,
              to: args.to,
            };
        const fetchLimit = Math.min(Math.max(args.limit * 4, 200), 1000);

        const [candidateTransactions, categories, wallets] = await Promise.all([
          getRows<TransactionRow>(context, "transactions", (baseQuery) => {
            let query = baseQuery;

            if (resolvedDateRange.from) {
              query = query.gte("date", resolvedDateRange.from);
            }

            if (resolvedDateRange.to) {
              query = query.lte(
                "date",
                toInclusiveEndDate(resolvedDateRange.to),
              );
            }

            if (args.type) {
              query = query.eq("type", args.type);
            }

            if (args.categoryId) {
              query = query.eq("categoryId", args.categoryId);
            }

            if (args.walletId) {
              query = query.eq("walletId", args.walletId);
            }

            return query.order("date", { ascending: false }).limit(fetchLimit);
          }),
          getRows<CategoryRow>(context, "categories"),
          getRows<WalletRow>(context, "wallets"),
        ]);

        const categoryMap = new Map(
          categories.map((item) => [item.id, item.name]),
        );
        const walletMap = new Map(wallets.map((item) => [item.id, item.name]));
        const normalizedQuery = normalizeSearchText(args.query);
        const normalizedQueryTerms = (args.queryTerms ?? [])
          .map((term) => normalizeSearchText(term))
          .filter(Boolean);

        const matchedTransactions = candidateTransactions
          .filter((item) => {
            const amount = Number(item.amount || 0);
            const categoryId = transactionCategoryId(item);
            const walletId = transactionWalletId(item);

            if (args.categoryId && categoryId !== args.categoryId) {
              return false;
            }

            if (args.walletId && walletId !== args.walletId) {
              return false;
            }

            if (args.minAmount !== undefined && amount < args.minAmount) {
              return false;
            }

            if (args.maxAmount !== undefined && amount > args.maxAmount) {
              return false;
            }

            const searchableText = normalizeSearchText(
              [
                item.note,
                categoryMap.get(categoryId),
                walletMap.get(walletId),
              ].join(" "),
            );

            if (normalizedQuery && !searchableText.includes(normalizedQuery)) {
              return false;
            }

            if (
              normalizedQueryTerms.length > 0 &&
              !normalizedQueryTerms.some((term) =>
                searchableText.includes(term),
              )
            ) {
              return false;
            }

            return true;
          })
          .slice(0, args.limit);

        const summary = buildTransactionSearchSummary({
          transactions: matchedTransactions,
          categoryMap,
          walletMap,
        });

        return {
          ok: true,
          data: {
            filters: {
              datePreset: args.datePreset,
              from: resolvedDateRange.from,
              to: resolvedDateRange.to,
              timezone: FINANCE_TIMEZONE,
              type: args.type,
              categoryId: args.categoryId,
              walletId: args.walletId,
              query: args.query,
              queryTerms: args.queryTerms,
              minAmount: args.minAmount,
              maxAmount: args.maxAmount,
              limit: args.limit,
            },
            ...summary,
            truncated:
              candidateTransactions.length >= fetchLimit ||
              matchedTransactions.length >= args.limit,
          },
        };
      } catch (error) {
        return toolError(error);
      }
    },
  };

export const getRecentTransactionsTool: AIFinanceToolRegistration<{
  limit: number;
}> = {
  name: "get_recent_transactions",
  mode: "read",
  description: "Get the authenticated user's most recent transactions.",
  semantic: {
    capabilities: ["transaction_search"],
    returns: [
      "transactions[].id",
      "transactions[].type",
      "transactions[].amount",
      "transactions[].category",
      "transactions[].wallet",
      "transactions[].note",
      "transactions[].date",
    ],
    useWhen: [
      "The user asks for the latest or most recent transactions without a specific date filter.",
    ],
    doNotUseWhen: [
      "The user asks for totals, category analysis, merchant analysis, or a defined date range; use search_transactions instead.",
    ],
    examples: ["Giao dịch gần đây", "Cho tôi xem 10 giao dịch mới nhất"],
    priority: 75,
  },
  definition: {
    type: "function",
    name: "get_recent_transactions",
    description:
      "Get recent transactions. Use a small limit unless the user explicitly asks for more.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum number of transactions to return.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  validate: parseOptionalLimitArgs,
  async execute(context, args) {
    try {
      const [transactions, categories, wallets] = await Promise.all([
        getRows<TransactionRow>(context, "transactions", (query) =>
          query.order("date", { ascending: false }).limit(args.limit),
        ),
        getRows<CategoryRow>(context, "categories"),
        getRows<WalletRow>(context, "wallets"),
      ]);

      const categoryMap = new Map(
        categories.map((item) => [item.id, item.name]),
      );
      const walletMap = new Map(wallets.map((item) => [item.id, item.name]));

      return {
        ok: true,
        data: transactions.map((item) => ({
          id: item.id,
          type: item.type,
          amount: Number(item.amount || 0),
          category: categoryMap.get(transactionCategoryId(item)) ?? "Unknown",
          wallet: walletMap.get(transactionWalletId(item)) ?? "Unknown",
          note: item.note ?? "",
          date: item.date,
        })),
      };
    } catch (error) {
      return toolError(error);
    }
  },
};

export const getFinancialHealthTool: AIFinanceToolRegistration<
  Record<string, never>
> = {
  name: "get_financial_health",
  mode: "read",
  description:
    "Calculate a compact financial health assessment from current balances and recent cash flow.",
  semantic: {
    capabilities: ["financial_health"],
    returns: [
      "score",
      "label",
      "savingRate",
      "debtRatioPercent",
      "emergencyMonths",
      "cashFlow",
    ],
    useWhen: [
      "The user asks about financial health, safety, risk, or the health score.",
    ],
    doNotUseWhen: ["The user asks for a detailed wallet list."],
    examples: [
      "Sức khỏe tài chính của tôi thế nào?",
      "Dòng tiền hiện tại có an toàn không?",
      "Vì sao điểm tài chính thấp?",
    ],
    priority: 88,
  },
  definition: {
    type: "function",
    name: "get_financial_health",
    description:
      "Get a compact financial health score with saving, debt, and liquidity indicators.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  validate: parseEmptyArgs,
  async execute(context) {
    const summary = await getFinancialSummaryTool.execute(context, {});

    if (!summary.ok || !summary.data) {
      return summary;
    }

    const data = summary.data as {
      totalAssets: number;
      totalDebt: number;
      income: number;
      expense: number;
      cashFlow: number;
      savingRate: number;
      walletAssets: number;
    };

    // Canonical debt/saving scoring — see financeCalculations.ts. The
    // liquidity-based composite score and its 0.4/0.3/0.3 weighting stay
    // tool-specific (a simplified variant, not the canonical multi-factor
    // getFinancialHealthScore, which also weighs goal progress).
    const savingScore = getSavingScore(data.savingRate);
    const debtScore = getDebtScore(data.totalDebt, data.totalAssets);
    const debtRatio =
      data.totalAssets > 0 ? data.totalDebt / data.totalAssets : 0;

    const monthlyExpense = Math.max(0, data.expense);
    const emergencyMonths =
      monthlyExpense > 0
        ? getEmergencyMonths(data.walletAssets, monthlyExpense)
        : 6;

    const liquidityScore = Math.min(
      100,
      Math.round((Math.min(emergencyMonths, 6) / 6) * 100),
    );

    const total = Math.round(
      savingScore * 0.4 + debtScore * 0.3 + liquidityScore * 0.3,
    );

    return {
      ok: true,
      data: {
        score: total,
        label:
          total >= 80
            ? "Very good"
            : total >= 65
              ? "Good"
              : total >= 50
                ? "Needs attention"
                : "High risk",
        indicators: {
          savingRate: data.savingRate,
          debtRatioPercent: Math.round(debtRatio * 1000) / 10,
          emergencyMonths: Math.round(emergencyMonths * 10) / 10,
          cashFlow: data.cashFlow,
        },
      },
    };
  },
};

export const financeReadTools = [
  getFinancialSummaryTool,
  getWalletsTool,
  getBudgetStatusTool,
  getGoalsTool,
  searchTransactionsTool,
  getRecentTransactionsTool,
  getFinancialHealthTool,
] as const;
