import type { AIFinanceContext } from "./aiFinanceContext";
import type {
  Budget,
  Category,
  Goal,
  Transaction,
  Wallet,
} from "@/src/types/finance";

export type AIFinanceSearchScope =
  | "transactions"
  | "budgets"
  | "wallets"
  | "goals"
  | "all";

export type AIFinanceSearchIntent =
  | "find_transaction"
  | "transaction_total"
  | "large_transactions"
  | "category_spending"
  | "wallet_activity"
  | "budget_lookup"
  | "goal_lookup"
  | "general_search";

export type AIFinanceSearchResultType =
  | "transaction"
  | "budget"
  | "wallet"
  | "goal"
  | "summary";

export type AIFinanceSearchResult = {
  id: string;
  type: AIFinanceSearchResultType;
  title: string;
  subtitle?: string;
  amount?: number;
  amountLabel?: string;
  date?: string;
  score: number;
  matchedFields: string[];
  data: Record<string, unknown>;
};

export type AIFinanceSearchSummary = {
  totalMatchedTransactions: number;
  totalIncome: number;
  totalExpense: number;
  netAmount: number;
  totalIncomeLabel: string;
  totalExpenseLabel: string;
  netAmountLabel: string;
  topCategory?: string;
  topWallet?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
};

export type AIFinanceSearchResponse = {
  query: string;
  normalizedQuery: string;
  isSearchLike: boolean;
  intent: AIFinanceSearchIntent;
  scopes: AIFinanceSearchScope[];
  keywords: string[];
  amountFilter?: {
    operator: "gte" | "lte" | "eq";
    amount: number;
    amountLabel: string;
  };
  limit: number;
  results: AIFinanceSearchResult[];
  summary: AIFinanceSearchSummary;
  contextText: string;
};

const DEFAULT_LIMIT = 12;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}

function safeDate(value?: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function getCategoryName(categories: Category[], categoryId?: string) {
  if (!categoryId) return "Không có danh mục";
  return categories.find((item) => item.id === categoryId)?.name ?? categoryId;
}

function getWalletName(wallets: Wallet[], walletId?: string) {
  if (!walletId) return "Không có ví";
  return wallets.find((item) => item.id === walletId)?.name ?? walletId;
}

function tokenizeQuery(query: string) {
  const ignored = new Set([
    "toi",
    "tôi",
    "cua",
    "của",
    "la",
    "là",
    "bao",
    "nhieu",
    "nhiêu",
    "khi",
    "nao",
    "nào",
    "tim",
    "tìm",
    "cac",
    "các",
    "giao",
    "dich",
    "dịch",
    "thang",
    "tháng",
    "nay",
    "trong",
    "cho",
    "ve",
    "về",
    "da",
    "đã",
    "co",
    "có",
    "khong",
    "không",
    "tien",
    "tiền",
    "dong",
    "đồng",
    "vnd",
    "d",
  ]);

  return normalizeText(query)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !ignored.has(item));
}

function parseAmountFilter(query: string) {
  const normalized = normalizeText(query);
  const amountMatch = normalized.match(
    /(tren|hon|lon hon|>=|duoi|nho hon|<=|bang|=)?\s*(\d+(?:[.,]\d+)?)\s*(trieu|triệu|m|k|nghin|ngan|ngàn|dong|vnd|d)?/i,
  );
  if (!amountMatch) return undefined;

  const rawNumber = Number(amountMatch[2].replace(",", "."));
  if (!Number.isFinite(rawNumber) || rawNumber <= 0) return undefined;

  const unit = amountMatch[3] ?? "";
  const amount =
    unit.includes("trieu") || unit.includes("triệu") || unit === "m"
      ? rawNumber * 1_000_000
      : unit.includes("k") ||
          unit.includes("nghin") ||
          unit.includes("ngan") ||
          unit.includes("ngàn")
        ? rawNumber * 1_000
        : rawNumber;

  const operatorText = amountMatch[1] ?? "";
  const operator =
    operatorText.includes("duoi") ||
    operatorText.includes("nho") ||
    operatorText.includes("<=")
      ? "lte"
      : operatorText.includes("bang") || operatorText.includes("=")
        ? "eq"
        : "gte";

  return {
    operator: operator as "gte" | "lte" | "eq",
    amount,
    amountLabel: formatVnd(amount),
  };
}

