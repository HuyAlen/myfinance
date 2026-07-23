import type { ForexCashTransaction } from "@/src/types/finance";
import {
  addForexCashTransaction,
  deleteForexCashTransaction,
  getForexCashTransactions,
  updateForexCashTransaction,
} from "@/src/services/finance/financeStorage";

export type ForexCashTransactionMutationResult = { error: string | null };

export const forexCashTransactionRepository = {
  list(): Promise<ForexCashTransaction[]> {
    return getForexCashTransactions();
  },
  create(
    transaction: ForexCashTransaction,
  ): Promise<ForexCashTransactionMutationResult> {
    return addForexCashTransaction(transaction);
  },
  update(
    transaction: ForexCashTransaction,
  ): Promise<ForexCashTransactionMutationResult> {
    return updateForexCashTransaction(transaction);
  },
  remove(id: string): Promise<ForexCashTransactionMutationResult> {
    return deleteForexCashTransaction(id);
  },
};
