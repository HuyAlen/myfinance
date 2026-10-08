import {
  getSavingTransferKind,
  isInternalTransferTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";
import type { FinanceReviewReason } from "@/src/lib/dashboard/dashboardIntelligence";
import type {
  Category,
  RecurrenceFrequency,
  Transaction,
  TransactionType,
} from "@/src/types/finance";
import { formatVND } from "@/src/services/finance/financeCalculations";
export type SortKey = "date" | "amount" | "category" | "wallet";
export type SortDir = "asc" | "desc";
export type ViewMode = "table" | "timeline";
export type TransactionDisplayFilter = "all" | TransactionType;

export type ToastPayload = {
  variant?: "success" | "error" | "info" | "warning";
  message: string;
};

export type TransactionFormMode = "income" | "expense" | "transfer";

export function getTransactionReviewReasonLabel(reason: FinanceReviewReason) {
  if (reason === "uncategorized") return "Chưa phân loại";
  if (reason === "possible-duplicate") return "Có thể trùng";
  if (reason === "category-type-mismatch") return "Sai loại danh mục";
  return "Chi tiêu bất thường";
}

export type FormState = {
  id?: string;
  type: TransactionType;
  formMode: TransactionFormMode;
  amount: string;
  categoryId: string;
  walletId: string;
  transferToWalletId: string;
  note: string;
  date: string;
  isRecurring: boolean;
  recurrence: RecurrenceFrequency;
  nextRunDate: string;
};

/**
 * `toISOString()` is UTC-based — at UTC+7, calling it between 00:00 and
 * 06:59 local time returns the PREVIOUS calendar day. Transaction dates are
 * a local calendar concept, so the default must be derived from the
 * device's local Y/M/D fields, never from a UTC conversion.
 */
export function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Factory, not a module-level constant: a `const emptyForm` would compute
 * `date` once when the module first loads and freeze it there for the
 * lifetime of the page (including across midnight, for a PWA/tab left open
 * for hours) — every subsequent "Thêm giao dịch" click would keep reusing
 * that stale date instead of the day the user actually clicked on.
 */
export function createEmptyForm(): FormState {
  return {
    type: "expense",
    formMode: "expense",
    amount: "",
    categoryId: "",
    walletId: "",
    transferToWalletId: "",
    note: "",
    date: getLocalDateInputValue(),
    isRecurring: false,
    recurrence: "monthly",
    nextRunDate: "",
  };
}

/**
 * Vietnamese label for an explicit drill-down date range, matching
 * DateFilterProvider's own "custom" mode label format (dd/mm/yyyy —
 * dd/mm/yyyy) so the header reads consistently whether the range came
 * from the global custom picker or from a contextual drill-down link.
 */
export function formatDrillDownRangeLabel(startDate: string, endDate: string) {
  const toDisplay = (isoDate: string) =>
    isoDate.split("-").reverse().join("/");
  return `${toDisplay(startDate)} - ${toDisplay(endDate)}`;
}

export function getTransactionDateValue(transaction: Transaction) {
  return String(transaction.date ?? "").trim();
}

export function getTransactionReferenceTimeIso(transaction: Transaction) {
  const reference = String(
    (
      transaction as Transaction & {
        transferReference?: string;
        transfer_reference?: string;
      }
    ).transferReference ??
      (transaction as Transaction & { transfer_reference?: string })
        .transfer_reference ??
      "",
  );

  const isoMatch = reference.match(
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/,
  );
  return isoMatch?.[1] ?? "";
}

export function getTransactionCreatedIso(transaction: Transaction) {
  const metadata = transaction as Transaction & {
    createdAt?: string;
    created_at?: string;
    createdTime?: string;
    created_time?: string;
    insertedAt?: string;
    inserted_at?: string;
    timestamp?: string;
    time?: string;
    updatedAt?: string;
    updated_at?: string;
  };

  const explicitCreated =
    metadata.createdAt ??
    metadata.created_at ??
    metadata.createdTime ??
    metadata.created_time ??
    metadata.insertedAt ??
    metadata.inserted_at ??
    metadata.timestamp ??
    metadata.updatedAt ??
    metadata.updated_at ??
    "";

  if (explicitCreated) return String(explicitCreated);

  const referenceTime = getTransactionReferenceTimeIso(transaction);
  if (referenceTime) return referenceTime;

  const dateValue = getTransactionDateValue(transaction);
  if (dateValue.includes("T")) return dateValue;

  if (dateValue && metadata.time) {
    return `${dateValue}T${metadata.time}`;
  }

  return "";
}

export function getTransactionSortTime(transaction: Transaction) {
  const createdIso = getTransactionCreatedIso(transaction);
  const createdTime = createdIso ? new Date(createdIso).getTime() : 0;
  if (Number.isFinite(createdTime) && createdTime > 0) return createdTime;

  const dateValue = getTransactionDateValue(transaction);
  if (!dateValue) return 0;

  const dateOnly = dateValue.slice(0, 10);
  const dateTime = new Date(`${dateOnly}T00:00:00.000`).getTime();
  return Number.isFinite(dateTime) ? dateTime : 0;
}

export function compareTransactionNewestFirst(a: Transaction, b: Transaction) {
  const timeCompare = getTransactionSortTime(b) - getTransactionSortTime(a);
  if (timeCompare !== 0) return timeCompare;

  return String(b.id).localeCompare(String(a.id));
}

export function getTransactionFormMode(
  transaction: Transaction,
  categories: Category[],
): TransactionFormMode {
  void categories;
  if (isInternalTransferTransaction(transaction)) return "transfer";
  return transaction.type === "income" ? "income" : "expense";
}

export function getTransactionTypeFromFormMode(
  mode: TransactionFormMode,
): TransactionType {
  if (mode === "income") return "income";
  if (mode === "transfer") return "transfer";
  return "expense";
}

export function formatTransactionDayLabel(dateValue: string) {
  dateValue = String(dateValue ?? "").slice(0, 10);
  const today = new Date();
  // Local calendar date comparison — toISOString() is UTC-based and would
  // mislabel "Hôm nay" as a plain date during the UTC+7 00:00-06:59 window.
  const todayIso = getLocalDateInputValue(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayIso = getLocalDateInputValue(yesterday);

  if (dateValue === todayIso) return "Hôm nay";
  if (dateValue === yesterdayIso) return "Hôm qua";

  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;

  return today.getFullYear() === Number(year)
    ? `${day}/${month}`
    : `${day}/${month}/${year}`;
}

export function formatTransactionTime(transaction: Transaction) {
  const metadata = transaction as Transaction & {
    time?: string;
    transactionTime?: string;
    transaction_time?: string;
  };

  const explicitTime =
    metadata.time ??
    metadata.transactionTime ??
    metadata.transaction_time ??
    "";

  if (/^\d{1,2}:\d{2}/.test(String(explicitTime))) {
    const [hour = "0", minute = "00"] = String(explicitTime).split(":");
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  const createdIso = getTransactionCreatedIso(transaction);
  const date = createdIso ? new Date(createdIso) : null;

  if (!date || Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCompactCategoryName(category?: Category) {
  if (!category?.name) return { primary: "—", extraCount: 0 };

  const parts = category.name
    .split(/\s*\+\s*|,|\/|·/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    primary: parts[0] ?? category.name,
    extraCount: Math.max(parts.length - 1, 0),
  };
}

export function getTransactionDisplayType(transaction: Transaction) {
  return isInternalTransferTransaction(transaction)
    ? "transfer"
    : transaction.type;
}

export function getTransactionAccentClass(transaction: Transaction) {
  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "border-l-emerald-400";

  if (displayType === "transfer") return "border-l-indigo-400";
  return "border-l-rose-400";
}

export function getTransactionAmountPrefix(transaction: Transaction) {

  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return "+";
  if (savingKind === "withdraw" || savingKind === "close") return "−";

  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "+";
  if (displayType === "transfer") return "⇄";
  return "−";
}

export function getTransactionAmountColorClass(transaction: Transaction) {

  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return "text-emerald-600";
  if (savingKind === "withdraw" || savingKind === "close")
    return "text-rose-500";

  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "text-emerald-600";
  if (displayType === "transfer") return "text-indigo-600";
  return "text-rose-500";
}

export function getInternalTransferTurnoverAmount(transaction: Transaction) {
  return isInternalTransferTransaction(transaction)
    ? Math.abs(transaction.amount)
    : 0;
}

export function getSignedAmountText(amount: number) {
  if (amount > 0) return "+" + formatVND(amount);
  if (amount < 0) return "−" + formatVND(Math.abs(amount));
  return formatVND(0);
}

export function getTransactionDisplayNote(transaction: Transaction) {
  const savingKind = getSavingTransferKind(transaction);
  const note = transaction.note.trim();
  const normalizedNote = normalizeTransactionNote(note);

  if (savingKind === "deposit") {
    return normalizedNote.includes("tiet kiem")
      ? note
      : "Nạp vào tiết kiệm" + (note ? ": " + note : "");
  }

  if (savingKind === "withdraw") {
    return normalizedNote.includes("tiet kiem")
      ? note
      : "Rút từ tiết kiệm" + (note ? ": " + note : "");
  }

  if (savingKind === "close") {
    return normalizedNote.includes("tiet kiem")
      ? note
      : "Tất toán tiết kiệm" + (note ? ": " + note : "");
  }

  return (
    note ||
    (getTransactionDisplayType(transaction) === "transfer"
      ? "Chuyển tiền"
      : "Giao dịch")
  );
}

export function getTransferWalletLabel(
  transaction: Transaction,
  sourceWalletName?: string,
  destinationWalletName?: string,
) {
  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") {
    return {
      from: sourceWalletName ?? "—",
      to: "Tiết kiệm",
      title: (sourceWalletName ?? "—") + " → Tiết kiệm",
    };
  }

  if (savingKind === "withdraw" || savingKind === "close") {
    return {
      from: "Tiết kiệm",
      to: sourceWalletName ?? destinationWalletName ?? "—",
      title:
        "Tiết kiệm → " + (sourceWalletName ?? destinationWalletName ?? "—"),
    };
  }

  return {
    from: sourceWalletName ?? "—",
    to: destinationWalletName ?? "—",
    title: (sourceWalletName ?? "—") + " → " + (destinationWalletName ?? "—"),
  };
}

// Bursts of realtime events from a single multi-table write are coalesced
// within this window instead of triggering one reload per event.
export const REALTIME_REFRESH_DEBOUNCE_MS = 100;

// Group-aware pagination target. At ~200-300 tx/month this keeps rendered
// rows per page well under the range that causes iPhone Safari scroll jank,
// without needing virtualization.
export const TRANSACTIONS_PAGE_SIZE = 50;

export function getVisiblePageNumbers(totalPages: number, currentPage: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages = new Set<number>([
    0,
    totalPages - 1,
    currentPage,
    currentPage - 1,
    currentPage + 1,
  ]);
  return Array.from(pages)
    .filter((page) => page >= 0 && page < totalPages)
    .sort((a, b) => a - b);
}

// ─── Main component ───────────────────────────────────────────────────────────
