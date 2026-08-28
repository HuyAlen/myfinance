import { describe, expect, it } from "vitest";
import type {
  Category,
  ForexCashTransaction,
  Transaction,
} from "@/src/types/finance";
import {
  calculateFinanceFlowSnapshot,
  getNetInvestmentAllocationFromLedger,
  getNetSavingAllocationFromLedger,
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
    expect(flow.realExpense).toBe(2_000_000);
    expect(flow.netCashFlow).toBe(8_000_000);

    expect(flow.transactionSavingAllocation).toBe(1_000_000);
    expect(flow.savingLedgerNet).toBe(2_000_000);
    expect(flow.savingAllocation).toBe(3_000_000);

    expect(flow.transactionInvestmentAllocation).toBe(1_500_000);
    // Deposit consumes 2.1M cash; withdrawal returns 0.45M after its fee.
    expect(flow.investmentLedgerNet).toBe(1_650_000);
    expect(flow.investmentAllocation).toBe(3_150_000);
    expect(flow.futureAllocation).toBe(6_150_000);
    expect(flow.futureAllocationRate).toBe(61.5);
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

  it("uses wallet-cash commitment semantics for Forex fees", () => {
    expect(
      getNetInvestmentAllocationFromLedger(forexTransactions, {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      }),
    ).toBe(1_650_000);
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
});
