import type { Transaction } from "@/src/types/finance";
import {
  isInternalTransferTransaction,
  isSavingsManagedTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";

export type TransactionSmartDefaultsMode = "income" | "expense";
export type TransactionSmartDefaultsMatchKind = "note";

export type TransactionSmartDefaultsSuggestion = {
  matchKind: TransactionSmartDefaultsMatchKind;
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

  const categoryId = cleanId(transaction.categoryId);
  return validCategoryIds.has(categoryId);
}

function toSuggestion(
  source: Transaction,
  matchCount: number,
): TransactionSmartDefaultsSuggestion {
  return {
    matchKind: "note",
    matchCount,
    sourceTransactionId: String(source.id),
    sourceDate: getLocalCalendarDate(source),
    categoryId: cleanId(source.categoryId),
  };
}

/**
 * TRANSACTION-CATEGORY-SUGGESTION-ONLY-1
 *
 * Derives one advisory category suggestion from the already-loaded transaction
 * ledger. Exact normalized note history is the only learned signal. Amount and
 * wallet are deliberately excluded from both matching and output so accepting a
 * suggestion can never overwrite user-entered transaction values.
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

  const exactNoteMatches = input.transactions.filter((transaction) => {
    if (
      !isEligibleHistoryTransaction({
        transaction,
        mode: input.mode,
        validCategoryIds,
      })
    ) {
      return false;
    }

    return normalizeContextNote(transaction.note ?? "") === normalizedNote;
  });

  if (exactNoteMatches.length === 0) return null;

  const newest = pickNewest(exactNoteMatches);
  return newest ? toSuggestion(newest, exactNoteMatches.length) : null;
}
