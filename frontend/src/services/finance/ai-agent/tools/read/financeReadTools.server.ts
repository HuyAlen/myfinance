import type { Database } from "@/src/lib/database.types";

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
      const [wallets, transactions, debts, investments] = await Promise.all([
        getRows<WalletRow>(context, "wallets"),
        getRows<TransactionRow>(context, "transactions"),
        getRows<DebtRow>(context, "debts"),
        getRows<InvestmentRow>(context, "investments"),
      ]);

      const walletAssets = wallets.reduce(
        (sum, item) => sum + Number(item.balance || 0),
        0,
      );
      const investmentAssets = investments.reduce(
        (sum, item) => sum + Number(item.currentValue || 0),
        0,
      );
      const totalDebt = debts.reduce(
        (sum, item) => sum + Number(item.remainingAmount || 0),
        0,
      );

      const month = currentMonth();
      const monthlyTransactions = transactions.filter((item) =>
        item.date.startsWith(month),
      );
      const income = monthlyTransactions
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const expense = monthlyTransactions
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      return {
        ok: true,
        data: {
          month,
          walletAssets,
          investmentAssets,
          totalAssets: walletAssets + investmentAssets,
          totalDebt,
          netWorth: walletAssets + investmentAssets - totalDebt,
          income,
          expense,
          cashFlow: income - expense,
          savingRate:
            income > 0
              ? Math.round(((income - expense) / income) * 1000) / 10
              : 0,
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

export const getBudgetStatusTool: AIFinanceToolRegistration<{
  month?: string;
}> = {
  name: "get_budget_status",
  mode: "read",
  description:
    "Get budget limits, actual spending, usage percentage, and over-budget status by category.",
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
      const [budgets, transactions, categories] = await Promise.all([
        getRows<BudgetRow>(context, "budgets", (query) =>
          query.eq("month", month),
        ),
        getRows<TransactionRow>(context, "transactions", (query) =>
          query.gte("date", `${month}-01`).lte("date", `${month}-31`),
        ),
        getRows<CategoryRow>(context, "categories"),
      ]);

      const categoryMap = new Map(
        categories.map((item) => [item.id, item.name]),
      );

      const spendingByCategory = new Map<string, number>();

      for (const transaction of transactions) {
        if (transaction.type !== "expense") continue;

        const categoryId = transactionCategoryId(transaction);

        spendingByCategory.set(
          categoryId,
          (spendingByCategory.get(categoryId) ?? 0) +
            Number(transaction.amount || 0),
        );
      }

      const status = budgets.map((budget) => {
        const spent = spendingByCategory.get(budget.categoryId) ?? 0;
        const limit = Number(budget.limitAmount || 0);
        const usagePercent =
          limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 0;

        return {
          budgetId: budget.id,
          categoryId: budget.categoryId,
          categoryName: categoryMap.get(budget.categoryId) ?? "Unknown",
          limit,
          spent,
          remaining: limit - spent,
          usagePercent,
          status:
            spent > limit ? "over" : usagePercent >= 85 ? "near" : "on_track",
        };
      });

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

    const savingScore =
      data.savingRate >= 40
        ? 100
        : data.savingRate > 0
          ? Math.round((data.savingRate / 40) * 100)
          : 0;

    const debtRatio =
      data.totalAssets > 0 ? data.totalDebt / data.totalAssets : 0;

    const debtScore =
      data.totalDebt <= 0
        ? 100
        : debtRatio <= 0.2
          ? 90
          : debtRatio <= 0.35
            ? 75
            : debtRatio <= 0.5
              ? 55
              : 25;

    const monthlyExpense = Math.max(0, data.expense);
    const emergencyMonths =
      monthlyExpense > 0 ? data.walletAssets / monthlyExpense : 6;

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
  getBudgetStatusTool,
  getGoalsTool,
  searchTransactionsTool,
  getRecentTransactionsTool,
  getFinancialHealthTool,
] as const;
