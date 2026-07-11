import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";

type Client = SupabaseClient<Database>;

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

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
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
  const monthTransactions = transactions.filter((item) =>
    String(item.date).startsWith(currentMonth),
  );

  const income = sum(
    monthTransactions
      .filter((item) => item.type === "income")
      .map((item) => item.amount),
  );
  const expense = sum(
    monthTransactions
      .filter((item) => item.type === "expense")
      .map((item) => item.amount),
  );

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
  const budgetStatus = currentBudgets
    .map((item) => {
      const spent = expenseByCategory.get(item.categoryId) ?? 0;
      const limit = Number(item.limitAmount) || 0;
      return {
        category: categoryById.get(item.categoryId) ?? "Khác",
        limit,
        spent,
        usagePercent: limit > 0 ? Math.round((spent / limit) * 100) : 0,
      };
    })
    .sort((a, b) => b.usagePercent - a.usagePercent)
    .slice(0, 10);

  const walletBalance = sum(wallets.map((item) => item.balance));
  const totalDebt = sum(debts.map((item) => item.remainingAmount));
  const investmentValue = sum(investments.map((item) => item.currentValue));
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
      netWorth: walletBalance + investmentValue - totalDebt,
      currentMonthIncome: income,
      currentMonthExpense: expense,
      currentMonthCashFlow: cashFlow,
      savingRate: income > 0 ? Math.round((cashFlow / income) * 1000) / 10 : 0,
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