function inferSearchIntent(query: string): AIFinanceSearchIntent {
  const q = normalizeText(query);

  if (/(tren|hon|lon hon|duoi|nho hon|>=|<=)\s*\d/.test(q)) {
    return "large_transactions";
  }

  if (
    q.includes("tong") ||
    q.includes("bao nhieu") ||
    q.includes("het bao nhieu") ||
    q.includes("ton bao nhieu")
  ) {
    return "transaction_total";
  }

  if (
    q.includes("ngan sach") ||
    q.includes("budget") ||
    q.includes("han muc")
  ) {
    return "budget_lookup";
  }

  if (q.includes("muc tieu") || q.includes("goal") || q.includes("tien do")) {
    return "goal_lookup";
  }

  if (
    q.includes("vi") ||
    q.includes("wallet") ||
    q.includes("tai khoan") ||
    q.includes("so du")
  ) {
    return "wallet_activity";
  }

  if (
    q.includes("danh muc") ||
    q.includes("category") ||
    q.includes("an uong") ||
    q.includes("di lai")
  ) {
    return "category_spending";
  }

  if (
    q.includes("mua") ||
    q.includes("thanh toan") ||
    q.includes("grab") ||
    q.includes("shopee") ||
    q.includes("macbook")
  ) {
    return "find_transaction";
  }

  return "general_search";
}

function inferScopes(
  query: string,
  intent: AIFinanceSearchIntent,
): AIFinanceSearchScope[] {
  const q = normalizeText(query);
  const scopes = new Set<AIFinanceSearchScope>();

  if (
    [
      "find_transaction",
      "transaction_total",
      "large_transactions",
      "category_spending",
      "wallet_activity",
    ].includes(intent)
  ) {
    scopes.add("transactions");
  }
  if (
    intent === "budget_lookup" ||
    q.includes("ngan sach") ||
    q.includes("budget")
  )
    scopes.add("budgets");
  if (intent === "goal_lookup" || q.includes("muc tieu") || q.includes("goal"))
    scopes.add("goals");
  if (intent === "wallet_activity" || q.includes("vi") || q.includes("wallet"))
    scopes.add("wallets");

  if (scopes.size === 0) scopes.add("all");
  return Array.from(scopes);
}

function passesAmountFilter(
  amount: number,
  filter?: AIFinanceSearchResponse["amountFilter"],
) {
  if (!filter) return true;
  if (filter.operator === "gte") return amount >= filter.amount;
  if (filter.operator === "lte") return amount <= filter.amount;
  return (
    Math.abs(amount - filter.amount) <= Math.max(1000, filter.amount * 0.02)
  );
}

function scoreText(keywords: string[], haystack: string) {
  const normalized = normalizeText(haystack);
  if (keywords.length === 0) return 0;

  return keywords.reduce((score, keyword) => {
    if (!keyword) return score;
    if (normalized === keyword) return score + 5;
    if (normalized.includes(keyword)) return score + 2;
    return score;
  }, 0);
}

function matchTransactions(input: {
  context: AIFinanceContext;
  keywords: string[];
  amountFilter?: AIFinanceSearchResponse["amountFilter"];
}) {
  const { context, keywords, amountFilter } = input;
  const { transactions, categories, wallets } = context.raw;

  return transactions
    .map((transaction) => {
      const categoryName = getCategoryName(categories, transaction.categoryId);
      const walletName = getWalletName(wallets, transaction.walletId);
      const transferToWalletName = transaction.transferToWalletId
        ? getWalletName(wallets, transaction.transferToWalletId)
        : "";
      const fields = {
        note: transaction.note ?? "",
        category: categoryName,
        wallet: walletName,
        transferToWallet: transferToWalletName,
        type: transaction.type,
        date: safeDate(transaction.date),
      };
      const haystack = Object.values(fields).join(" ");
      let score = scoreText(keywords, haystack);

      if (amountFilter && passesAmountFilter(transaction.amount, amountFilter))
        score += 4;
      if (keywords.length === 0 && amountFilter) score += 1;
      if (keywords.length === 0 && !amountFilter) score += 0.2;

      const matchedFields = Object.entries(fields)
        .filter(([, value]) => scoreText(keywords, value) > 0)
        .map(([key]) => key);

      if (
        amountFilter &&
        passesAmountFilter(transaction.amount, amountFilter)
      ) {
        matchedFields.push("amount");
      }

      return {
        item: transaction,
        score,
        categoryName,
        walletName,
        transferToWalletName,
        matchedFields,
      };
    })
    .filter(
      (item) =>
        item.score > 0 && passesAmountFilter(item.item.amount, amountFilter),
    )
    .sort(
      (a, b) => b.score - a.score || b.item.date.localeCompare(a.item.date),
    );
}

function matchBudgets(context: AIFinanceContext, keywords: string[]) {
  return context.raw.budgets
    .map((budget) => {
      const categoryName = getCategoryName(
        context.raw.categories,
        budget.categoryId,
      );
      const score = scoreText(keywords, `${categoryName} ${budget.month}`);
      return { budget, categoryName, score };
    })
    .filter((item) => item.score > 0 || keywords.length === 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.budget.month.localeCompare(a.budget.month),
    );
}

