import type {
  FinanceReviewItem,
  FinanceReviewReason,
} from "@/src/lib/dashboard/dashboardIntelligence";
import type { Transaction } from "@/src/types/finance";

export type FinanceReviewSeverity = "high" | "action" | "info";

export function getFinanceReviewSeverity(
  reasons: readonly FinanceReviewReason[],
): FinanceReviewSeverity {
  if (
    reasons.includes("possible-duplicate") ||
    reasons.includes("category-type-mismatch")
  ) {
    return "high";
  }
  if (reasons.includes("uncategorized")) return "action";
  return "info";
}

export function getFinanceReviewSeverityLabel(
  severity: FinanceReviewSeverity,
) {
  if (severity === "high") return "Ưu tiên cao";
  if (severity === "action") return "Cần xử lý";
  return "Theo dõi";
}

export function getFinanceReviewReasonLabel(reason: FinanceReviewReason) {
  if (reason === "uncategorized") return "Chưa phân loại";
  if (reason === "possible-duplicate") return "Có thể trùng";
  if (reason === "category-type-mismatch") return "Sai loại danh mục";
  return "Chi tiêu bất thường";
}

export type FinanceReviewFilters = {
  severity: "all" | FinanceReviewSeverity;
  reason: "all" | FinanceReviewReason;
  walletId: string;
  categoryId: string;
};

export const DEFAULT_FINANCE_REVIEW_FILTERS: FinanceReviewFilters = {
  severity: "all",
  reason: "all",
  walletId: "",
  categoryId: "",
};

export function filterFinanceReviewItems(input: {
  items: readonly FinanceReviewItem[];
  transactions: readonly Transaction[];
  filters: FinanceReviewFilters;
}) {
  const transactionById = new Map(
    input.transactions.map((transaction) => [transaction.id, transaction]),
  );

  return input.items.filter((item) => {
    const transaction = transactionById.get(item.transactionId);
    if (!transaction) return false;

    if (
      input.filters.severity !== "all" &&
      getFinanceReviewSeverity(item.reasons) !== input.filters.severity
    ) {
      return false;
    }

    if (
      input.filters.reason !== "all" &&
      !item.reasons.includes(input.filters.reason)
    ) {
      return false;
    }

    if (
      input.filters.walletId &&
      transaction.walletId !== input.filters.walletId
    ) {
      return false;
    }

    if (
      input.filters.categoryId &&
      transaction.categoryId !== input.filters.categoryId
    ) {
      return false;
    }

    return true;
  });
}

export function countActiveFinanceReviewFilters(
  filters: FinanceReviewFilters,
) {
  return [
    filters.severity !== "all",
    filters.reason !== "all",
    Boolean(filters.walletId),
    Boolean(filters.categoryId),
  ].filter(Boolean).length;
}
