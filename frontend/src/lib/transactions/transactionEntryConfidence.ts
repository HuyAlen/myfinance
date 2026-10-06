import type { Transaction } from "@/src/types/finance";
import {
  isInternalTransferTransaction,
  isSavingsManagedTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";
import { buildTransactionReviewFingerprint } from "@/src/lib/transactions/transactionReviewWorkflow";

export type TransactionEntryConfidenceMode = "income" | "expense";

export type TransactionEntryConfidenceWarning =
  | {
      kind: "possible-duplicate";
      peerTransactionId: string;
    }
  | {
      kind: "amount-outlier";
      direction: "high" | "low";
      baselineAmount: number;
      contextCount: number;
    }
  | {
      kind: "wallet-context-mismatch";
      expectedWalletId: string;
      expectedWalletCount: number;
      contextCount: number;
    };

export type TransactionEntryConfidenceDraft = {
  mode: TransactionEntryConfidenceMode;
  amount: number;
  categoryId: string;
  walletId: string;
  note: string;
  date: string;
};

function cleanId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContextNote(value: string) {
  return normalizeTransactionNote(value).replace(/\s+/g, " ").trim();
}

function hasRecurringMetadata(transaction: Transaction) {
  return Boolean(
    transaction.isRecurring || transaction.recurrence || transaction.nextRunDate,
  );
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isEligibleHistoryTransaction(input: {
  transaction: Transaction;
  mode: TransactionEntryConfidenceMode;
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

  return (
    validCategoryIds.has(cleanId(transaction.categoryId)) &&
    validWalletIds.has(cleanId(transaction.walletId))
  );
}

/**
 * TRANSACTION-ENTRY-CONFIDENCE-1
 *
 * Builds advisory, non-blocking checks for a NEW ordinary transaction from
 * the ledger already loaded by TransactionsPage. The detector never mutates,
 * persists or queries finance state. Duplicate identity reuses the canonical
 * review fingerprint. Amount and wallet context require repeated exact-note
 * history so a one-off transaction cannot manufacture a warning.
 */
export function buildTransactionEntryConfidenceWarnings(input: {
  transactions: Transaction[];
  draft: TransactionEntryConfidenceDraft;
  validCategoryIds: string[];
  validWalletIds: string[];
}): TransactionEntryConfidenceWarning[] {
  const amount = Number(input.draft.amount);
  const categoryId = cleanId(input.draft.categoryId);
  const walletId = cleanId(input.draft.walletId);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !categoryId ||
    !walletId
  ) {
    return [];
  }

  const validCategoryIds = new Set(
    input.validCategoryIds.map(cleanId).filter(Boolean),
  );
  const validWalletIds = new Set(
    input.validWalletIds.map(cleanId).filter(Boolean),
  );
  if (!validCategoryIds.has(categoryId) || !validWalletIds.has(walletId)) {
    return [];
  }

  const eligible = input.transactions.filter((transaction) =>
    isEligibleHistoryTransaction({
      transaction,
      mode: input.draft.mode,
      validCategoryIds,
      validWalletIds,
    }),
  );

  const warnings: TransactionEntryConfidenceWarning[] = [];
  const draftTransaction: Transaction = {
    id: "__entry-confidence-draft__",
    type: input.draft.mode,
    amount,
    categoryId,
    walletId,
    note: input.draft.note,
    date: input.draft.date,
  };

  if (/^\d{4}-\d{2}-\d{2}/.test(input.draft.date)) {
    const draftFingerprint = buildTransactionReviewFingerprint(draftTransaction);
    const duplicatePeer = eligible.find(
      (transaction) =>
        buildTransactionReviewFingerprint(transaction) === draftFingerprint,
    );
    if (duplicatePeer) {
      warnings.push({
        kind: "possible-duplicate",
        peerTransactionId: duplicatePeer.id,
      });
    }
  }

  const normalizedNote = normalizeContextNote(input.draft.note);
  if (normalizedNote.length < 2 || normalizedNote === "giao dich moi") {
    return warnings;
  }

  const context = eligible.filter(
    (transaction) =>
      normalizeContextNote(transaction.note ?? "") === normalizedNote,
  );
  if (context.length < 3) return warnings;

  const baselineAmount = median(context.map((transaction) => transaction.amount));
  if (baselineAmount > 0) {
    const ratio = amount / baselineAmount;
    const absoluteDelta = Math.abs(amount - baselineAmount);
    const minimumDelta = Math.max(200_000, baselineAmount * 0.5);

    if (absoluteDelta >= minimumDelta && ratio >= 3) {
      warnings.push({
        kind: "amount-outlier",
        direction: "high",
        baselineAmount,
        contextCount: context.length,
      });
    } else if (absoluteDelta >= minimumDelta && ratio <= 1 / 3) {
      warnings.push({
        kind: "amount-outlier",
        direction: "low",
        baselineAmount,
        contextCount: context.length,
      });
    }
  }

  const walletCounts = new Map<string, number>();
  for (const transaction of context) {
    const historicalWalletId = cleanId(transaction.walletId);
    walletCounts.set(
      historicalWalletId,
      (walletCounts.get(historicalWalletId) ?? 0) + 1,
    );
  }
  const [dominantWallet] = [...walletCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  if (dominantWallet) {
    const [expectedWalletId, expectedWalletCount] = dominantWallet;
    const share = expectedWalletCount / context.length;
    if (
      expectedWalletId !== walletId &&
      expectedWalletCount >= 3 &&
      share >= 0.8
    ) {
      warnings.push({
        kind: "wallet-context-mismatch",
        expectedWalletId,
        expectedWalletCount,
        contextCount: context.length,
      });
    }
  }

  return warnings;
}