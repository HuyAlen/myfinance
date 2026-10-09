import { describe, expect, it } from "vitest";
import type { Category, ForexCashTransaction, Transaction } from "@/src/types/finance";
import type { SavingAllocationMovement } from "@/src/services/finance/financeCalculations";
import {
  isOrdinaryTransactionFeedRow,
  scopeWalletCashMovementTransactions,
  summarizeTransactionWalletCashMovement,
} from "./transactionCashMovementCards";

const categories: Category[] = [
  { id: "income", name: "Salary", type: "income", planningGroup: "income" },
  { id: "expense", name: "Food", type: "expense", planningGroup: "variable" },
];
const range = { startDate: "2026-10-01", endDate: "2026-10-31" };
const tx = (
  id: string,
  type: Transaction["type"],
  amount: number,
  extras: Partial<Transaction> = {},
): Transaction => ({
  id,
  type,
  amount,
  date: "2026-10-08",
  categoryId: type === "income" ? "income" : "expense",
  walletId: "wallet-1",
  note: id,
  ...extras,
});
const transactions: Transaction[] = [
  tx("salary", "income", 1_000),
  tx("food", "expense", 200),
  tx("portfolio-deposit", "transfer", 300, {
    categoryId: "",
    transferReference: "investment-1",
    transferReferenceType: "investment",
    sourceType: "wallet",
    destinationType: "investment",
  }),
  tx("portfolio-withdraw", "transfer", 80, {
    categoryId: "",
    transferReference: "investment-1",
    transferReferenceType: "investment",
    sourceType: "investment",
    destinationType: "wallet",
  }),
  tx("savings-mirror", "transfer", 400, {
    categoryId: "",
    transferReferenceType: "saving",
    sourceType: "wallet",
    destinationType: "saving",
  }),
  tx("ordinary-transfer", "transfer", 50, { transferToWalletId: "wallet-2" }),
];
const savingMovements: SavingAllocationMovement[] = [
  { type: "deposit", amount: 400, walletId: "wallet-1", date: "2026-10-08" },
  { type: "withdraw", amount: 100, walletId: "wallet-1", date: "2026-10-08" },
  { type: "interest", amount: 15, walletId: null, date: "2026-10-08" },
  { type: "deposit", amount: 999, walletId: null, date: "2026-10-08" },
  { type: "withdraw", amount: 999, walletId: null, date: "2026-10-08" },
];
const forexCashTransactions: ForexCashTransaction[] = [
  {
    id: "forex-deposit", forexAccountId: "forex-1", walletId: "wallet-1",
    type: "deposit", amount: 200, fee: 10, currency: "VND",
    transactionDate: "2026-10-08", transactionTime: "09:00",
  },
  {
    id: "forex-withdraw", forexAccountId: "forex-1", walletId: "wallet-1",
    type: "withdrawal", amount: 70, fee: 5, currency: "VND",
    transactionDate: "2026-10-08", transactionTime: "10:00",
  },
];

function summarize(overrides: Partial<Parameters<typeof summarizeTransactionWalletCashMovement>[0]> = {}) {
  return summarizeTransactionWalletCashMovement({
    transactions,
    categories,
    savingMovements,
    forexCashTransactions,
    scope: { effectiveRange: range },
    ...overrides,
  });
}

describe("TRANSACTIONS-CASH-MOVEMENT-CARDS-1", () => {
  it("counts actual wallet cash in/out across ordinary, Portfolio, Savings and Forex ledgers exactly once", () => {
    const flow = summarize();
    expect(flow.ordinaryCashIn).toBe(1_000);
    expect(flow.ordinaryCashOut).toBe(200);
    expect(flow.portfolioInvestmentCashIn).toBe(80);
    expect(flow.portfolioInvestmentCashOut).toBe(300);
    expect(flow.savingCashIn).toBe(100);
    expect(flow.savingCashOut).toBe(400);
    expect(flow.forexCashIn).toBe(65); // Withdrawal fee netted once
    expect(flow.forexCashOut).toBe(210); // Deposit fee included once
    expect(flow.cashIn).toBe(1_245);
    expect(flow.cashOut).toBe(1_110);
    expect(flow.netCashMovement).toBe(135);
  });

  it("never turns principal transfers into income or real expenses", () => {
    const flow = summarize();
    expect(flow.income).toBe(1_000);
    expect(flow.realExpense).toBe(215); // Ordinary expense plus Forex fees
    expect(flow.operatingNetCashFlow).toBe(785);
    expect(flow.netCashMovement).not.toBe(flow.operatingNetCashFlow);
  });

  it("hides managed investment/savings transfer mirrors but keeps genuine wallet transfers", () => {
    expect(transactions.filter(isOrdinaryTransactionFeedRow).map((item) => item.id))
      .toEqual(["salary", "food", "ordinary-transfer"]);
    const flow = summarize();
    expect(flow.capitalMovementOut).toBeGreaterThan(0);
    expect(flow.cashOut).toBe(1_110);
  });

  it("scopes all ledgers to wallet and local date without affecting original data", () => {
    const flow = summarize({
      transactions: [
        ...transactions,
        tx("other-wallet-income", "income", 1_000_000, { walletId: "wallet-2" }),
        tx("old-income", "income", 1_000_000, { date: "2026-09-30" }),
      ],
      savingMovements: [
        ...savingMovements,
        { type: "deposit", amount: 1_000_000, walletId: "wallet-2", date: "2026-10-08" },
      ],
      forexCashTransactions: [
        ...forexCashTransactions,
        { ...forexCashTransactions[0], id: "other", amount: 1_000_000, walletId: "wallet-2" },
      ],
      scope: {
        effectiveRange: range, walletId: "wallet-1", dateFrom: "2026-10-08", dateTo: "2026-10-08",
      },
    });
    expect(flow.cashIn).toBe(1_245);
    expect(flow.cashOut).toBe(1_110);
  });

  it("uses date intersection; an empty intersection yields zero, not another period", () => {
    const flow = summarize({
      scope: { effectiveRange: range, dateFrom: "2026-11-01" },
    });
    expect(flow.cashIn).toBe(0);
    expect(flow.cashOut).toBe(0);
    expect(flow.netCashMovement).toBe(0);
  });

  it("includes wallet transfers for turnover scope without counting them as wallet inflow/outflow", () => {
    const selection = scopeWalletCashMovementTransactions(transactions, {
      effectiveRange: range, walletId: "wallet-2",
    });
    expect(selection.map((item) => item.id)).toEqual(["ordinary-transfer"]);
    const flow = summarize({ scope: { effectiveRange: range, walletId: "wallet-2" } });
    expect(flow.cashIn).toBe(0);
    expect(flow.cashOut).toBe(0);
  });

  it("ignores text-based transfer guesses for real income and expenses", () => {
    const flow = summarize({
      transactions: [
        tx("income-ATM", "income", 50, { note: "Withdraw at ATM" }),
        tx("expense-transfer", "expense", 20, { note: "Internal transfer payment" }),
      ],
      savingMovements: [],
      forexCashTransactions: [],
    });
    expect(flow.cashIn).toBe(50);
    expect(flow.cashOut).toBe(20);
  });

  it("keeps all input arrays untouched", () => {
    const before = transactions.map((item) => item.id);
    summarize();
    expect(transactions.map((item) => item.id)).toEqual(before);
  });
});
