import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/src/lib/database.types";
import type {
  Budget,
  Category,
  CategoryPlanningGroup,
  Debt,
  ForexAccount,
  ForexCashTransaction,
  Goal,
  Investment,
  SavingAccount,
  Transaction,
  Wallet,
} from "@/src/types/finance";
import { formatYearMonthInTimeZone } from "@/src/lib/date/calendarDate";
import {
  calculateBalanceSheetSnapshot,
  calculateBudgetSpendingCollection,
  calculateGoalFundingSnapshot,
  buildCategorySpendingData,
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

export function toDomainSaving(
  row: Pick<
    Database["public"]["Tables"]["savings"]["Row"],
    "id" | "name" | "type" | "balance" | "interest_rate" | "maturity_date" | "notes"
  >,
): SavingAccount {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Number(row.balance || 0),
    interestRate: row.interest_rate ?? undefined,
    maturityDate: row.maturity_date ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function toDomainForexAccount(
  row: Pick<
    Database["public"]["Tables"]["forex_accounts"]["Row"],
    "id" | "name" | "broker" | "currency" | "status" | "current_equity"
  >,
): ForexAccount {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    currency: row.currency,
    status: row.status,
    currentEquity: row.current_equity,
  };
}

export function toDomainForexCashTransaction(
  row: Pick<
    Database["public"]["Tables"]["forex_cash_transactions"]["Row"],
    | "id"
    | "forex_account_id"
    | "wallet_id"
    | "type"
    | "amount"
    | "currency"
    | "fee"
    | "transaction_date"
    | "transaction_time"
  >,
): ForexCashTransaction {
  return {
    id: row.id,
    forexAccountId: row.forex_account_id,
    walletId: row.wallet_id ?? "",
    type: row.type,
    amount: Number(row.amount || 0),
    currency: "VND",
    fee: Number(row.fee || 0),
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
  };
}

export function toDomainGoal(
  row: Pick<
    Database["public"]["Tables"]["goals"]["Row"],
    "id" | "name" | "targetAmount" | "currentAmount" | "saving_category_ids"
  >,
): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.targetAmount || 0),
    currentAmount: Number(row.currentAmount || 0),
    // Raw persisted links are deliberately passed through. The canonical
    // resolver understands both namespaced v2 links and unprefixed legacy IDs.
    savingCategoryIds: row.saving_category_ids ?? [],
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
    savings: number;
    forexAccounts: number;
  };
  totals: {
    walletBalance: number;
    savingsBalance: number;
    investmentValue: number;
    forexAssetValue: number;
    totalAssets: number;
    totalDebt: number;
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

const FINANCE_TIMEZONE = "Asia/Ho_Chi_Minh";

function monthKey(date = new Date()) {
  return formatYearMonthInTimeZone(date, FINANCE_TIMEZONE);
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
    savingsResult,
    forexAccountsResult,
    forexCashTransactionsResult,
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
    client.from("savings").select("*").eq("user_id", userId),
    client.from("forex_accounts").select("*").eq("user_id", userId),
    client.from("forex_cash_transactions").select("*").eq("user_id", userId),
  ]);

  const firstError = [
    walletsResult.error,
    categoriesResult.error,
    transactionsResult.error,
    debtsResult.error,
    goalsResult.error,
    budgetsResult.error,
    investmentsResult.error,
    savingsResult.error,
    forexAccountsResult.error,
    forexCashTransactionsResult.error,
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
  const savings = savingsResult.data ?? [];
  const forexAccounts = forexAccountsResult.data ?? [];
  const forexCashTransactions = forexCashTransactionsResult.data ?? [];

  const categoryById = new Map(categories.map((item) => [item.id, item.name]));
  const domainCategories = categories.map(toDomainCategory);
  const monthTransactions = transactions.filter((item) =>
    String(item.date).startsWith(currentMonth),
  );
  const domainMonthTransactions = monthTransactions.map(toDomainTransaction);
  const domainTransactions = transactions.map(toDomainTransaction);
  const domainSavings = savings.map(toDomainSaving);
  const domainForexAccounts = forexAccounts.map(toDomainForexAccount);
  const domainForexCashTransactions = forexCashTransactions.map(
    toDomainForexCashTransaction,
  );

  // Canonical income/expense — see financeCalculations.ts. `getTotalExpense`
  // excludes saving/investment-planning-group transactions (real expense
  // semantics), matching Dashboard/Reports.
  const income = getTotalIncome(domainMonthTransactions);
  const expense = getTotalExpense(domainMonthTransactions, domainCategories);

  const topExpenseCategories = buildCategorySpendingData(
    domainMonthTransactions,
    domainCategories,
  )
    .slice(0, 8)
    .map((item) => ({
      category: item.name,
      amount: item.value,
    }));

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

  const balanceSheet = calculateBalanceSheetSnapshot({
    wallets: wallets.map(toDomainWallet),
    savings: domainSavings,
    investments: investments.map(toDomainInvestment),
    debts: debts.map(toDomainDebt),
    forexAccounts: domainForexAccounts,
    forexCashTransactions: domainForexCashTransactions,
  });
  const walletBalance = balanceSheet.cashAndWallets;
  const totalDebt = balanceSheet.totalDebt;
  const investmentValue = balanceSheet.investments;
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
      savings: savings.length,
      forexAccounts: forexAccounts.length,
    },
    totals: {
      walletBalance,
      savingsBalance: balanceSheet.savings,
      investmentValue,
      forexAssetValue: balanceSheet.forex,
      totalAssets: balanceSheet.totalAssets,
      totalDebt,
      netWorth: balanceSheet.netWorth,
      currentMonthIncome: income,
      currentMonthExpense: expense,
      currentMonthCashFlow: cashFlow,
      savingRate: getSavingRate(income, expense),
    },
    topExpenseCategories,
    budgetStatus,
    goals: goals.slice(0, 10).map((goal) => {
      const domainGoal = toDomainGoal(goal);
      const funding = calculateGoalFundingSnapshot({
        goal: domainGoal,
        transactions: domainTransactions,
        savings: domainSavings,
      });
      return {
        name: domainGoal.name,
        targetAmount: domainGoal.targetAmount,
        currentAmount: funding.effectiveCurrentAmount,
        progressPercent: funding.progressPercent,
      };
    }),
  };
}

export type { FinanceContext };
