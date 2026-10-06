import { describe, expect, it } from "vitest";
import type {
  Category,
  ForexCashTransaction,
  Transaction,
} from "@/src/types/finance";
import {
  calculateFinanceFlowSnapshot,
  getForexFeesFromLedger,
  getNetInvestmentAllocationFromLedger,
  getNetSavingAllocationFromLedger,
  getPortfolioInvestmentCapitalMovementSnapshot,
  getRealExpenseTransactions,
  type SavingAllocationMovement,
} from "./financeCalculations";

function transaction(
  id: string,
  type: Transaction["type"],
  amount: number,
  categoryId: string,
  date = "2026-08-15",
): Transaction {
  return {
    id,
    type,
    amount,
    categoryId,
    walletId: "wallet-1",
    note: id,
    date,
  };
}

const categories: Category[] = [
  {
    id: "income",
    name: "Luong",
    type: "income",
    planningGroup: "income",
  },
  {
    id: "food",
    name: "An uong",
    type: "expense",
    planningGroup: "variable",
  },
  {
    id: "saving",
    name: "Quy khan cap",
    type: "expense",
    planningGroup: "saving",
  },
  {
    id: "investment",
    name: "Dau tu",
    type: "expense",
    planningGroup: "investment",
  },
];

const savingMovements: SavingAllocationMovement[] = [
  { type: "deposit", amount: 3_000_000, date: "2026-08-10" },
  { type: "withdraw", amount: 1_000_000, date: "2026-08-20" },
  // Interest grows the asset but is not fresh user capital allocation.
  { type: "interest", amount: 500_000, date: "2026-08-25" },
  { type: "deposit", amount: 9_000_000, date: "2026-07-31" },
];

const forexTransactions: ForexCashTransaction[] = [
  {
    id: "fx-deposit",
    forexAccountId: "fx-1",
    walletId: "wallet-1",
    type: "deposit",
    amount: 2_000_000,
    fee: 100_000,
    currency: "VND",
    transactionDate: "2026-08-11",
    transactionTime: "09:00",
  },
  {
    id: "fx-withdraw",
    forexAccountId: "fx-1",
    walletId: "wallet-1",
    type: "withdrawal",
    amount: 500_000,
    fee: 50_000,
    currency: "VND",
    transactionDate: "2026-08-21",
    transactionTime: "09:00",
  },
  {
    id: "fx-old",
    forexAccountId: "fx-1",
    walletId: "wallet-1",
    type: "deposit",
    amount: 8_000_000,
    fee: 0,
    currency: "VND",
    transactionDate: "2026-07-31",
    transactionTime: "09:00",
  },
];

