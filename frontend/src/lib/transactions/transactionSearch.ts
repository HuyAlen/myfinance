/**
 * Transaction search text normalization/matching — TXN-UX-1.
 *
 * Pure, framework-free (no React, no Supabase) — safe to unit-test and
 * import from anywhere.
 *
 * Deliberately NOT shared with transactionClassification.ts's
 * normalizeTransactionNote, even though the underlying Vietnamese-
 * diacritic-stripping algorithm is identical today: search text
 * normalization and transfer/saving note classification are conceptually
 * independent concerns that only coincidentally need the same transform
 * right now. Coupling them would mean a future change to one (e.g. a new
 * mapping needed only for classification) silently changes the other —
 * the same reasoning already established in this codebase for
 * isBudgetAttentionReady/isMonthlyProgressReady (see
 * dashboardReadiness.ts), which share an identical formula but are kept
 * as separate named functions for the same reason.
 */

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if `query` (empty/whitespace-only counts as "no restriction") is
 * found within `searchText`, comparing both sides through the same
 * normalization so accents/case on either side never prevent a match —
 * e.g. a plain-ASCII query "rut tien" matches "Rút tiền mặt tại ATM".
 */
export function matchesSearchQuery(searchText: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(searchText).includes(normalizedQuery);
}