function matchGoals(context: AIFinanceContext, keywords: string[]) {
  return context.raw.goals
    .map((goal) => ({ goal, score: scoreText(keywords, goal.name) }))
    .filter((item) => item.score > 0 || keywords.length === 0)
    .sort((a, b) => b.score - a.score);
}

function matchWallets(context: AIFinanceContext, keywords: string[]) {
  return context.raw.wallets
    .map((wallet) => ({
      wallet,
      score: scoreText(keywords, `${wallet.name} ${wallet.type}`),
    }))
    .filter((item) => item.score > 0 || keywords.length === 0)
    .sort((a, b) => b.score - a.score || b.wallet.balance - a.wallet.balance);
}

function buildSummary(
  transactions: Transaction[],
  context: AIFinanceContext,
): AIFinanceSearchSummary {
  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const expense = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const byCategory = new Map<string, number>();
  const byWallet = new Map<string, number>();

  for (const item of transactions) {
    const categoryName = getCategoryName(
      context.raw.categories,
      item.categoryId,
    );
    const walletName = getWalletName(context.raw.wallets, item.walletId);
    byCategory.set(
      categoryName,
      (byCategory.get(categoryName) ?? 0) + item.amount,
    );
    byWallet.set(walletName, (byWallet.get(walletName) ?? 0) + item.amount);
  }

  const topCategory = Array.from(byCategory.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];
  const topWallet = Array.from(byWallet.entries()).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  return {
    totalMatchedTransactions: transactions.length,
    totalIncome: income,
    totalExpense: expense,
    netAmount: income - expense,
    totalIncomeLabel: formatVnd(income),
    totalExpenseLabel: formatVnd(expense),
    netAmountLabel: formatVnd(income - expense),
    topCategory,
    topWallet,
    dateRange: context.range,
  };
}

function toTransactionResult(input: {
  transaction: Transaction;
  categoryName: string;
  walletName: string;
  transferToWalletName?: string;
  matchedFields: string[];
  score: number;
}): AIFinanceSearchResult {
  const {
    transaction,
    categoryName,
    walletName,
    transferToWalletName,
    matchedFields,
    score,
  } = input;
  const direction =
    transaction.type === "income"
      ? "Thu nhập"
      : transaction.type === "transfer"
        ? "Chuyển ví"
        : "Chi tiêu";

  return {
    id: transaction.id,
    type: "transaction",
    title: `${direction}: ${categoryName}`,
    subtitle: [
      safeDate(transaction.date),
      walletName,
      transferToWalletName ? `→ ${transferToWalletName}` : "",
      transaction.note,
    ]
      .filter(Boolean)
      .join(" · "),
    amount: transaction.amount,
    amountLabel: formatVnd(transaction.amount),
    date: safeDate(transaction.date),
    score,
    matchedFields,
    data: {
      transaction,
      categoryName,
      walletName,
      transferToWalletName,
    },
  };
}

function toBudgetResult(
  budget: Budget,
  categoryName: string,
  score: number,
): AIFinanceSearchResult {
  return {
    id: budget.id,
    type: "budget",
    title: `Ngân sách: ${categoryName}`,
    subtitle: `${budget.month} · Hạn mức ${formatVnd(budget.limitAmount)}`,
    amount: budget.limitAmount,
    amountLabel: formatVnd(budget.limitAmount),
    score,
    matchedFields: ["category", "month"],
    data: { budget, categoryName },
  };
}

function toWalletResult(wallet: Wallet, score: number): AIFinanceSearchResult {
  return {
    id: wallet.id,
    type: "wallet",
    title: `Ví: ${wallet.name}`,
    subtitle: wallet.type,
    amount: wallet.balance,
    amountLabel: formatVnd(wallet.balance),
    score,
    matchedFields: ["name", "type"],
    data: { wallet },
  };
}

function toGoalResult(goal: Goal, score: number): AIFinanceSearchResult {
  const progress =
    goal.targetAmount > 0
      ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
      : 0;
  return {
    id: goal.id,
    type: "goal",
    title: `Mục tiêu: ${goal.name}`,
    subtitle: `${formatVnd(goal.currentAmount)} / ${formatVnd(goal.targetAmount)} · ${progress}%`,
    amount: goal.currentAmount,
    amountLabel: formatVnd(goal.currentAmount),
    score,
    matchedFields: ["name"],
    data: { goal, progress },
  };
}

