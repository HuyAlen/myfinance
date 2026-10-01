import type {
  FinanceReviewInbox,
  FinanceReviewReason,
} from "@/src/lib/dashboard/dashboardIntelligence";
import type { Transaction } from "@/src/types/finance";

export const TRANSACTION_REVIEW_ACK_STORAGE_KEY =
  "myfinance:transaction-review-ack-v1";

function normalizeReviewText(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("vi-VN")
    .replace(/\s+/g, " ");
}

function transactionDayKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildTransactionReviewFingerprint(transaction: Transaction) {
  return [
    transaction.type,
    Math.round(Number(transaction.amount) || 0),
    transaction.walletId || "",
    transaction.categoryId || "",
    transactionDayKey(transaction.date),
    normalizeReviewText(transaction.note),
  ].join("|");
}

export function buildTransactionReviewAcknowledgementKey(
  transaction: Transaction,
  reason: FinanceReviewReason,
) {
  return [
    reason,
    transaction.id,
    buildTransactionReviewFingerprint(transaction),
  ].join("::");
}

export function isTransactionReviewReasonAcknowledged(
  transaction: Transaction,
  reason: FinanceReviewReason,
  acknowledgedKeys: ReadonlySet<string>,
) {
  return acknowledgedKeys.has(
    buildTransactionReviewAcknowledgementKey(transaction, reason),
  );
}

export function applyTransactionReviewAcknowledgements(
  inbox: FinanceReviewInbox,
  transactions: Transaction[],
  acknowledgedKeys: ReadonlySet<string>,
): FinanceReviewInbox {
  const byId = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const items = inbox.items
    .map((item) => {
      const transaction = byId.get(item.transactionId);
      if (!transaction) return item;
      return {
        ...item,
        reasons: item.reasons.filter(
          (reason) =>
            !isTransactionReviewReasonAcknowledged(
              transaction,
              reason,
              acknowledgedKeys,
            ),
        ),
      };
    })
    .filter((item) => item.reasons.length > 0);

  return {
    total: items.length,
    uncategorizedCount: items.filter((item) =>
      item.reasons.includes("uncategorized"),
    ).length,
    duplicateCount: items.filter((item) =>
      item.reasons.includes("possible-duplicate"),
    ).length,
    unusualExpenseCount: items.filter((item) =>
      item.reasons.includes("unusual-expense"),
    ).length,
    items,
  };
}

export function findPossibleDuplicatePeers(
  transaction: Transaction,
  transactions: Transaction[],
) {
  const key = buildTransactionReviewFingerprint(transaction);
  return transactions.filter(
    (candidate) =>
      candidate.id !== transaction.id &&
      buildTransactionReviewFingerprint(candidate) === key,
  );
}

export function readTransactionReviewAcknowledgements() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(TRANSACTION_REVIEW_ACK_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

export function persistTransactionReviewAcknowledgements(
  keys: ReadonlySet<string>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TRANSACTION_REVIEW_ACK_STORAGE_KEY,
      JSON.stringify([...keys]),
    );
  } catch {
    // Review acknowledgements are UX state only. Ledger correctness must
    // never depend on localStorage availability.
  }
}
