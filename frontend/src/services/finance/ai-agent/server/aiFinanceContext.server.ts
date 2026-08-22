import type { SupabaseClient } from "@supabase/supabase-js";
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
  getSavingRate,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

type Client = SupabaseClient<Database>;

type CategoryDbRow = Database["public"]["Tables"]["categories"]["Row"];
type CategoryRow = Pick<CategoryDbRow, "id" | "name" | "type" | "planning_group"> & {
  // Transitional alias accepted only at this domain boundary. The canonical
  // database column is `planning_group`; older in-memory fixtures may still
  // carry the camelCase domain property.
  planningGroup?: CategoryPlanningGroup | null;
};

export function toDomainCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Category["type"],
    planningGroup: row.planningGroup ?? row.planning_group ?? undefined,
  };
}

type TransactionRow = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  "id" | "type" | "amount" | "categoryId" | "walletId" | "note" | "date"
>;

export function toDomainTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as Transaction["type"],
    amount: row.amount,
    categoryId: row.categoryId,
    walletId: row.walletId,
    note: row.note ?? "",
    date: row.date,
  };
}

export function toDomainBudget(
  row: Pick<
    Database["public"]["Tables"]["budgets"]["Row"],
    "id" | "categoryId" | "month" | "limitAmount"
  >,
): Budget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    month: row.month,
    limitAmount: row.limitAmount,
  };
}

export function toDomainWallet(
  row: Pick<
    Database["public"]["Tables"]["wallets"]["Row"],
    "id" | "name" | "type" | "balance"
  >,
): Wallet {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Wallet["type"],
    balance: row.balance,
  };
}

export function toDomainDebt(
  row: Pick<
    Database["public"]["Tables"]["debts"]["Row"],
    "id" | "name" | "totalAmount" | "remainingAmount"
  >,
): Debt {
  return {
    id: row.id,
    name: row.name,
    totalAmount: row.totalAmount,
    remainingAmount: row.remainingAmount,
  };
}

export function toDomainInvestment(
  row: Pick<
    Database["public"]["Tables"]["investments"]["Row"],
    "id" | "name" | "type" | "currentValue" | "investedAmount"
  >,
): Investment {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Investment["type"],
    currentValue: row.currentValue,
    investedAmount: row.investedAmount,
  };
}

type FinanceContext = {
  generatedAt: string;
  counts: {
    wallets: number;
    categories: number;
    transactions: number;
    debts: number;
    goals: number;
    budgets: number;
    investments: number;
  };
  totals: {
    walletBalance: number;
    totalDebt: number;
    investmentValue: number;
    netWorth: number;
    currentMonthIncome: number;
    currentMonthExpense: number;
    currentMonthCashFlow: number;
    savingRate: number;
  };
  topExpenseCategories: Array<{
    category: string;
    amount: number;
  }>;
  budgetStatus: Array<{
    category: string;
    limit: number;
    spent: number;
    usagePercent: number;
  }>;
  goals: Array<{
    name: string;
    targetAmount: number;
    currentAmount: number;
    progressPercent: number;
  }>;
};

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function buildServerFinanceContext(
  client: Client,
  userId: string,
): Promise<FinanceContext> {
  const currentMonth = monthKey();

  const [
    walletsResult,
    categoriesResult,
    transactionsResult,
    debtsResult,
    goalsResult,
    budgetsResult,
    investmentsResult,
  ] = await Promise.all([
    client.from("wallets").select("*").eq("user_id", userId),
    client.from("categories").select("*").eq("user_id", userId),
    client
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false }),
    client.from("debts").select("*").eq("user_id", userId),
    client.from("goals").select("*").eq("user_id", userId),
    client.from("budgets").select("*").eq("user_id", userId),
    client.from("investments").select("*").eq("user_id", userId),
  ]);

  const firstError = [
    walletsResult.error,
    categoriesResult.error,
    transactionsResult.error,
    debtsResult.error,
    goalsResult.error,
    budgetsResult.error,
    investmentsResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const wallets = walletsResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const transactions = transactionsResult.data ?? [];
  const debts = debtsResult.data ?? [];
  const goals = goalsResult.data ?? [];
  const budgets = budgetsResult.data ?? [];
  const investments = investmentsResult.data ?? [];

  const categoryById = new Map(categories.map((item) => [item.id, item.name]));
  const domainCategories = categories.map(toDomainCategory);
  const monthTransactions = transactions.filter((item) =>
    String(item.date).startsWith(currentMonth),
  );
  const domainMonthTransactions = monthTransactions.map(toDomainTransaction);

  // Canonical income/expense — see financeCalculations.ts. `getTotalExpense`
  // excludes saving/investment-planning-group transactions (real expense
  // semantics), matching Dashboard/Reports.
  const income = getTotalIncome(domainMonthTransactions);
  const expense = getTotalExpense(domainMonthTransactions, domainCategories);

  const expenseByCategory = new Map<string, number>();
  for (const item of monthTransactions) {
    if (item.type !== "expense") continue;
    expenseByCategory.set(
      item.categoryId,
      (expenseByCategory.get(item.categoryId) ?? 0) + item.amount,
    );
  }

  const topExpenseCategories = [...expenseByCategory.entries()]
    .map(([categoryId, amount]) => ({
      category: categoryById.get(categoryId) ?? "Khác",
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const currentBudgets = budgets.filter((item) => item.month === currentMonth);

  // Canonical Budget Spending Engine — see financeCalculations.ts. Do not
  // recompute spent/usagePercent from expenseByCategory here.
  const budgetSpending = calculateBudgetSpendingCollection({
    budgets: currentBudgets.map(toDomainBudget),
    transactions: transactions.map(toDomainTransaction),
    categories: categories.map(toDomainCategory),
  });
  const budgetStatus = budgetSpending
    .map((item) => ({
      category: categoryById.get(item.categoryId) ?? "Khác",
      limit: item.limit,
      spent: item.spent,
      usagePercent: item.usagePercent,
    }))
    .sort((a, b) => b.usagePercent - a.usagePercent)
    .slice(0, 10);

  // Canonical net worth — see financeCalculations.ts. Savings and Forex are
  // not part of this AI context snapshot yet, so they default to 0 rather
  // than being reconstructed here.
  const netWorthBreakdown = calculateNetWorth({
    wallets: wallets.map(toDomainWallet),
    investments: investments.map(toDomainInvestment),
    debts: debts.map(toDomainDebt),
  });
  const walletBalance = netWorthBreakdown.cashAndWallets;
  const totalDebt = netWorthBreakdown.totalDebt;
  const investmentValue = netWorthBreakdown.investments;
  const cashFlow = income - expense;

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      wallets: wallets.length,
      categories: categories.length,
      transactions: transactions.length,
      debts: debts.length,
      goals: goals.length,
      budgets: budgets.length,
      investments: investments.length,
    },
    totals: {
      walletBalance,
      totalDebt,
      investmentValue,
      netWorth: netWorthBreakdown.netWorth,
      currentMonthIncome: income,
      currentMonthExpense: expense,
      currentMonthCashFlow: cashFlow,
      savingRate: getSavingRate(income, expense),
    },
    topExpenseCategories,
    budgetStatus,
    goals: goals.slice(0, 10).map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      progressPercent:
        goal.targetAmount > 0
          ? Math.min(
              100,
              Math.round((goal.currentAmount / goal.targetAmount) * 100),
            )
          : 0,
    })),
  };
}

export type { FinanceContext };
