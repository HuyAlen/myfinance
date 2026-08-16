/**
 * Canonical transaction transfer/saving classification — TXN-CORRECTNESS-1.
 *
 * Pure, framework-free (no React, no Supabase) — safe to unit-test and
 * import from anywhere without pulling in the Transactions page's full
 * module graph (auth/realtime providers, which require env vars at import
 * time). Extracted out of TransactionsPage.tsx specifically so this logic
 * is directly unit-testable; nothing about its behavior changed in the
 * move.
 *
 * Mirrors financeStorage.ts's inferTransactionKind: a transaction's own
 * `type` decides income/expense outright — note-text inference (savings
 * subtype, generic transfer wording) only ever applies to transfer-domain
 * (or legacy non-income/expense) rows. Before this fix, the equivalent
 * logic lived directly inside TransactionsPage.tsx and ran its note-text
 * matching on EVERY transaction regardless of `type`, silently
 * reclassifying real income/expense rows (e.g. "Rút tiền mặt tại ATM",
 * "Chuyển tiền học phí con") as transfers — excluding them from the
 * page's own income/expense/net-cash-flow totals and flipping their
 * displayed sign/icon.
 */

import type { Transaction } from "@/src/types/finance";

export function normalizeTransactionNote(note: string) {
  return note
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function getTransactionTransferReferenceType(transaction: Transaction) {
  const metadata = transaction as Transaction & {
    transferReferenceType?: string;
    transfer_reference_type?: string;
  };

  return String(
    metadata.transferReferenceType ?? metadata.transfer_reference_type ?? "",
  )
    .trim()
    .toLowerCase();
}

function getTransactionSourceType(transaction: Transaction) {
  const metadata = transaction as Transaction & {
    sourceType?: string;
    source_type?: string;
  };

  return String(metadata.sourceType ?? metadata.source_type ?? "")
    .trim()
    .toLowerCase();
}

function getTransactionDestinationType(transaction: Transaction) {
  const metadata = transaction as Transaction & {
    destinationType?: string;
    destination_type?: string;
  };

  return String(metadata.destinationType ?? metadata.destination_type ?? "")
    .trim()
    .toLowerCase();
}

/**
 * Mirrors financeStorage.ts's inferTransactionKind, which returns
 * "income"/"expense" immediately and never reaches its own note-text
 * matching for those types. A plain income/expense transaction must never
 * be reclassified as a saving transfer purely because its note happens to
 * contain phrasing like "rút tiền"/"nạp thêm" — only transfer-domain (or
 * legacy non-income/expense) rows are eligible for this inference.
 */
export function getSavingTransferKind(
  transaction: Transaction,
): "deposit" | "withdraw" | "close" | null {
  if (transaction.type === "income" || transaction.type === "expense") {
    return null;
  }

  const referenceType = getTransactionTransferReferenceType(transaction);
  const sourceType = getTransactionSourceType(transaction);
  const destinationType = getTransactionDestinationType(transaction);

  if (transaction.type === "transfer" && referenceType === "saving") {
    if (sourceType === "wallet" && destinationType === "saving")
      return "deposit";
    if (sourceType === "saving" && destinationType === "wallet")
      return "withdraw";
  }

  const normalizedNote = normalizeTransactionNote(transaction.note);

  if (
    normalizedNote.includes("tat toan tiet kiem") ||
    normalizedNote.startsWith("tat toan")
  ) {
    return "close";
  }

  if (
    normalizedNote.startsWith("rut tu tiet kiem") ||
    normalizedNote.startsWith("rut tien tu tiet kiem") ||
    normalizedNote.startsWith("rut tien")
  ) {
    return "withdraw";
  }

  if (
    normalizedNote.startsWith("nap vao tiet kiem") ||
    normalizedNote.startsWith("gui vao tiet kiem") ||
    normalizedNote.startsWith("nap them vao tiet kiem") ||
    normalizedNote.startsWith("nap them") ||
    normalizedNote.startsWith("gui tiet kiem")
  ) {
    return "deposit";
  }

  return null;
}

/**
 * A plain income/expense transaction must never be reclassified as an
 * internal transfer purely from note text (e.g. "Chuyển tiền học phí
 * con", "Rút tiền mặt tại ATM") — only `type === "transfer"` (or a legacy
 * non-income/expense row) is eligible for note-based transfer/saving
 * -subtype inference, matching financeStorage.ts's inferTransactionKind.
 */
export function isInternalTransferTransaction(transaction: Transaction) {
  if (transaction.type === "transfer") return true;

  if (transaction.type === "income" || transaction.type === "expense") {
    return false;
  }

  const savingKind = getSavingTransferKind(transaction);
  if (savingKind) return true;

  const normalizedNote = normalizeTransactionNote(transaction.note);

  return (
    normalizedNote.startsWith("chuyen tien") ||
    normalizedNote.includes("chuyen vi") ||
    normalizedNote.includes("noi bo")
  );
}
