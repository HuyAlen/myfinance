import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
} from "@/src/types/finance";

export const demoWallets: Wallet[] = [
  { id: "cash", name: "Tiền mặt", type: "cash", balance: 8500000 },
  { id: "vcb", name: "Vietcombank", type: "bank", balance: 84250000 },
  { id: "invest", name: "Đầu tư", type: "investment", balance: 35700000 },
];

export const demoCategories: Category[] = [
  { id: "salary", name: "Lương", type: "income" },
  { id: "freelance", name: "Freelance", type: "income" },
  { id: "food", name: "Ăn uống", type: "expense" },
  { id: "housing", name: "Nhà ở", type: "expense" },
  { id: "transport", name: "Di chuyển", type: "expense" },
  { id: "shopping", name: "Mua sắm", type: "expense" },
  { id: "entertainment", name: "Giải trí", type: "expense" },
  { id: "other", name: "Khác", type: "expense" },
];

export const demoTransactions: Transaction[] = [
  {
    id: "t1",
    type: "income",
    amount: 15000000,
    categoryId: "salary",
    walletId: "vcb",
    note: "Lương tháng 6",
    date: "2026-06-01",
  },
  {
    id: "t2",
    type: "income",
    amount: 3000000,
    categoryId: "freelance",
    walletId: "vcb",
    note: "Freelance Project",
    date: "2026-06-03",
  },
  {
    id: "t3",
    type: "expense",
    amount: 6250000,
    categoryId: "food",
    walletId: "cash",
    note: "Ăn uống tháng 6",
    date: "2026-06-04",
  },
  {
    id: "t4",
    type: "expense",
    amount: 4550000,
    categoryId: "housing",
    walletId: "vcb",
    note: "Nhà ở",
    date: "2026-06-05",
  },
  {
    id: "t5",
    type: "expense",
    amount: 3250000,
    categoryId: "transport",
    walletId: "cash",
    note: "Di chuyển",
    date: "2026-06-06",
  },
  {
    id: "t6",
    type: "expense",
    amount: 2600000,
    categoryId: "shopping",
    walletId: "cash",
    note: "Mua sắm",
    date: "2026-06-07",
  },
  {
    id: "t7",
    type: "expense",
    amount: 1950000,
    categoryId: "entertainment",
    walletId: "cash",
    note: "Giải trí",
    date: "2026-06-08",
  },
  {
    id: "t8",
    type: "expense",
    amount: 3050000,
    categoryId: "other",
    walletId: "vcb",
    note: "Chi phí khác",
    date: "2026-06-09",
  },
];

export const demoDebts: Debt[] = [
  {
    id: "d1",
    name: "Vay mua xe",
    totalAmount: 50000000,
    remainingAmount: 25000000,
  },
  {
    id: "d2",
    name: "Thẻ tín dụng",
    totalAmount: 10000000,
    remainingAmount: 7000000,
  },
];

export const demoGoals: Goal[] = [
  {
    id: "g1",
    name: "Mua laptop",
    targetAmount: 30000000,
    currentAmount: 12000000,
  },
  {
    id: "g2",
    name: "Quỹ khẩn cấp",
    targetAmount: 20000000,
    currentAmount: 13000000,
  },
  {
    id: "g3",
    name: "Du lịch Đà Nẵng",
    targetAmount: 10000000,
    currentAmount: 5500000,
  },
];

export const demoBudgets: Budget[] = [
  { id: "b1", categoryId: "food", month: "2026-06", limitAmount: 7000000 },
  { id: "b2", categoryId: "housing", month: "2026-06", limitAmount: 5000000 },
  { id: "b3", categoryId: "transport", month: "2026-06", limitAmount: 4000000 },
  { id: "b4", categoryId: "shopping", month: "2026-06", limitAmount: 3500000 },
];

export const demoInvestments: Investment[] = [
  {
    id: "i1",
    name: "VNINDEX ETF",
    type: "fund",
    investedAmount: 20000000,
    currentValue: 23500000,
  },
  {
    id: "i2",
    name: "Cổ phiếu FPT",
    type: "stock",
    investedAmount: 15000000,
    currentValue: 17200000,
  },
  {
    id: "i3",
    name: "Bitcoin",
    type: "crypto",
    investedAmount: 10000000,
    currentValue: 8500000,
  },
  {
    id: "i4",
    name: "Vàng SJC",
    type: "gold",
    investedAmount: 12000000,
    currentValue: 13200000,
  },
];

export type DemoFinanceData = {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  debts: Debt[];
  goals: Goal[];
  budgets: Budget[];
  investments: Investment[];
};

/**
 * Build demo data with IDs scoped to the current user.
 *
 * Supabase tables currently use `id` as the primary key. If every user seeds
 * demo rows with fixed IDs like "cash" or "t1", the second user can hit
 * duplicate-key errors. Prefixing demo IDs keeps demo data isolated per user
 * while preserving all wallet/category references inside transactions/budgets.
 */
export function buildDemoFinanceData(userId: string): DemoFinanceData {
  const id = (value: string) => `${userId}-${value}`;

  return {
    wallets: demoWallets.map((wallet) => ({ ...wallet, id: id(wallet.id) })),
    categories: demoCategories.map((category) => ({
      ...category,
      id: id(category.id),
    })),
    transactions: demoTransactions.map((transaction) => ({
      ...transaction,
      id: id(transaction.id),
      walletId: id(transaction.walletId),
      categoryId: id(transaction.categoryId),
      transferToWalletId: transaction.transferToWalletId
        ? id(transaction.transferToWalletId)
        : undefined,
    })),
    debts: demoDebts.map((debt) => ({ ...debt, id: id(debt.id) })),
    goals: demoGoals.map((goal) => ({ ...goal, id: id(goal.id) })),
    budgets: demoBudgets.map((budget) => ({
      ...budget,
      id: id(budget.id),
      categoryId: id(budget.categoryId),
    })),
    investments: demoInvestments.map((investment) => ({
      ...investment,
      id: id(investment.id),
    })),
  };
}
