import type { Transaction } from "@/src/types/finance";
import {
  isInternalTransferTransaction,
  isSavingsManagedTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";

export type TransactionQuickRepeatCandidate = {
  key: string;
  transaction: Transaction;
  occurrences: number;
  latestDate: string;
};

function getRepeatMode(transaction: Transaction) {
  if (isInternalTransferTransaction(transaction)) return "transfer" as const;
  if (transaction.type === "income") return "income" as const;
  if (transaction.type === "expense") return "expense" as const;
  return null;
}

function getLocalCalendarDate(transaction: Transaction) {
  return String(transaction.date ?? "").trim().slice(0, 10);
}

function hasRecurringMetadata(transaction: Transaction) {
  return Boolean(
    transaction.isRecurring || transaction.recurrence || transaction.nextRunDate,
  );
}

function normalizeRepeatNote(note: string) {
  return normalizeTransactionNote(note).replace(/\s+/g, " ");
}

function buildRepeatKey(transaction: Transaction) {
  if (isSavingsManagedTransaction(transaction)) return null;
  if (hasRecurringMetadata(transaction)) return null;

  const mode = getRepeatMode(transaction);
  if (!mode) return null;

  const walletId = String(transaction.walletId ?? "").trim();
  if (!walletId) return null;

  const categoryId = String(transaction.categoryId ?? "").trim();
  const transferToWalletId = String(
    transaction.transferToWalletId ?? "",
  ).trim();

  if (mode === "transfer") {
    if (!transferToWalletId || transferToWalletId === walletId) return null;
  } else if (!categoryId) {
    return null;
  }

  return [
    mode,
    categoryId,
    walletId,
    transferToWalletId,
    normalizeRepeatNote(transaction.note ?? ""),
  ].join("|");
}

function isNewerTransaction(
  candidate: Transaction,
  current: Transaction,
) {
  const candidateDate = getLocalCalendarDate(candidate);
  const currentDate = getLocalCalendarDate(current);
  if (candidateDate !== currentDate) return candidateDate > currentDate;

  return String(candidate.id).localeCompare(String(current.id)) > 0;
}

export function buildTransactionQuickRepeatCandidates(
  transactions: Transaction[],
  limit = 3,
): TransactionQuickRepeatCandidate[] {
  if (limit <= 0) return [];

  const grouped = new Map<
    string,
    { transaction: Transaction; occurrences: number }
  >();

  for (const transaction of transactions) {
    const key = buildRepeatKey(transaction);
    if (!key) continue;

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { transaction, occurrences: 1 });
      continue;
    }

    existing.occurrences += 1;
    if (isNewerTransaction(transaction, existing.transaction)) {
      existing.transaction = transaction;
    }
  }

  return Array.from(grouped.entries())
    .flatMap(([key, group]) => {
      if (group.occurrences < 2) return [];
      return [
        {
          key,
          transaction: group.transaction,
          occurrences: group.occurrences,
          latestDate: getLocalCalendarDate(group.transaction),
        },
      ];
    })
    .sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        b.latestDate.localeCompare(a.latestDate) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, limit);
}