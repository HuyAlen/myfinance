/**
 * WALLET-RECONCILIATION-STATUS-UX-1
 * Balance revision, not an editable wallet timestamp, determines whether a
 * persisted reconciliation receipt still covers the current wallet balance.
 * Legacy receipts without a revision must be re-confirmed (not called never).
 */
export type WalletReconciliationStatus = "never" | "needs_review" | "reconciled";

export type RevisionedWallet = {
  id: string;
  balance_revision?: number | null;
};

export type RevisionedReconciliation = {
  walletId: string;
  balanceRevision?: number | null;
};

export function getWalletReconciliationStatus(
  wallet: RevisionedWallet,
  receipt: RevisionedReconciliation | null | undefined,
): WalletReconciliationStatus {
  if (!receipt) return "never";
  if (receipt.walletId !== wallet.id) return "needs_review";
  if (
    !Number.isSafeInteger(wallet.balance_revision) ||
    !Number.isSafeInteger(receipt.balanceRevision) ||
    wallet.balance_revision !== receipt.balanceRevision
  ) {
    return "needs_review";
  }
  return "reconciled";
}

export const walletReconciliationStatusLabels: Record<
  WalletReconciliationStatus,
  string
> = {
  never: "Chưa đối soát",
  needs_review: "Cần kiểm tra lại",
  reconciled: "Đã đối soát",
};
