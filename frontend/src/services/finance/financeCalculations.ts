import type { Category, Debt, Goal, Transaction, Wallet } from "@/src/types/finance";

export function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
}

export function getTotalAssets(wallets: Wallet[]) {
  return wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
}

export function getTotalDebt(debts: Debt[]) {
  return debts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
}

export function getNetWorth(wallets: Wallet[], debts: Debt[]) {
  return getTotalAssets(wallets) - getTotalDebt(debts);
}

export function getTotalIncome(transactions: Transaction[]) {
  return transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getTotalExpense(transactions: Transaction[]) {
  return transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
}

export function getSavingRate(income: number, expense: number) {
  if (income <= 0) return 0;

  return Math.round(((income - expense) / income) * 1000) / 10;
}

export function getDebtRatio(totalDebt: number, totalAssets: number) {
  if (totalAssets <= 0) return 0;

  return Math.round((totalDebt / totalAssets) * 1000) / 10;
}

export function getGoalScore(goals: Goal[]) {
  if (goals.length === 0) return 0;

  const totalPercent = goals.reduce((sum, goal) => {
    return sum + Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
  }, 0);

  return Math.round(totalPercent / goals.length);
}

export function getSpendingByCategory(
  transactions: Transaction[],
  categories: Category[]
) {
  const expenses = transactions.filter((item) => item.type === "expense");
  const totalExpense = getTotalExpense(transactions);

  return categories
    .filter((category) => category.type === "expense")
    .map((category) => {
      const total = expenses
        .filter((item) => item.categoryId === category.id)
        .reduce((sum, item) => sum + item.amount, 0);

      const percent = totalExpense > 0 ? Math.round((total / totalExpense) * 100) : 0;

      return {
        name: category.name,
        value: total,
        percent,
      };
    })
    .filter((item) => item.value > 0);
}