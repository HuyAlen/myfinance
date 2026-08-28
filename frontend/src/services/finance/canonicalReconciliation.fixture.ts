import type {
  Budget,
  Category,
  Debt,
  ForexAccount,
  ForexCashTransaction,
  Goal,
  Investment,
  SavingAccount,
  Transaction,
  Wallet,
} from "@/src/types/finance";
import type { SavingAllocationMovement } from "./financeCalculations";

/**
 * CROSSPAGE-REGRESSION-1 canonical reconciliation fixture.
 *
 * One deliberately mixed financial snapshot used by every reconciliation
 * assertion. It covers current assets, debt, real expense, legacy/manual
 * allocation, Savings/Forex engine allocation, Goal funding and Budget spend.
 * Keep this fixture small and deterministic: when a business rule changes,
 * update the canonical expectation here first, then let every consumer prove
 * that it still reconciles to the same numbers.
 */
export const reconciliationPeriod = {
  startDate: "2026-08-01",
  endDate: "2026-08-31",
} as const;

export const reconciliationWallets: Wallet[] = [
  { id: "wallet-cash", name: "Cash", type: "cash", balance: 5_000_000 },
  { id: "wallet-bank", name: "Bank", type: "bank", balance: 6_000_000 },
  {
    id: "wallet-broker-cash",
    name: "Broker cash",
    type: "investment",
    balance: 2_000_000,
  },
];

export const reconciliationSavings: SavingAccount[] = [
  {
    id: "saving-emergency",
    name: "Quỹ khẩn cấp",
    type: "emergency_fund",
    balance: 5_000_000,
    targetAmount: 10_000_000,
  },
];

export const reconciliationInvestments: Investment[] = [
  {
    id: "investment-fpt",
    name: "FPT",
    symbol: "FPT",
    type: "stock",
    investedAmount: 3_000_000,
    currentValue: 4_000_000,
  },
  {
    id: "investment-etf",
    name: "VN30 ETF",
    symbol: "E1VFVN30",
    type: "fund",
    investedAmount: 3_500_000,
    currentValue: 4_000_000,
  },
];

export const reconciliationForexAccounts: ForexAccount[] = [
  {
    id: "forex-main",
    name: "Forex Main",
    broker: "Broker",
    currency: "USD",
    status: "active",
    currentEquity: 4_000_000,
  },
];

export const reconciliationForexCashTransactions: ForexCashTransaction[] = [
  {
    id: "forex-deposit",
    forexAccountId: "forex-main",
    walletId: "wallet-bank",
    type: "deposit",
    amount: 2_000_000,
    fee: 200_000,
    currency: "VND",
    transactionDate: "2026-08-12",
    transactionTime: "09:00",
  },
  {
    id: "forex-withdrawal",
    forexAccountId: "forex-main",
    walletId: "wallet-bank",
    type: "withdrawal",
    amount: 500_000,
    fee: 100_000,
    currency: "VND",
    transactionDate: "2026-08-20",
    transactionTime: "10:00",
  },
];

export const reconciliationDebts: Debt[] = [
  {
    id: "debt-home",
    name: "Home loan",
    totalAmount: 10_000_000,
    remainingAmount: 6_000_000,
  },
];

export const reconciliationCategories: Category[] = [
  {
    id: "category-income",
    name: "Lương",
    type: "income",
    planningGroup: "income",
  },
  {
    id: "category-rent",
    name: "Nhà ở",
    type: "expense",
    planningGroup: "fixed",
  },
  {
    id: "category-food",
    name: "Ăn uống",
    type: "expense",
    planningGroup: "variable",
  },
  {
    id: "category-saving",
    name: "Quỹ khẩn cấp",
    type: "expense",
    planningGroup: "saving",
  },
  {
    id: "category-investment",
    name: "Đầu tư",
    type: "expense",
    planningGroup: "investment",
  },
];

export const reconciliationTransactions: Transaction[] = [
  {
    id: "transaction-income",
    type: "income",
    amount: 20_000_000,
    categoryId: "category-income",
    walletId: "wallet-bank",
    note: "Salary",
    date: "2026-08-01",
  },
  {
    id: "transaction-rent",
    type: "expense",
    amount: 5_000_000,
    categoryId: "category-rent",
    walletId: "wallet-bank",
    note: "Rent",
    date: "2026-08-03",
  },
  {
    id: "transaction-food",
    type: "expense",
    amount: 4_000_000,
    categoryId: "category-food",
    walletId: "wallet-cash",
    note: "Food",
    date: "2026-08-08",
  },
  {
    id: "transaction-legacy-saving",
    type: "expense",
    amount: 1_000_000,
    categoryId: "category-saving",
    walletId: "wallet-bank",
    note: "Legacy saving allocation",
    date: "2026-08-10",
  },
  {
    id: "transaction-legacy-investment",
    type: "investment",
    amount: 2_000_000,
    categoryId: "category-investment",
    walletId: "wallet-bank",
    note: "Legacy investment allocation",
    date: "2026-08-11",
  },
  {
    id: "transaction-transfer",
    type: "transfer",
    amount: 3_000_000,
    categoryId: "category-food",
    walletId: "wallet-bank",
    transferToWalletId: "wallet-cash",
    note: "Internal transfer",
    date: "2026-08-15",
  },
];

export const reconciliationSavingMovements: SavingAllocationMovement[] = [
  { type: "deposit", amount: 3_000_000, date: "2026-08-10" },
  { type: "withdraw", amount: 1_000_000, date: "2026-08-18" },
  // Interest changes account value, but it is not fresh user allocation.
  { type: "interest", amount: 500_000, date: "2026-08-25" },
];

export const reconciliationGoals: Goal[] = [
  {
    id: "goal-emergency",
    name: "Quỹ khẩn cấp",
    targetAmount: 10_000_000,
    currentAmount: 1_000_000,
    linkedSavingIds: ["saving-emergency"],
  },
];

export const reconciliationBudgets: Budget[] = [
  {
    id: "budget-rent",
    categoryId: "category-rent",
    month: "2026-08",
    limitAmount: 5_500_000,
  },
  {
    id: "budget-food",
    categoryId: "category-food",
    month: "2026-08",
    limitAmount: 5_000_000,
  },
];

export const reconciliationExpected = {
  income: 20_000_000,
  realExpense: 9_000_000,
  realExpenseCount: 2,
  savingAllocation: 3_000_000,
  investmentAllocation: 3_800_000,
  futureAllocation: 6_800_000,
  futureAllocationRate: 34,
  budgetCoveredExpense: 9_000_000,
  goalEffectiveAmount: 6_000_000,
  goalProgressPercent: 60,
  walletAssets: 13_000_000,
  savingsAssets: 5_000_000,
  portfolioAssets: 8_000_000,
  forexAssets: 4_000_000,
  investmentDomainValue: 12_000_000,
  totalAssets: 30_000_000,
  totalDebt: 6_000_000,
  netWorth: 24_000_000,
  debtRatio: 20,
} as const;
