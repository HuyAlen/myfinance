import { describe, expect, it } from "vitest";
import type {
  Category,
  ForexCashTransaction,
  Transaction,
} from "@/src/types/finance";
import {
  buildMonthlyCashFlowData,
  calculateFinanceFlowSnapshot,
  getForexCashMovementFromLedger,
  getSavingCashMovementFromLedger,
  type SavingAllocationMovement,
} from "./financeCalculations";

const categories: Category[] = [
  { id: "salary", name: "Salary", type: "income", planningGroup: "income" },
  { id: "food", name: "Food", type: "expense", planningGroup: "variable" },
  { id: "saving", name: "Saving", type: "expense", planningGroup: "saving" },
  { id: "invest", name: "Invest", type: "expense", planningGroup: "investment" },
];

function tx(
  id: string,
  type: Transaction["type"],
  amount: number,
  categoryId: string,
  date = "2026-10-01",
): Transaction {
  return { id, type, amount, categoryId, walletId: "wallet-1", note: id, date };
}

const savingMovements: SavingAllocationMovement[] = [
  { type: "deposit", amount: 5_000_000, date: "2026-10-02", walletId: "wallet-1" },
  { type: "withdraw", amount: 1_000_000, date: "2026-10-03", walletId: "wallet-1" },
  { type: "interest", amount: 300_000, date: "2026-10-04", walletId: null },
];

const forexCashTransactions: ForexCashTransaction[] = [
  {
    id: "fx-deposit",
    forexAccountId: "fx-1",
    walletId: "wallet-1",
    type: "deposit",
    amount: 10_000_000,
    fee: 100_000,
    currency: "VND",
    transactionDate: "2026-10-05",
    transactionTime: "09:00",
  },
  {
    id: "fx-withdraw",
    forexAccountId: "fx-1",
    walletId: "wallet-1",
    type: "withdrawal",
    amount: 3_000_000,
    fee: 0,
    currency: "VND",
    transactionDate: "2026-10-06",
    transactionTime: "09:00",
  },
];

describe("CASH-MOVEMENT-SSOT-1", () => {
  it("keeps realExpense/Budget semantics separate from actual wallet movement", () => {
    const flow = calculateFinanceFlowSnapshot({
      transactions: [
        tx("salary", "income", 30_000_000, "salary"),
        tx("food", "expense", 8_000_000, "food"),
      ],
      categories,
      savingMovements,
      forexCashTransactions,
      dateRange: { startDate: "2026-10-01", endDate: "2026-10-31" },
    });

    expect(flow.income).toBe(30_000_000);
    expect(flow.realExpense).toBe(8_100_000);
    expect(flow.netCashFlow).toBe(21_900_000);

    expect(flow.savingLedgerNet).toBe(4_000_000);
    expect(flow.investmentLedgerNet).toBe(7_000_000);
    expect(flow.savingAllocation).toBe(4_000_000);
    expect(flow.investmentAllocation).toBe(7_000_000);

    expect(flow.cashIn).toBe(34_000_000);
    expect(flow.cashOut).toBe(23_100_000);
    expect(flow.netCashMovement).toBe(10_900_000);
    expect(flow.netCashMovement).toBe(flow.cashIn - flow.cashOut);

    expect(flow.ordinaryCashOut).toBe(8_000_000);
    expect(flow.savingCashIn).toBe(1_000_000);
    expect(flow.savingCashOut).toBe(5_000_000);
    expect(flow.forexCashIn).toBe(3_000_000);
    expect(flow.forexCashOut).toBe(10_100_000);
  });

  it("treats Savings interest as asset growth, not fresh wallet cash", () => {
    expect(getSavingCashMovementFromLedger(savingMovements)).toEqual({
      deposits: 5_000_000,
      withdrawals: 1_000_000,
      settlements: 0,
      cashIn: 1_000_000,
      cashOut: 5_000_000,
    });
  });

  it("excludes Savings-to-Savings internal transfers from gross wallet liquidity", () => {
    const internalTransfer: SavingAllocationMovement[] = [
      {
        type: "withdraw",
        amount: 50_000_000,
        date: "2026-10-07",
        walletId: null,
      },
      {
        type: "deposit",
        amount: 50_000_000,
        date: "2026-10-07",
        walletId: null,
      },
    ];

    expect(getSavingCashMovementFromLedger(internalTransfer)).toEqual({
      deposits: 0,
      withdrawals: 0,
      settlements: 0,
      cashIn: 0,
      cashOut: 0,
    });

    const flow = calculateFinanceFlowSnapshot({
      transactions: [],
      categories,
      savingMovements: internalTransfer,
    });
    expect(flow.cashIn).toBe(0);
    expect(flow.cashOut).toBe(0);
    expect(flow.netCashMovement).toBe(0);
  });

  it("counts Forex principal and fees in liquidity without reclassifying principal as income/expense", () => {
    expect(getForexCashMovementFromLedger(forexCashTransactions)).toEqual({
      deposits: 10_000_000,
      withdrawals: 3_000_000,
      fees: 100_000,
      cashIn: 3_000_000,
      cashOut: 10_100_000,
    });
  });

  it("uses the net wallet receipt for a Forex withdrawal fee instead of inflating both gross bars", () => {
    const withdrawalWithFee: ForexCashTransaction[] = [
      {
        id: "fx-withdraw-fee",
        forexAccountId: "fx-1",
        walletId: "wallet-1",
        type: "withdrawal",
        amount: 10_000_000,
        fee: 100_000,
        currency: "VND",
        transactionDate: "2026-10-08",
        transactionTime: "09:00",
      },
    ];

    expect(getForexCashMovementFromLedger(withdrawalWithFee)).toEqual({
      deposits: 0,
      withdrawals: 10_000_000,
      fees: 100_000,
      cashIn: 9_900_000,
      cashOut: 0,
    });

    const flow = calculateFinanceFlowSnapshot({
      transactions: [],
      categories,
      forexCashTransactions: withdrawalWithFee,
    });
    expect(flow.cashIn).toBe(9_900_000);
    expect(flow.cashOut).toBe(0);
    expect(flow.netCashMovement).toBe(9_900_000);
    expect(flow.realExpense).toBe(100_000);
  });

  it("keeps legacy allocation transactions as cash out without turning them into realExpense", () => {
    const flow = calculateFinanceFlowSnapshot({
      transactions: [
        tx("manual-saving", "expense", 1_000_000, "saving"),
        tx("manual-investment", "investment", 2_000_000, "invest"),
      ],
      categories,
    });

    expect(flow.realExpense).toBe(0);
    expect(flow.cashOut).toBe(3_000_000);
    expect(flow.transactionSavingAllocation).toBe(1_000_000);
    expect(flow.transactionInvestmentAllocation).toBe(2_000_000);
  });

  it("builds monthly financial and liquidity views from the same SSOT", () => {
    const october = buildMonthlyCashFlowData({
      transactions: [
        tx("salary", "income", 30_000_000, "salary"),
        tx("food", "expense", 8_000_000, "food"),
      ],
      categories,
      savingMovements,
      forexCashTransactions,
      months: 12,
      selectedYear: 2026,
    }).find((row) => row.month === "2026-10");

    expect(october).toBeDefined();
    expect(october?.thu).toBe(30_000_000);
    expect(october?.chi).toBe(8_100_000);
    expect(october?.cashIn).toBe(34_000_000);
    expect(october?.cashOut).toBe(23_100_000);
    expect(october?.netCashMovement).toBe(10_900_000);
  });
});
