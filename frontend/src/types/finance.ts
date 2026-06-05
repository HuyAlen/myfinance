export type TransactionType = "income" | "expense";

export type WalletType = "cash" | "bank" | "ewallet" | "investment";

export type CategoryType = "income" | "expense";

export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  balance: number;
};

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
};

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  walletId: string;
  note: string;
  date: string;
};

export type Debt = {
  id: string;
  name: string;
  totalAmount: number;
  remainingAmount: number;
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
};

export type Budget = {
  id: string;
  categoryId: string;
  month: string;
  limitAmount: number;
};

export type InvestmentType = "stock" | "crypto" | "fund" | "gold" | "other";

export type Investment = {
  id: string;
  name: string;
  type: InvestmentType;
  symbol?: string;
  investedAmount: number;
  currentValue: number;
  purchaseDate?: string;
  notes?: string;
};