function buildContextText(
  search: Omit<AIFinanceSearchResponse, "contextText">,
) {
  if (!search.isSearchLike) return "";

  const resultLines = search.results.slice(0, 8).map((result, index) => {
    const amount = result.amountLabel ? ` · ${result.amountLabel}` : "";
    const date = result.date ? ` · ${result.date}` : "";
    const subtitle = result.subtitle ? ` · ${result.subtitle}` : "";
    return `${index + 1}. [${result.type}] ${result.title}${amount}${date}${subtitle}`;
  });

  return [
    `Smart Finance Search: ${search.intent}`,
    `Query: ${search.query}`,
    `Matched transactions: ${search.summary.totalMatchedTransactions}`,
    `Matched income: ${search.summary.totalIncomeLabel}`,
    `Matched expense: ${search.summary.totalExpenseLabel}`,
    search.summary.topCategory
      ? `Top matched category: ${search.summary.topCategory}`
      : null,
    search.summary.topWallet
      ? `Top matched wallet: ${search.summary.topWallet}`
      : null,
    search.amountFilter
      ? `Amount filter: ${search.amountFilter.operator} ${search.amountFilter.amountLabel}`
      : null,
    "Top results:",
    resultLines.length > 0
      ? resultLines.join("\n")
      : "- Không tìm thấy kết quả phù hợp.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSmartFinanceSearch(input: {
  question: string;
  context: AIFinanceContext | null;
  limit?: number;
}): AIFinanceSearchResponse | null {
  const { question, context } = input;
  if (!context) return null;

  const normalizedQuery = normalizeText(question);
  const keywords = tokenizeQuery(question);
  const amountFilter = parseAmountFilter(question);
  const intent = inferSearchIntent(question);
  const scopes = inferScopes(question, intent);
  const limit = input.limit ?? DEFAULT_LIMIT;

  const searchHints = [
    "tim",
    "tìm",
    "mua",
    "giao dich",
    "giao dịch",
    "khi nao",
    "khi nào",
    "bao nhieu",
    "bao nhiêu",
    "ton bao nhieu",
    "tốn bao nhiêu",
    "tren",
    "trên",
    "duoi",
    "dưới",
    "grab",
    "shopee",
    "macbook",
    "an uong",
    "ăn uống",
    "di lai",
    "đi lại",
    "vi nao",
    "ví nào",
  ];

  const isSearchLike =
    amountFilter !== undefined ||
    searchHints.some((hint) => normalizedQuery.includes(normalizeText(hint))) ||
    [
      "find_transaction",
      "transaction_total",
      "large_transactions",
      "category_spending",
      "wallet_activity",
      "budget_lookup",
      "goal_lookup",
    ].includes(intent);

  if (!isSearchLike) return null;

  const includeAll = scopes.includes("all");
  const transactionMatches =
    includeAll || scopes.includes("transactions")
      ? matchTransactions({ context, keywords, amountFilter })
      : [];

  const transactionResults = transactionMatches.slice(0, limit).map((match) =>
    toTransactionResult({
      transaction: match.item,
      categoryName: match.categoryName,
      walletName: match.walletName,
      transferToWalletName: match.transferToWalletName,
      matchedFields: match.matchedFields,
      score: match.score,
    }),
  );

  const budgetResults = (
    includeAll || scopes.includes("budgets")
      ? matchBudgets(context, keywords)
      : []
  )
    .slice(0, Math.min(5, limit))
    .map((item) => toBudgetResult(item.budget, item.categoryName, item.score));

  const walletResults = (
    includeAll || scopes.includes("wallets")
      ? matchWallets(context, keywords)
      : []
  )
    .slice(0, Math.min(5, limit))
    .map((item) => toWalletResult(item.wallet, item.score));

  const goalResults = (
    includeAll || scopes.includes("goals") ? matchGoals(context, keywords) : []
  )
    .slice(0, Math.min(5, limit))
    .map((item) => toGoalResult(item.goal, item.score));

  const results = [
    ...transactionResults,
    ...budgetResults,
    ...walletResults,
    ...goalResults,
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const summary = buildSummary(
    transactionMatches.map((item) => item.item),
    context,
  );

  const responseWithoutText = {
    query: question,
    normalizedQuery,
    isSearchLike,
    intent,
    scopes,
    keywords,
    amountFilter,
    limit,
    results,
    summary,
  } satisfies Omit<AIFinanceSearchResponse, "contextText">;

  return {
    ...responseWithoutText,
    contextText: buildContextText(responseWithoutText),
  };
}

export function compactSmartFinanceSearch(
  search: AIFinanceSearchResponse | null,
) {
  if (!search) return null;

  return {
    query: search.query,
    intent: search.intent,
    scopes: search.scopes,
    keywords: search.keywords,
    amountFilter: search.amountFilter,
    summary: search.summary,
    results: search.results.slice(0, 10).map((result) => ({
      id: result.id,
      type: result.type,
      title: result.title,
      subtitle: result.subtitle,
      amountLabel: result.amountLabel,
      date: result.date,
      matchedFields: result.matchedFields,
    })),
    contextText: search.contextText,
  };
}
