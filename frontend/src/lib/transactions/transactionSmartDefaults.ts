import type { Transaction } from "@/src/types/finance";
import {
  isInternalTransferTransaction,
  isSavingsManagedTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";

export type TransactionSmartDefaultsMode = "income" | "expense";
export type TransactionSmartDefaultsMatchKind = "note" | "category";

export type TransactionSmartDefaultsSuggestion = {
  matchKind: TransactionSmartDefaultsMatchKind;
  matchCount: number;
  sourceTransactionId: string;
  sourceDate: string;
  amount: number;
  categoryId: string;
  walletId: string;
};

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getLocalCalendarDate(transaction: Transaction) {
  return String(transaction.date ?? "").trim().slice(0, 10);
}

function normalizeContextNote(value: string) {
  return normalizeTransactionNote(value).replace(/\s+/g, " ").trim();
}

function hasRecurringMetadata(transaction: Transaction) {
  return Boolean(
    transaction.isRecurring || transaction.recurrence || transaction.nextRunDate,
  );
}

function isNewerTransaction(candidate: Transaction, current: Transaction) {
  const candidateDate = getLocalCalendarDate(candidate);
  const currentDate = getLocalCalendarDate(current);
  if (candidateDate !== currentDate) return candidateDate > currentDate;
  return String(candidate.id).localeCompare(String(current.id)) > 0;
}

function pickNewest(transactions: Transaction[]) {
  let newest: Transaction | null = null;
  for (const transaction of transactions) {
    if (!newest || isNewerTransaction(transaction, newest)) {
      newest = transaction;
    }
  }
  return newest;
}

function isEligibleHistoryTransaction(input: {
  transaction: Transaction;
  mode: TransactionSmartDefaultsMode;
  validCategoryIds: Set<string>;
  validWalletIds: Set<string>;
}) {
  const { transaction, mode, validCategoryIds, validWalletIds } = input;

  if (transaction.type !== mode) return false;
  if (isInternalTransferTransaction(transaction)) return false;
  if (isSavingsManagedTransaction(transaction)) return false;
  if (hasRecurringMetadata(transaction)) return false;
  if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
    return false;
  }

  const categoryId = cleanId(transaction.categoryId);
  const walletId = cleanId(transaction.walletId);
  return validCategoryIds.has(categoryId) && validWalletIds.has(walletId);
}

function toSuggestion(
  source: Transaction,
  matchKind: TransactionSmartDefaultsMatchKind,
  matchCount: number,
): TransactionSmartDefaultsSuggestion {
  return {
    matchKind,
    matchCount,
    sourceTransactionId: String(source.id),
    sourceDate: getLocalCalendarDate(source),
    amount: source.amount,
    categoryId: cleanId(source.categoryId),
    walletId: cleanId(source.walletId),
  };
}

/**
 * TRANSACTION-SMART-DEFAULTS-1
 *
 * Derives one advisory create-form suggestion from the transaction ledger that
 * is already loaded by TransactionsPage. Nothing is persisted and nothing is
 * auto-applied. Exact normalized note history is the strongest signal. If the
 * typed note is new, the currently selected category may fall back to its most
 * recent history only after at least two valid examples, avoiding a one-off
 * category guess.
 */
export function buildTransactionSmartDefaultsSuggestion(input: {
  transactions: Transaction[];
  mode: TransactionSmartDefaultsMode;
  note: string;
  categoryId: string;
  validCategoryIds: string[];
  validWalletIds: string[];
}): TransactionSmartDefaultsSuggestion | null {
  const normalizedNote = normalizeContextNote(input.note);
  if (normalizedNote.length < 2 || normalizedNote === "giao dich moi") {
    return null;
  }

  const validCategoryIds = new Set(
    input.validCategoryIds.map(cleanId).filter(Boolean),
  );
  const validWalletIds = new Set(input.validWalletIds.map(cleanId).filter(Boolean));

  const eligible = input.transactions.filter((transaction) =>
    isEligibleHistoryTransaction({
      transaction,
      mode: input.mode,
      validCategoryIds,
      validWalletIds,
    }),
  );

  const exactNoteMatches = eligible.filter(
    (transaction) =>
      normalizeContextNote(transaction.note ?? "") === normalizedNote,
  );
  if (exactNoteMatches.length > 0) {
    const newest = pickNewest(exactNoteMatches);
    return newest
      ? toSuggestion(newest, "note", exactNoteMatches.length)
      : null;
  }

  const categoryId = cleanId(input.categoryId);
  if (!categoryId || !validCategoryIds.has(categoryId)) return null;

  const categoryMatches = eligible.filter(
    (transaction) => cleanId(transaction.categoryId) === categoryId,
  );
  if (categoryMatches.length < 2) return null;

  const newest = pickNewest(categoryMatches);
  return newest ? toSuggestion(newest, "category", categoryMatches.length) : null;
}