describe("FINANCE-FLOW-SSOT-1 canonical flow snapshot", () => {
  const transactions: Transaction[] = [
    transaction("income", "income", 10_000_000, "income"),
    transaction("expense", "expense", 2_000_000, "food"),
    // Manual/legacy allocations remain valid and are additive to engine ledgers.
    transaction("manual-saving", "expense", 1_000_000, "saving"),
    transaction("manual-investment", "investment", 1_500_000, "investment"),
    transaction("transfer", "transfer", 4_000_000, "food"),
    transaction("old-expense", "expense", 7_000_000, "food", "2026-07-31"),
  ];

  it("uses one real-expense collection for both amount and count", () => {
    const real = getRealExpenseTransactions(transactions, categories);
    expect(real.map((item) => item.id)).toEqual(["expense", "old-expense"]);

    const flow = calculateFinanceFlowSnapshot({
      transactions,
      categories,
      dateRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
    });
    expect(flow.realExpense).toBe(2_000_000);
    expect(flow.realExpenseCount).toBe(1);
  });

  it("combines legacy/manual allocation with authoritative Savings and Forex ledgers", () => {
    const flow = calculateFinanceFlowSnapshot({
      transactions,
      categories,
      savingMovements,
      forexCashTransactions: forexTransactions,
      dateRange: { startDate: "2026-08-01", endDate: "2026-08-31" },
    });

    expect(flow.income).toBe(10_000_000);
    expect(flow.realExpense).toBe(2_150_000);
    expect(flow.realExpenseCount).toBe(3);
    expect(flow.forexFees).toBe(150_000);
    expect(flow.netCashFlow).toBe(7_850_000);

    expect(flow.transactionSavingAllocation).toBe(1_000_000);
    expect(flow.savingLedgerNet).toBe(2_000_000);
    expect(flow.savingAllocation).toBe(3_000_000);

    expect(flow.transactionInvestmentAllocation).toBe(1_500_000);
    // Investment allocation is broker funding only; transfer fees are real expense.
    expect(flow.investmentLedgerNet).toBe(1_500_000);
    expect(flow.investmentAllocation).toBe(3_000_000);
    expect(flow.futureAllocation).toBe(6_000_000);
    expect(flow.futureAllocationRate).toBe(60);
  });

  it("ignores Savings interest and respects exact date boundaries", () => {
    expect(
      getNetSavingAllocationFromLedger(savingMovements, {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ).toBe(2_000_000);

    expect(
      getNetSavingAllocationFromLedger(savingMovements, {
        startDate: "2026-08-25",
        endDate: "2026-08-25",
      }),
    ).toBe(0);
  });

  it("keeps Forex fees out of investment allocation and reports them separately", () => {
    const range = { startDate: "2026-08-01", endDate: "2026-08-31" };

    expect(getNetInvestmentAllocationFromLedger(forexTransactions, range)).toBe(
      1_500_000,
    );
    expect(getForexFeesFromLedger(forexTransactions, range)).toBe(150_000);
  });

  it("includes atomic Portfolio capital movements in investment allocation and Wallet cash movement", () => {
    const portfolioMovements: Transaction[] = [
      {
        id: "portfolio-deposit",
        type: "transfer",
        amount: 2_000_000,
        categoryId: "",
        walletId: "wallet-1",
        note: "Nạp vốn ETF",
        date: "2026-08-12",
        transferReference: "investment-etf",
        transferReferenceType: "investment",
        sourceType: "wallet",
        destinationType: "investment",
      },
      {
        id: "portfolio-withdraw",
        type: "transfer",
        amount: 500_000,
        categoryId: "",
        walletId: "wallet-1",
        note: "Rút vốn ETF",
        date: "2026-08-20",
        transferReference: "investment-etf",
        transferReferenceType: "investment",
        sourceType: "investment",
        destinationType: "wallet",
      },
    ];

    expect(
      getPortfolioInvestmentCapitalMovementSnapshot(portfolioMovements),
    ).toEqual({
      deposits: 2_000_000,
      withdrawals: 500_000,
      net: 1_500_000,
      cashIn: 500_000,
      cashOut: 2_000_000,
    });

    const flow = calculateFinanceFlowSnapshot({
      transactions: portfolioMovements,
      categories,
    });

    expect(flow.forexInvestmentLedgerNet).toBe(0);
    expect(flow.portfolioInvestmentLedgerNet).toBe(1_500_000);
    expect(flow.investmentLedgerNet).toBe(1_500_000);
    expect(flow.investmentAllocation).toBe(1_500_000);
    expect(flow.portfolioInvestmentCashIn).toBe(500_000);
    expect(flow.portfolioInvestmentCashOut).toBe(2_000_000);
    expect(flow.capitalMovementIn).toBe(500_000);
    expect(flow.capitalMovementOut).toBe(2_000_000);
    expect(flow.cashIn).toBe(500_000);
    expect(flow.cashOut).toBe(2_000_000);
    expect(flow.operatingNetCashFlow).toBe(0);
  });

  it("clamps a net de-allocation to zero without hiding its signed ledger movement", () => {
    const flow = calculateFinanceFlowSnapshot({
      transactions: [],
      categories,
      savingMovements: [
        { type: "withdraw", amount: 5_000_000, date: "2026-08-01" },
      ],
      forexCashTransactions: [
        {
          id: "fx-withdraw-only",
          forexAccountId: "fx-1",
          walletId: "wallet-1",
          type: "withdrawal",
          amount: 2_000_000,
          fee: 0,
          currency: "VND",
          transactionDate: "2026-08-01",
          transactionTime: "09:00",
        },
      ],
    });

    expect(flow.savingLedgerNet).toBe(-5_000_000);
    expect(flow.investmentLedgerNet).toBe(-2_000_000);
    expect(flow.savingAllocation).toBe(0);
    expect(flow.investmentAllocation).toBe(0);
    expect(flow.futureAllocation).toBe(0);
  });

  it("keeps gross Savings and Forex period activity visible when the signed allocation is negative", () => {
    const flow = calculateFinanceFlowSnapshot({
      transactions: [],
      categories,
      savingMovements: [
        {
          type: "deposit",
          amount: 11_189_116,
          date: "2026-10-06",
          walletId: "wallet-a",
        },
        {
          type: "withdraw",
          amount: 11_969_402,
          date: "2026-10-05",
          walletId: "wallet-b",
        },
        // Internal Savings-to-Savings rows must never inflate gross period activity.
        {
          type: "withdraw",
          amount: 500_000,
          date: "2026-10-02",
          walletId: null,
        },
        {
          type: "deposit",
          amount: 500_000,
          date: "2026-10-02",
          walletId: null,
        },
      ],
      forexCashTransactions: [
        {
          id: "fx-withdraw-1",
          forexAccountId: "fx-1",
          walletId: "wallet-a",
          type: "withdrawal",
          amount: 593_848,
          fee: 0,
          currency: "VND",
          transactionDate: "2026-10-02",
          transactionTime: "04:21",
        },
        {
          id: "fx-withdraw-2",
          forexAccountId: "fx-1",
          walletId: "wallet-a",
          type: "withdrawal",
          amount: 1_107_265,
          fee: 0,
          currency: "VND",
          transactionDate: "2026-10-01",
          transactionTime: "09:14",
        },
      ],
      dateRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });

    // Existing positive-net compatibility fields remain clamped at zero.
    expect(flow.savingAllocation).toBe(0);
    expect(flow.investmentAllocation).toBe(0);
    expect(flow.futureAllocation).toBe(0);

    // Financial Structure consumes gross period activity plus signed net.
    expect(flow.savingContribution).toBe(11_189_116);
    expect(flow.savingWithdrawal).toBe(11_969_402);
    expect(flow.savingNetAllocation).toBe(-780_286);
    expect(flow.investmentContribution).toBe(0);
    expect(flow.investmentWithdrawal).toBe(1_701_113);
    expect(flow.investmentNetAllocation).toBe(-1_701_113);
    expect(flow.futureContribution).toBe(11_189_116);
    expect(flow.futureWithdrawal).toBe(13_670_515);
    expect(flow.futureNetAllocation).toBe(-2_481_399);

    expect(flow.capitalMovementOut).toBe(flow.futureContribution);
    expect(flow.capitalMovementIn).toBe(flow.futureWithdrawal);
    expect(flow.netCapitalMovement).toBe(-flow.futureNetAllocation);
  });
});
