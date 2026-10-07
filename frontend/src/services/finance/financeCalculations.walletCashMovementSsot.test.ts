import { describe, expect, it } from "vitest";
import type { Category, ForexCashTransaction, Transaction } from "@/src/types/finance";
import type { SavingAllocationMovement } from "./financeCalculations";
import * as financeCalculations from "./financeCalculations";

const categories: Category[] = [
  { id: "salary", name: "Salary", type: "income", planningGroup: "income" },
  { id: "food", name: "Food", type: "expense", planningGroup: "variable" },
];

type WalletCashMovementFn = (input: {
  transactions: Transaction[];
  categories?: Category[];
  savingMovements?: SavingAllocationMovement[];
  forexCashTransactions?: ForexCashTransaction[];
  transferIn?: number;
  transferOut?: number;
}) => {
  cashIn: number;
  cashOut: number;
  netCashMovement: number;
  transferIn: number;
  transferOut: number;
};

function getCalculator() {
  return (financeCalculations as typeof financeCalculations & {
    calculateWalletCashMovementSnapshot?: WalletCashMovementFn;
  }).calculateWalletCashMovementSnapshot;
}

function tx(
  id: string,
  type: Transaction["type"],
  amount: number,
  categoryId: string,
): Transaction {
  return {
    id,
    type,
    amount,
    categoryId,
    walletId: "wallet-1",
    note: id,
    date: "2026-10-07",
  };
}

describe("WALLETS-CASH-MOVEMENT-SSOT-1 calculator", () => {
  it("combines canonical operating/capital movement with per-wallet internal transfers", () => {
    const calculate = getCalculator();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;

    const result = calculate({
      transactions: [
        tx("salary", "income", 5_000_000, "salary"),
        tx("food", "expense", 1_000_000, "food"),
      ],
      categories,
      savingMovements: [
        { type: "deposit", amount: 2_000_000, date: "2026-10-07", walletId: "wallet-1" },
        { type: "withdraw", amount: 500_000, date: "2026-10-07", walletId: "wallet-1" },
      ],
      forexCashTransactions: [
        {
          id: "fx-deposit",
          forexAccountId: "fx-1",
          walletId: "wallet-1",
          type: "deposit",
          amount: 1_000_000,
          fee: 100_000,
          currency: "VND",
          transactionDate: "2026-10-07",
          transactionTime: "09:00",
        },
      ],
      transferIn: 3_000_000,
      transferOut: 1_000_000,
    });

    expect(result).toEqual({
      cashIn: 8_500_000,
      cashOut: 5_100_000,
      netCashMovement: 3_400_000,
      transferIn: 3_000_000,
      transferOut: 1_000_000,
    });
  });

  it("counts a Savings ledger movement once even when a mirrored transfer row exists", () => {
    const calculate = getCalculator();
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;

    const savingMirror = {
      ...tx("saving-mirror", "transfer", 2_000_000, ""),
      transferReferenceType: "saving",
      sourceType: "wallet",
      destinationType: "saving",
    } as Transaction;

    const result = calculate({
      transactions: [savingMirror],
      categories,
      savingMovements: [
        { type: "deposit", amount: 2_000_000, date: "2026-10-07", walletId: "wallet-1" },
      ],
    });

    expect(result.cashIn).toBe(0);
    expect(result.cashOut).toBe(2_000_000);
    expect(result.netCashMovement).toBe(-2_000_000);
  });
});
