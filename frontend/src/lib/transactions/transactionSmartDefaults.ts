import type { Transaction } from "@/src/types/finance";
import {
  isInternalTransferTransaction,
  isSavingsManagedTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";

export type TransactionSmartDefaultsMode = "income" | "expense";

export type TransactionSmartDefaultsSuggestion = {
  matchKind: "note";
  matchCount: number;
  sourceTransactionId: string;
  sourceDate: string;
  categoryId: string;
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
}) {
  const { transaction, mode, validCategoryIds } = input;
  if (transaction.type !== mode) return false;
  if (isInternalTransferTransaction(transaction)) return false;
  if (isSavingsManagedTransaction(transaction)) return false;
  if (hasRecurringMetadata(transaction)) return false;
  return validCategoryIds.has(cleanId(transaction.categoryId));
}

/**
 * TRANSACTION-CATEGORY-ONLY-SUGGESTIONS-1
 * A create-only, advisory CATEGORY suggestion based on matching normalized
 * notes. Historical transaction amounts and wallets are never accessed,
 * returned, displayed, or copied into the new transaction form.
 * A new note has no fallback: falling back to the already-selected category
 * would be a redundant no-op and could encourage misleading suggestions.
 */
export function buildTransactionSmartDefaultsSuggestion(input: {
  transactions: Transaction[];
  mode: TransactionSmartDefaultsMode;
  note: string;
  validCategoryIds: string[];
}): TransactionSmartDefaultsSuggestion | null {
  const normalizedNote = normalizeContextNote(input.note);
  if (normalizedNote.length < 2 || normalizedNote === "giao dich moi") {
    return null;
  }

  const validCategoryIds = new Set(
    input.validCategoryIds.map(cleanId).filter(Boolean),
  );
  const exactNoteMatches = input.transactions.filter((transaction) =>
    isEligibleHistoryTransaction({
      transaction,
      mode: input.mode,
      validCategoryIds,
    }) && normalizeContextNote(transaction.note ?? "") === normalizedNote,
  );
  const newest = pickNewest(exactNoteMatches);
  if (!newest) return null;

  return {
    matchKind: "note",
    matchCount: exactNoteMatches.length,
    sourceTransactionId: String(newest.id),
    sourceDate: getLocalCalendarDate(newest),
    categoryId: cleanId(newest.categoryId),
  };
}
