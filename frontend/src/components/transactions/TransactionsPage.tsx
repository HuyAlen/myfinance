"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useDateFilter } from "@/src/components/layout/DateFilterProvider";
import {
  useQuickActionCreateIntent,
  type QuickActionCreateMode,
} from "@/src/lib/navigation/quickActionIntent";
import {
  hasTransactionsContext,
  parseTransactionsContext,
} from "@/src/lib/navigation/financeNavigation";
import {
  getSavingTransferKind,
  isInternalTransferTransaction,
  isInvestmentManagedTransaction,
  isSavingsManagedTransaction,
  normalizeTransactionNote,
} from "@/src/lib/transactions/transactionClassification";
import { resolveTransactionsEffectiveRange } from "@/src/lib/transactions/transactionsPeriod";
import {
  applyTransactionReviewAcknowledgements,
  buildTransactionReviewAcknowledgementKey,
  findPossibleDuplicatePeers,
  isTransactionReviewReasonAcknowledged,
  persistTransactionReviewAcknowledgements,
  readTransactionReviewAcknowledgements,
} from "@/src/lib/transactions/transactionReviewWorkflow";
import {
  buildFinanceReviewInbox,
  type FinanceReviewReason,
} from "@/src/lib/dashboard/dashboardIntelligence";
import {
  isSessionStillCurrent,
  isSubmittingThisSession,
} from "@/src/lib/transactions/mutationSession";
import { matchesSearchQuery } from "@/src/lib/transactions/transactionSearch";
import {
  createDefaultTransactionCapturePreferences,
  getRecentTransactionCaptureCategoryIds,
  persistTransactionCapturePreferences,
  readTransactionCapturePreferences,
  rememberTransactionCaptureSuccess,
  resolveTransactionCaptureDefaults,
} from "@/src/lib/transactions/transactionCapturePreferences";
import { buildTransactionQuickRepeatCandidates } from "@/src/lib/transactions/transactionQuickRepeat";
import { buildTransactionSmartDefaultsSuggestion } from "@/src/lib/transactions/transactionSmartDefaults";
import { buildTransactionEntryConfidenceWarnings } from "@/src/lib/transactions/transactionEntryConfidence";
import TransactionCsvImportModal from "@/src/components/transactions/TransactionCsvImportModal";
import TransactionRulesManager from "@/src/components/transactions/TransactionRulesManager";
import {
  evaluateTransactionRules,
  type TransactionRule,
} from "@/src/lib/transactions/transactionRules";
import { getTransactionRules } from "@/src/services/finance/transactionRulesStorage";
import { serializeTransactionsCsv } from "@/src/lib/transactions/transactionCsvImport";
import {
  DEFAULT_FINANCE_REVIEW_FILTERS,
  countActiveFinanceReviewFilters,
  filterFinanceReviewItems,
  getFinanceReviewSeverity,
  getFinanceReviewSeverityLabel,
  type FinanceReviewFilters,
} from "@/src/lib/transactions/financeReviewInbox2";
import {
  acknowledgeTransactionReviewReasons,
  getTransactionReviewAcknowledgementKeys,
} from "@/src/services/finance/transactionReviewStorage";
import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  Download,
  Edit3,
  Upload,
  LayoutList,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import type {
  Category,
  RecurrenceFrequency,
  Transaction,
  TransactionType,
  Wallet,
} from "@/src/types/finance";
import {
  addTransaction,
  deleteTransaction,
  getCategories,
  getTransactionsInRange,
  getWallets,
  updateTransaction,
} from "@/src/services/finance/financeStorage";
import {
  formatVND,
  getCategoryPlanningGroup,
  getRealExpenseTransactions,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import {
  CurrencyInput,
  formatCurrencyInput,
  parseCurrencyInput,
} from "@/src/components/ui/CurrencyInput";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";

// ─── Types ────────────────────────────────────────────────────────────────────
type SortKey = "date" | "amount" | "category" | "wallet";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "timeline";
type TransactionDisplayFilter = "all" | TransactionType;

type ToastPayload = {
  variant?: "success" | "error" | "info" | "warning";
  message: string;
};

type TransactionFormMode = "income" | "expense" | "transfer";

function getTransactionReviewReasonLabel(reason: FinanceReviewReason) {
  if (reason === "uncategorized") return "Chưa phân loại";
  if (reason === "possible-duplicate") return "Có thể trùng";
  if (reason === "category-type-mismatch") return "Sai loại danh mục";
  return "Chi tiêu bất thường";
}

type FormState = {
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
function getLocalDateInputValue(date = new Date()) {
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
function createEmptyForm(): FormState {
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
function formatDrillDownRangeLabel(startDate: string, endDate: string) {
  const toDisplay = (isoDate: string) =>
    isoDate.split("-").reverse().join("/");
  return `${toDisplay(startDate)} - ${toDisplay(endDate)}`;
}

function getTransactionDateValue(transaction: Transaction) {
  return String(transaction.date ?? "").trim();
}

function getTransactionReferenceTimeIso(transaction: Transaction) {
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

function getTransactionCreatedIso(transaction: Transaction) {
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

function getTransactionSortTime(transaction: Transaction) {
  const createdIso = getTransactionCreatedIso(transaction);
  const createdTime = createdIso ? new Date(createdIso).getTime() : 0;
  if (Number.isFinite(createdTime) && createdTime > 0) return createdTime;

  const dateValue = getTransactionDateValue(transaction);
  if (!dateValue) return 0;

  const dateOnly = dateValue.slice(0, 10);
  const dateTime = new Date(`${dateOnly}T00:00:00.000`).getTime();
  return Number.isFinite(dateTime) ? dateTime : 0;
}

function compareTransactionNewestFirst(a: Transaction, b: Transaction) {
  const timeCompare = getTransactionSortTime(b) - getTransactionSortTime(a);
  if (timeCompare !== 0) return timeCompare;

  return String(b.id).localeCompare(String(a.id));
}

function getTransactionFormMode(
  transaction: Transaction,
  categories: Category[],
): TransactionFormMode {
  void categories;
  if (isInternalTransferTransaction(transaction)) return "transfer";
  return transaction.type === "income" ? "income" : "expense";
}

function getTransactionTypeFromFormMode(
  mode: TransactionFormMode,
): TransactionType {
  if (mode === "income") return "income";
  if (mode === "transfer") return "transfer";
  return "expense";
}

function formatTransactionDayLabel(dateValue: string) {
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

function formatTransactionTime(transaction: Transaction) {
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

function getCompactCategoryName(category?: Category) {
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

function getTransactionDisplayType(transaction: Transaction) {
  return isInternalTransferTransaction(transaction)
    ? "transfer"
    : transaction.type;
}

function getTransactionAccentClass(transaction: Transaction) {
  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "border-l-emerald-400";

  if (displayType === "transfer") return "border-l-indigo-400";
  return "border-l-rose-400";
}

function getTransactionAmountPrefix(transaction: Transaction) {

  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return "+";
  if (savingKind === "withdraw" || savingKind === "close") return "−";

  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "+";
  if (displayType === "transfer") return "⇄";
  return "−";
}

function getTransactionAmountColorClass(transaction: Transaction) {

  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return "text-emerald-600";
  if (savingKind === "withdraw" || savingKind === "close")
    return "text-rose-500";

  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "text-emerald-600";
  if (displayType === "transfer") return "text-indigo-600";
  return "text-rose-500";
}

function getInternalTransferTurnoverAmount(transaction: Transaction) {
  return isInternalTransferTransaction(transaction)
    ? Math.abs(transaction.amount)
    : 0;
}

function getSignedAmountText(amount: number) {
  if (amount > 0) return "+" + formatVND(amount);
  if (amount < 0) return "−" + formatVND(Math.abs(amount));
  return formatVND(0);
}

function getTransactionDisplayNote(transaction: Transaction) {
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

function getTransferWalletLabel(
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
const REALTIME_REFRESH_DEBOUNCE_MS = 100;

// Group-aware pagination target. At ~200-300 tx/month this keeps rendered
// rows per page well under the range that causes iPhone Safari scroll jank,
// without needing virtualization.
const TRANSACTIONS_PAGE_SIZE = 50;

function getVisiblePageNumbers(totalPages: number, currentPage: number) {
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
export default function TransactionsPage() {
  const { dateRange, filterLabel } = useDateFilter();
  // TXN-CORRECTNESS-1: read before reloadData (below) so its identity can
  // depend on the resolved effective range rather than a locally
  // re-derived, month-only range that used to ignore quarter/year/custom
  // mode and any contextual drill-down link.
  const searchParams = useSearchParams();
  const urlTransactionsContext = useMemo(
    () =>
      hasTransactionsContext(searchParams)
        ? parseTransactionsContext(searchParams)
        : null,
    [searchParams],
  );
  const effectiveRange = useMemo(
    () => resolveTransactionsEffectiveRange(dateRange, urlTransactionsContext),
    [dateRange, urlTransactionsContext],
  );
  const effectiveRangeLabel = useMemo(
    () =>
      urlTransactionsContext?.dateFrom && urlTransactionsContext?.dateTo
        ? formatDrillDownRangeLabel(
            urlTransactionsContext.dateFrom,
            urlTransactionsContext.dateTo,
          )
        : filterLabel,
    [urlTransactionsContext, filterLabel],
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  // FINANCE-DATA-1B: "Chưa có giao dịch" is a legitimate-empty-ledger
  // claim — it must not render before the transactions fetch has actually
  // SUCCEEDED at least once. `isLoadingTransactions` only ever tracks the
  // very FIRST load (flips false once, never reset on a later month
  // switch/realtime refresh) since the existing Promise.allSettled
  // fulfilled-only logic already preserves last-known-good data on any
  // later failure — this only guards the initial mount race.
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [transactionsLoadError, setTransactionsLoadError] = useState<
    string | null
  >(null);
  const [transactionReviewAcknowledgements, setTransactionReviewAcknowledgements] =
    useState<Set<string>>(new Set());

  // FINANCE-REVIEW-INBOX-2: Supabase is the durable/cross-device source.
  // Existing local keys are merged for backwards compatibility with v1.
  const reloadTransactionReviewAcknowledgements = useCallback(async () => {
    const localKeys = readTransactionReviewAcknowledgements();
    try {
      const remoteKeys = await getTransactionReviewAcknowledgementKeys();
      setTransactionReviewAcknowledgements(
        new Set([...localKeys, ...remoteKeys]),
      );
    } catch (error) {
      console.error(
        "[TransactionsPage] Failed to load durable review acknowledgements",
        error,
      );
      setTransactionReviewAcknowledgements(localKeys);
    }
  }, []);

  useEffect(() => {
    void reloadTransactionReviewAcknowledgements();
  }, [reloadTransactionReviewAcknowledgements]);

  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionDisplayFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [reviewFilters, setReviewFilters] = useState<FinanceReviewFilters>(
    DEFAULT_FINANCE_REVIEW_FILTERS,
  );

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  const [currentPage, setCurrentPage] = useState(0);
  const feedSectionRef = useRef<HTMLElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [transactionRules, setTransactionRules] = useState<TransactionRule[]>([]);
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [capturePreferences, setCapturePreferences] = useState(() =>
    createDefaultTransactionCapturePreferences(),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );

  // TXN-FLOW-1: `formSessionRef`/`formSessionState` fingerprint each
  // distinct Create/Edit modal opening — bumped only by openCreateForm/
  // openEditForm below, never by Cancel/Close (closing without opening
  // something new isn't a new session; a still-in-flight submit for the
  // just-closed form is safe to let finish normally). `handleSubmit`
  // captures the session at commit time and, once its backend result
  // comes back, compares it against the CURRENT session to decide whether
  // it may still touch the modal's UI — this is what prevents a stale
  // Form A completion from closing/resetting a newer Form B.
  //
  // `submittingSessionRef`/`submittingSessionState` track which session
  // (if any) currently has a submit in flight, keyed by session rather
  // than a single shared boolean — so a still-pending Form A submit never
  // blocks an independently-opened Form B from submitting its own, unrelated
  // mutation. `isSubmitting` (derived below) is true only when the
  // CURRENTLY DISPLAYED session is the one with a submit in flight, which
  // is what the Save button's disabled/loading state should reflect.
  const formSessionRef = useRef(0);
  const [formSessionState, setFormSessionState] = useState(0);
  const submittingSessionRef = useRef<number | null>(null);
  const [submittingSessionState, setSubmittingSessionState] = useState<
    number | null
  >(null);
  const isSubmitting = isSubmittingThisSession(
    submittingSessionState,
    formSessionState,
  );

  function beginNewFormSession() {
    const next = formSessionRef.current + 1;
    formSessionRef.current = next;
    setFormSessionState(next);
    return next;
  }
  const [toastState, setToastState] = useState<ToastPayload | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const toast = useCallback(({ variant = "info", message }: ToastPayload) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToastState({ variant, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToastState(null);
      toastTimerRef.current = null;
    }, 2600);

    if (variant === "error") {
      console.warn(message);
      return;
    }
    console.info(message);
  }, []);

  const reloadTransactionRules = useCallback(async () => {
    try {
      const rules = await getTransactionRules();
      setTransactionRules(rules);
    } catch (error) {
      console.error("[TransactionsPage] Failed to load transaction rules", error);
      // Rules are advisory. A rules read failure must never hide or invalidate
      // the canonical transaction ledger.
    }
  }, []);

  useEffect(() => {
    void reloadTransactionRules();
  }, [reloadTransactionRules]);
  // FINANCE-DATA-1: a rejected read never overwrites last-known-good state
  // with an empty array. Transactions owns only the ordinary transaction
  // ledger; investment cash history belongs exclusively to Investments.
  const reloadData = useCallback(async () => {
    const { startDate, endDate } = effectiveRange;
    const [txnsResult, catsResult, walletsResult] = await Promise.allSettled([
      getTransactionsInRange(startDate, endDate),
      getCategories(),
      getWallets(),
    ]);

    if (txnsResult.status === "fulfilled") {
      setTransactions(txnsResult.value);
      setTransactionsLoadError(null);
    } else {
      console.error(
        "[TransactionsPage] Failed to load transactions",
        txnsResult.reason,
      );
      setTransactionsLoadError(
        "Không thể tải giao dịch. Vui lòng tải lại trang.",
      );
    }
    setIsLoadingTransactions(false);

    if (catsResult.status === "fulfilled") {
      setCategories(catsResult.value);
    } else {
      console.error(
        "[TransactionsPage] Failed to load categories",
        catsResult.reason,
      );
    }

    if (walletsResult.status === "fulfilled") {
      setWallets(walletsResult.value);
    } else {
      console.error(
        "[TransactionsPage] Failed to load wallets",
        walletsResult.reason,
      );
    }
  }, [effectiveRange]);
  // ── Reload coordinator ──────────────────────────────────────────────────
  // `reloadData`'s identity changes with `effectiveRange`. `latestReloadDataRef`
  // always points at the current one so a reload that was already in flight
  // when the effective period changed still resolves its trailing/pending
  // run against the newly resolved period, never a stale one.
  const latestReloadDataRef = useRef(reloadData);
  useEffect(() => {
    latestReloadDataRef.current = reloadData;
  }, [reloadData]);

  const isReloadingRef = useRef(false);
  const hasPendingReloadRef = useRef(false);

  // Coalesces overlapping reload requests (rapid month switches, bursts of
  // realtime events from a single multi-table write) into at most one
  // trailing run, instead of firing an overlapping Promise.allSettled group
  // per request.
  const runReload = useCallback(async () => {
    if (isReloadingRef.current) {
      hasPendingReloadRef.current = true;
      return;
    }

    isReloadingRef.current = true;
    try {
      do {
        hasPendingReloadRef.current = false;
        await latestReloadDataRef.current();
      } while (hasPendingReloadRef.current);
    } finally {
      isReloadingRef.current = false;
    }
  }, []);

  const realtimeDebounceTimerRef = useRef<number | null>(null);
  const requestTransactionsRefresh = useCallback(() => {
    if (realtimeDebounceTimerRef.current) {
      window.clearTimeout(realtimeDebounceTimerRef.current);
    }
    realtimeDebounceTimerRef.current = window.setTimeout(() => {
      realtimeDebounceTimerRef.current = null;
      void runReload();
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [runReload]);

  useEffect(() => {
    return () => {
      if (realtimeDebounceTimerRef.current) {
        window.clearTimeout(realtimeDebounceTimerRef.current);
      }
    };
  }, []);

  // Initial load and every effective-period change (global filter mode/value
  // change, or a contextual drill-down navigation) trigger an immediate
  // (non-debounced) reload — Transactions must follow the effective period
  // exactly, unlike Dashboard's year-cache.
  useEffect(() => {
    void runReload();
  }, [effectiveRange, runReload]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);
  useRealtimeTable(
    ["transactions", "wallets", "categories"],
    requestTransactionsRefresh,
  );
  useRealtimeTable(["transaction_rules"], reloadTransactionRules);
  useRealtimeTable(
    ["transaction_review_acknowledgements"],
    reloadTransactionReviewAcknowledgements,
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const walletById = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet])),
    [wallets],
  );

  const activeRuleSuggestion = useMemo(() => {
    if (form.formMode === "transfer") return null;
    return evaluateTransactionRules(transactionRules, {
      type: getTransactionTypeFromFormMode(form.formMode),
      amount: Number(form.amount),
      note: form.note,
      walletId: form.walletId,
      categoryId: form.categoryId,
    });
  }, [
    form.amount,
    form.categoryId,
    form.formMode,
    form.note,
    form.walletId,
    transactionRules,
  ]);

  function applyActiveRuleSuggestion() {
    if (!activeRuleSuggestion) return;
    setForm((current) => ({
      ...current,
      ...(activeRuleSuggestion.patch.categoryId
        ? { categoryId: activeRuleSuggestion.patch.categoryId }
        : {}),
      ...(activeRuleSuggestion.patch.walletId
        ? { walletId: activeRuleSuggestion.patch.walletId }
        : {}),
    }));
  }
  const rawTransactionReviewInbox = useMemo(
    () =>
      buildFinanceReviewInbox({
        transactions,
        categories,
        limit: Number.MAX_SAFE_INTEGER,
      }),
    [categories, transactions],
  );
  const transactionReviewInbox = useMemo(
    () =>
      applyTransactionReviewAcknowledgements(
        rawTransactionReviewInbox,
        transactions,
        transactionReviewAcknowledgements,
      ),
    [
      rawTransactionReviewInbox,
      transactionReviewAcknowledgements,
      transactions,
    ],
  );
  const reviewMode = urlTransactionsContext?.review === true;
  const requestedReviewTargetId = urlTransactionsContext?.transactionId;
  const filteredReviewItems = useMemo(
    () =>
      filterFinanceReviewItems({
        items: transactionReviewInbox.items,
        transactions,
        filters: reviewFilters,
      }),
    [reviewFilters, transactionReviewInbox.items, transactions],
  );
  const reviewActiveFilterCount = countActiveFinanceReviewFilters(reviewFilters);
  const activeReviewItem =
    filteredReviewItems.find(
      (item) => item.transactionId === requestedReviewTargetId,
    ) ??
    filteredReviewItems[0] ??
    transactionReviewInbox.items.find(
      (item) => item.transactionId === requestedReviewTargetId,
    ) ??
    rawTransactionReviewInbox.items.find(
      (item) => item.transactionId === requestedReviewTargetId,
    );
  const activeReviewTransaction = activeReviewItem
    ? transactions.find(
        (transaction) => transaction.id === activeReviewItem.transactionId,
      )
    : undefined;
  const activeReviewReasons = activeReviewTransaction
    ? activeReviewItem?.reasons.filter(
        (reason) =>
          !isTransactionReviewReasonAcknowledged(
            activeReviewTransaction,
            reason,
            transactionReviewAcknowledgements,
          ),
      ) ?? []
    : [];
  const activeDuplicatePeers = activeReviewTransaction
    ? findPossibleDuplicatePeers(activeReviewTransaction, transactions)
    : [];
  const activeReviewRuleSuggestion = useMemo(() => {
    if (
      !activeReviewTransaction ||
      (activeReviewTransaction.type !== "income" &&
        activeReviewTransaction.type !== "expense")
    ) {
      return null;
    }
    return evaluateTransactionRules(transactionRules, {
      type: activeReviewTransaction.type,
      amount: Number(activeReviewTransaction.amount),
      note: activeReviewTransaction.note,
      walletId: activeReviewTransaction.walletId,
      categoryId: activeReviewTransaction.categoryId,
    });
  }, [activeReviewTransaction, transactionRules]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      // TXN-CORRECTNESS-1: defensive re-check against the actual effective
      // period (not a hardcoded "month" prefix match) — the fetch is
      // already scoped to this same range, but keeping this guard means a
      // stale-period response arriving after a newer effectiveRange has
      // already been requested (e.g. an in-flight reload racing a rapid
      // period switch) can never display as if it belonged to the new
      // period; it's simply filtered out until the new period's own fetch
      // resolves.
      const transactionDay = String(t.date ?? "").slice(0, 10);
      if (
        transactionDay < effectiveRange.startDate ||
        transactionDay > effectiveRange.endDate
      ) {
        return false;
      }
      const cat = categoryById.get(t.categoryId);
      const wal = walletById.get(t.walletId);
      const dstWal = t.transferToWalletId
        ? walletById.get(t.transferToWalletId)
        : undefined;
      const displayType = getTransactionDisplayType(t);
      const typeLabel =
        displayType === "income"
          ? "thu nhập income thu"
          : displayType === "expense"
            ? "chi tiêu expense chi"
            : "chuyển khoản chuyển tiền nội bộ transfer";
      const searchText = [
        t.note,
        cat?.name,
        wal?.name,
        dstWal?.name,
        t.date,
        typeLabel,
        String(t.amount),
        formatVND(t.amount),
      ].join(" ");
      if (typeFilter !== "all" && displayType !== typeFilter) return false;
      // TXN-UX-1: diacritic-insensitive on both sides — a plain-ASCII
      // query like "rut tien" must match "Rút tiền mặt tại ATM" without
      // the stored/displayed text itself ever changing.
      if (!matchesSearchQuery(searchText, keyword)) return false;
      if (dateFrom && transactionDay < dateFrom) return false;
      if (dateTo && transactionDay > dateTo) return false;
      if (
        walletFilter &&
        t.walletId !== walletFilter &&
        t.transferToWalletId !== walletFilter
      ) {
        return false;
      }
      if (categoryFilter && t.categoryId !== categoryFilter) return false;
      if (amountMin && t.amount < Number(amountMin)) return false;
      if (amountMax && t.amount > Number(amountMax)) return false;
      return true;
    });
  }, [
    transactions,
    effectiveRange,
    categoryById,
    walletById,
    keyword,
    typeFilter,
    dateFrom,
    dateTo,
    walletFilter,
    categoryFilter,
    amountMin,
    amountMax,
  ]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;

      if (sortKey === "date") {
        cmp = compareTransactionNewestFirst(a, b);
        return sortDir === "desc" ? cmp : -cmp;
      }

      if (sortKey === "amount") {
        cmp = a.amount - b.amount;
      } else if (sortKey === "category") {
        const ca = categoryById.get(a.categoryId)?.name ?? "";
        const cb = categoryById.get(b.categoryId)?.name ?? "";
        cmp = ca.localeCompare(cb);
      } else {
        const wa = walletById.get(a.walletId)?.name ?? "";
        const wb = walletById.get(b.walletId)?.name ?? "";
        cmp = wa.localeCompare(wb);
      }

      if (cmp === 0) return compareTransactionNewestFirst(a, b);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, categoryById, walletById]);

  const cashFlowTransactions = useMemo(
    () =>
      filtered.filter(
        (transaction) => !isInternalTransferTransaction(transaction),
      ),
    [filtered],
  );
  const totalIncome = useMemo(
    () => getTotalIncome(cashFlowTransactions),
    [cashFlowTransactions],
  );
  const realExpenseTransactions = useMemo(
    () => getRealExpenseTransactions(cashFlowTransactions, categories),
    [cashFlowTransactions, categories],
  );
  const totalExpense = useMemo(
    () =>
      realExpenseTransactions.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
    [realExpenseTransactions],
  );
  const totalLiquidity = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
    [wallets],
  );
  const netCashFlow = totalIncome - totalExpense;
  const internalTransferTurnover = useMemo(
    () =>
      filtered
        .filter((transaction) => isInternalTransferTransaction(transaction))
        .reduce(
          (sum, transaction) =>
            sum + getInternalTransferTurnoverAmount(transaction),
          0,
        ),
    [filtered],
  );
  const transferCount = useMemo(
    () =>
      filtered.filter((transaction) => isInternalTransferTransaction(transaction))
        .length,
    [filtered],
  );

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of sorted) {
      const dateKey = String(t.date ?? "").slice(0, 10);
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(t);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) =>
        sortDir === "desc" ? b.localeCompare(a) : a.localeCompare(b),
      )
      .map(([date, txns]) => ({
        date,
        txns: [...txns].sort((a, b) =>
          sortDir === "desc"
            ? compareTransactionNewestFirst(a, b)
            : -compareTransactionNewestFirst(a, b),
        ),
      }));
  }, [sorted, sortDir]);

  // Group-aware pagination: pack whole date groups into pages of roughly
  // TRANSACTIONS_PAGE_SIZE transactions. A date group is only ever split
  // across pages if a single day itself exceeds the page size, so day
  // totals (computed from a group's full txns) always stay correct.
  const groupedPages = useMemo(() => {
    const pages: typeof timelineGroups[] = [];
    let currentPageGroups: typeof timelineGroups = [];
    let currentCount = 0;

    for (const group of timelineGroups) {
      if (
        currentCount > 0 &&
        currentCount + group.txns.length > TRANSACTIONS_PAGE_SIZE
      ) {
        pages.push(currentPageGroups);
        currentPageGroups = [];
        currentCount = 0;
      }
      currentPageGroups.push(group);
      currentCount += group.txns.length;
    }
    if (currentPageGroups.length > 0) pages.push(currentPageGroups);

    return pages;
  }, [timelineGroups]);

  const totalPages = groupedPages.length;
  const safePage = Math.min(currentPage, Math.max(0, totalPages - 1));
  const visibleGroups = groupedPages[safePage] ?? [];
  const visibleCount = visibleGroups.reduce(
    (sum, group) => sum + group.txns.length,
    0,
  );
  const precedingCount = groupedPages
    .slice(0, safePage)
    .reduce(
      (sum, page) =>
        sum + page.reduce((pageSum, group) => pageSum + group.txns.length, 0),
      0,
    );
  const displayRangeStart = sorted.length === 0 ? 0 : precedingCount + 1;
  const displayRangeEnd = precedingCount + visibleCount;

  // Reset to page 1 whenever the effective period changes (global filter
  // mode/value change, or a contextual drill-down navigation — also clears
  // any stale selection from a different period's data set). Tracked with
  // useState (not useRef) for the "previous value" comparison: React's
  // ref-safety lint rule disallows reading/writing ref.current during
  // render, and calling setState conditionally during render is the
  // React-documented alternative — it still resolves within the same
  // render pass, with no extra commit versus an effect-based reset.
  const effectiveRangeKey = `${effectiveRange.startDate}_${effectiveRange.endDate}`;
  const [prevEffectiveRangeKey, setPrevEffectiveRangeKey] =
    useState(effectiveRangeKey);
  if (prevEffectiveRangeKey !== effectiveRangeKey) {
    setPrevEffectiveRangeKey(effectiveRangeKey);
    setCurrentPage(0);
    setSelectedIds(new Set());
  }

  // Reset to page 1 whenever filters/search/sort change the result shape —
  // adjusting derived state during render (not in an effect) avoids an
  // extra commit and any set-state-in-effect lint concerns.
  const filterSortResetKey = [
    keyword,
    typeFilter,
    dateFrom,
    dateTo,
    walletFilter,
    categoryFilter,
    amountMin,
    amountMax,
    sortKey,
    sortDir,
  ].join("|");
  const [prevFilterSortResetKey, setPrevFilterSortResetKey] = useState(
    filterSortResetKey,
  );
  if (prevFilterSortResetKey !== filterSortResetKey) {
    setPrevFilterSortResetKey(filterSortResetKey);
    setCurrentPage(0);
  }

  function goToPage(page: number) {
    const clamped = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(clamped);
    setSwipedId(null);
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    feedSectionRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sorted.length && sorted.length > 0)
      setSelectedIds(new Set());
    else setSelectedIds(new Set(sorted.map((t) => t.id)));
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const idsToDelete = new Set(selectedIds);

    // CROSS-DOMAIN-INTEGRITY-1: preflight the whole selection BEFORE the
    // first independently-committed delete. A Savings-owned mirror can only
    // be reconciled by the hệ thống Tiết kiệm; allowing earlier rows to commit
    // before discovering one would create an avoidable partial batch.
    const systemManagedCount = Array.from(idsToDelete).filter((id) => {
      const transaction = transactions.find((item) => item.id === id);
      return transaction
        ? isSavingsManagedTransaction(transaction) ||
            isInvestmentManagedTransaction(transaction)
        : false;
    }).length;
    if (systemManagedCount > 0) {
      toast({
        variant: "warning",
        message:
          "Không thể xóa hàng loạt vì lựa chọn có bút toán Tiết kiệm/Đầu tư do hệ thống quản lý. Hãy bỏ chọn các bút toán này và điều chỉnh tại module sở hữu.",
      });
      return;
    }

    setPendingAction({
      title: `Xóa ${count} giao dịch?`,
      description: `Hành động này không thể hoàn tác. ${count} giao dịch đã chọn sẽ bị xóa vĩnh viễn.`,
      variant: "danger",
      confirmText: "Xóa tất cả",
      onConfirm: async () => {
        // TXN-BULKDELETE-1: each iteration is its own committed RPC — the
        // batch is NOT one atomic DB transaction. So a later item failing
        // does not undo earlier successes; local state must be reconciled
        // against the database for whatever actually committed, not just
        // for a fully-successful batch.
        const succeededIds: string[] = [];
        let failureMessage: string | null = null;

        for (const id of idsToDelete) {
          const transaction = transactions.find((item) => item.id === id);
          if (transaction?.type === "transfer") {
            const balanceResult = await applyTransferWalletBalance(
              transaction,
              -1,
            );
            if (balanceResult.error) {
              failureMessage = balanceResult.error;
              break;
            }
          }
          const { error } = await deleteTransaction(id);
          if (error) {
            if (transaction?.type === "transfer") {
              await applyTransferWalletBalance(transaction, 1);
            }
            failureMessage = "Lỗi xóa giao dịch: " + error;
            break;
          }
          succeededIds.push(id);
        }

        // At least one delete actually committed — reconcile the visible
        // list and the selection against the database regardless of
        // whether the rest of the batch succeeded. A successfully-deleted
        // row must never remain visible or selected just because a later
        // item in the same batch failed.
        if (succeededIds.length > 0) {
          const succeededSet = new Set(succeededIds);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const succeededId of succeededSet) next.delete(succeededId);
            return next;
          });
          await runReload();
        }

        if (failureMessage) {
          const remaining = count - succeededIds.length;
          toast({
            variant: "error",
            message:
              succeededIds.length > 0
                ? `Đã xóa ${succeededIds.length} giao dịch. Không thể xóa ${remaining} giao dịch còn lại: ${failureMessage}`
                : failureMessage,
          });
          return;
        }

        toast({ variant: "success", message: `Đã xóa ${count} giao dịch.` });
      },
    });
  }

  function exportCSV() {
    const toExport =
      selectedIds.size > 0
        ? sorted.filter((transaction) => selectedIds.has(transaction.id))
        : sorted;
    const csv = serializeTransactionsCsv({
      transactions: toExport,
      categoryNameById: new Map(
        categories.map((category) => [category.id, category.name]),
      ),
      walletNameById: new Map(wallets.map((wallet) => [wallet.id, wallet.name])),
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "transactions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const filteredCategories = useMemo(() => {
    if (form.formMode === "income") {
      return categories.filter(
        (category) =>
          category.type === "income" &&
          getCategoryPlanningGroup(category) === "income",
      );
    }

    if (form.formMode === "expense") {
      return categories.filter((category) => {
        if (category.type !== "expense") return false;
        const group = getCategoryPlanningGroup(category);
        return group === "fixed" || group === "variable";
      });
    }

    return [];
  }, [categories, form.formMode]);

  const recentCaptureCategories = useMemo(() => {
    if (form.formMode === "transfer") return [];

    return getRecentTransactionCaptureCategoryIds(
      capturePreferences,
      form.formMode,
    ).flatMap((categoryId) => {
      const category = categoryById.get(categoryId);
      if (!category) return [];

      if (form.formMode === "income") {
        return category.type === "income" &&
          getCategoryPlanningGroup(category) === "income"
          ? [category]
          : [];
      }

      if (category.type !== "expense") return [];
      const group = getCategoryPlanningGroup(category);
      return group === "fixed" || group === "variable" ? [category] : [];
    });
  }, [capturePreferences, categoryById, form.formMode]);

  const activeSmartDefaultsSuggestion = useMemo(() => {
    if (form.id || form.formMode === "transfer" || activeRuleSuggestion) {
      return null;
    }
    if (!form.note.trim()) return null;

    const suggestion = buildTransactionSmartDefaultsSuggestion({
      transactions,
      mode: form.formMode,
      note: form.note,
      categoryId: form.categoryId,
      validCategoryIds: filteredCategories.map((category) => category.id),
      validWalletIds: wallets.map((wallet) => wallet.id),
    });
    if (!suggestion) return null;

    const alreadyApplied =
      Number(form.amount) === suggestion.amount &&
      form.categoryId === suggestion.categoryId &&
      form.walletId === suggestion.walletId;
    return alreadyApplied ? null : suggestion;
  }, [
    activeRuleSuggestion,
    filteredCategories,
    form.amount,
    form.categoryId,
    form.formMode,
    form.id,
    form.note,
    form.walletId,
    transactions,
    wallets,
  ]);

  function applyActiveSmartDefaultsSuggestion() {
    if (!activeSmartDefaultsSuggestion) return;

    setForm((current) => ({
      ...current,
      amount: String(activeSmartDefaultsSuggestion.amount),
      categoryId: activeSmartDefaultsSuggestion.categoryId,
      walletId: activeSmartDefaultsSuggestion.walletId,
    }));
    setSaveError(null);
  }

  const activeEntryConfidenceWarnings = useMemo(() => {
    const mode = form.formMode;
    if (form.id || mode === "transfer" || form.isRecurring) return [];

    const amount = Number(form.amount);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !form.categoryId ||
      !form.walletId
    ) {
      return [];
    }

    return buildTransactionEntryConfidenceWarnings({
      transactions,
      draft: {
        mode,
        amount,
        categoryId: form.categoryId,
        walletId: form.walletId,
        note: form.note,
        date: form.date,
      },
      validCategoryIds: filteredCategories.map((category) => category.id),
      validWalletIds: wallets.map((wallet) => wallet.id),
    });
  }, [
    filteredCategories,
    form.amount,
    form.categoryId,
    form.date,
    form.formMode,
    form.id,
    form.isRecurring,
    form.note,
    form.walletId,
    transactions,
    wallets,
  ]);

  const quickRepeatCandidates = useMemo(
    () => buildTransactionQuickRepeatCandidates(transactions, 3),
    [transactions],
  );

  function getEligibleCategoryIdsForMode(mode: TransactionFormMode) {
    if (mode === "transfer") return [];

    return categories
      .filter((category) => {
        if (mode === "income") {
          return (
            category.type === "income" &&
            getCategoryPlanningGroup(category) === "income"
          );
        }
        if (category.type !== "expense") return false;
        const group = getCategoryPlanningGroup(category);
        return group === "fixed" || group === "variable";
      })
      .map((category) => category.id);
  }

  function resolveCreateCaptureDefaults(mode: TransactionFormMode) {
    const preferences = readTransactionCapturePreferences();
    return {
      preferences,
      defaults: resolveTransactionCaptureDefaults({
        mode,
        preferences,
        walletIds: wallets.map((wallet) => wallet.id),
        categoryIds: getEligibleCategoryIdsForMode(mode),
      }),
    };
  }

  function openCreateFormWithMode(defaultMode: TransactionFormMode) {
    const { preferences, defaults } = resolveCreateCaptureDefaults(defaultMode);
    setCapturePreferences(preferences);
    setForm({
      ...createEmptyForm(),
      formMode: defaultMode,
      type: getTransactionTypeFromFormMode(defaultMode),
      categoryId: defaults.categoryId,
      walletId: defaults.walletId,
      transferToWalletId: defaults.transferToWalletId,
    });
    setSaveError(null);
    beginNewFormSession();
    setIsFormOpen(true);
  }

  function openCreateForm() {
    openCreateFormWithMode("expense");
  }

  function openQuickActionCreateForm(mode?: QuickActionCreateMode) {
    openCreateFormWithMode(mode === "transfer" ? "transfer" : "expense");
  }

  useQuickActionCreateIntent(openQuickActionCreateForm);
  useSuppressGlobalFabsWhileOpen(isFormOpen || isCsvImportOpen || isRulesOpen || !!pendingAction);

  // TXN-UX-1: minimal keyboard/focus support for the Create/Edit dialog —
  // installed only while it's open, cleaned up on close (no permanent
  // global listener). Escape routes through the exact same close path as
  // the visible Cancel/X button (setIsFormOpen(false)) — TXN-FLOW-1
  // already keeps Cancel/Close enabled while a submit is pending (the
  // form-session token, not a disabled Close button, is what protects a
  // stale completion from touching a newer form), so Escape needs no
  // special case for isSubmitting either. Initial focus lands on the
  // dialog panel itself (tabIndex={-1}), not a form field — this app is
  // mobile-first, and auto-focusing a text/date input would pop the
  // on-screen keyboard open every time the modal appears. On close, focus
  // returns to whatever triggered the open, guarded by a liveness check
  // since a reload after a successful save can remove/reorder rows.
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const formTriggerElementRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isFormOpen) return;

    formTriggerElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    modalPanelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setIsFormOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const trigger = formTriggerElementRef.current;
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [isFormOpen]);

  const router = useRouter();
  const pathname = usePathname();
  const appliedContextKeyRef = useRef<string | null>(null);

  // Contextual drill-down from Budgets/Wallets/Dashboard/Header: seed the
  // existing filter state from URL params once per distinct navigation.
  // Params are intentionally left in the URL (not stripped) so a refresh or
  // a copied link reproduces the same filtered view — see clearFilters()
  // for how the URL is cleaned up once the user explicitly clears filters.
  useEffect(() => {
    if (!hasTransactionsContext(searchParams)) return;

    const parsed = parseTransactionsContext(searchParams);
    const key = JSON.stringify(parsed);
    if (appliedContextKeyRef.current === key) return;
    appliedContextKeyRef.current = key;

    const timer = window.setTimeout(() => {
      if (parsed.walletId) setWalletFilter(parsed.walletId);
      if (parsed.categoryId) setCategoryFilter(parsed.categoryId);
      if (parsed.dateFrom) setDateFrom(parsed.dateFrom);
      if (parsed.dateTo) setDateTo(parsed.dateTo);
      if (parsed.type) setTypeFilter(parsed.type);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  function openReviewTarget(transactionId?: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("review", "1");
    if (transactionId) next.set("transactionId", transactionId);
    else next.delete("transactionId");
    router.replace(pathname + "?" + next.toString(), { scroll: false });
  }

  function closeReviewWorkspace() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("review");
    next.delete("transactionId");
    const query = next.toString();
    router.replace(query ? pathname + "?" + query : pathname, { scroll: false });
  }

  async function acknowledgeReviewReason(
    targetTransactions: Transaction[],
    reason: FinanceReviewReason,
  ) {
    const result = await acknowledgeTransactionReviewReasons(
      targetTransactions.map((transaction) => ({ transaction, reason })),
    );
    if (result.error) {
      toast({ variant: "error", message: result.error });
      return false;
    }

    setTransactionReviewAcknowledgements((current) => {
      const next = new Set(current);
      for (const transaction of targetTransactions) {
        next.add(buildTransactionReviewAcknowledgementKey(transaction, reason));
      }
      // Keep the v1 local cache as an offline/backwards-compatible mirror.
      persistTransactionReviewAcknowledgements(next);
      return next;
    });
    return true;
  }

  // TRANSACTION-REVIEW-WORKFLOW-1: keep one canonical updateTransaction
  // call site. Both the CRUD form and review quick-categorise flow route
  // through this helper so TXN-FLOW-1 mutation safety remains centralized.
  async function persistTransactionUpdate(transaction: Transaction) {
    return updateTransaction(transaction);
  }

  async function handleReviewCategoryChange(
    transaction: Transaction,
    categoryId: string,
  ) {
    if (
      !categoryId ||
      isSavingsManagedTransaction(transaction) ||
      isInvestmentManagedTransaction(transaction)
    ) {
      return;
    }
    const category = categories.find((item) => item.id === categoryId);
    if (!category || category.type !== transaction.type) {
      toast({
        variant: "warning",
        message: "Danh mục không phù hợp với loại giao dịch.",
      });
      return;
    }
    const { error } = await persistTransactionUpdate({
      ...transaction,
      categoryId,
    });
    if (error) {
      toast({ variant: "error", message: error });
      return;
    }
    await runReload();
    toast({ variant: "success", message: "Đã phân loại giao dịch." });
  }

  async function handleKeepDuplicateGroup(transaction: Transaction) {
    const peers = findPossibleDuplicatePeers(transaction, transactions);
    if (
      !(await acknowledgeReviewReason(
        [transaction, ...peers],
        "possible-duplicate",
      ))
    ) {
      return;
    }
    toast({
      variant: "success",
      message: "Đã xác nhận giữ các giao dịch này.",
    });
  }

  async function handleMarkUnusualNormal(transaction: Transaction) {
    if (
      !(await acknowledgeReviewReason([transaction], "unusual-expense"))
    ) {
      return;
    }
    toast({
      variant: "success",
      message: "Đã xác nhận khoản chi này là bình thường.",
    });
  }

  async function handleApplyReviewRuleSuggestion() {
    if (!activeReviewTransaction || !activeReviewRuleSuggestion) return;
    if (
      isSavingsManagedTransaction(activeReviewTransaction) ||
      isInvestmentManagedTransaction(activeReviewTransaction)
    ) {
      return;
    }

    const { error } = await persistTransactionUpdate({
      ...activeReviewTransaction,
      ...(activeReviewRuleSuggestion.patch.categoryId
        ? { categoryId: activeReviewRuleSuggestion.patch.categoryId }
        : {}),
      ...(activeReviewRuleSuggestion.patch.walletId
        ? { walletId: activeReviewRuleSuggestion.patch.walletId }
        : {}),
    });
    if (error) {
      toast({ variant: "error", message: error });
      return;
    }
    await runReload();
    toast({
      variant: "success",
      message: `Đã áp dụng quy tắc ${activeReviewRuleSuggestion.rule.name}.`,
    });
  }

  function openEditForm(t: Transaction) {
    if (isInvestmentManagedTransaction(t)) {
      toast({
        variant: "info",
        message:
          "Bút toán này thuộc hệ thống Đầu tư và không thể sửa riêng từ Giao dịch. Hãy dùng Nạp vốn hoặc Rút vốn tại trang Đầu tư.",
      });
      return;
    }
    if (isSavingsManagedTransaction(t)) {
      toast({
        variant: "info",
        message:
          "Bút toán này thuộc hệ thống Tiết kiệm và không thể sửa riêng từ Giao dịch. Hãy tạo giao dịch bù hoặc tất toán tại trang Tiết kiệm.",
      });
      return;
    }

    const formMode = getTransactionFormMode(t, categories);

    setForm({
      id: t.id,
      type: getTransactionTypeFromFormMode(formMode),
      formMode,
      amount: String(t.amount),
      categoryId: t.categoryId,
      walletId: t.walletId,
      transferToWalletId: t.transferToWalletId ?? "",
      note: t.note,
      date: t.date,
      isRecurring: t.isRecurring ?? false,
      recurrence: t.recurrence ?? "monthly",
      nextRunDate: t.nextRunDate ?? "",
    });
    setSaveError(null);
    beginNewFormSession();
    setIsFormOpen(true);
  }

  function openDuplicateForm(t: Transaction) {
    if (isInvestmentManagedTransaction(t)) {
      toast({
        variant: "info",
        message:
          "Bút toán dòng vốn Đầu tư được quản lý tại trang Đầu tư và không thể nhân bản từ Giao dịch.",
      });
      return;
    }
    if (isSavingsManagedTransaction(t)) {
      toast({
        variant: "info",
        message:
          "Bút toán Tiết kiệm được quản lý tại trang Tiết kiệm và không thể nhân bản từ Giao dịch.",
      });
      return;
    }

    const formMode = getTransactionFormMode(t, categories);
    const { preferences, defaults } = resolveCreateCaptureDefaults(formMode);
    const eligibleCategoryIds = new Set(getEligibleCategoryIdsForMode(formMode));
    const walletId = wallets.some((wallet) => wallet.id === t.walletId)
      ? t.walletId
      : defaults.walletId;
    const transferToWalletId =
      formMode === "transfer" &&
      t.transferToWalletId &&
      t.transferToWalletId !== walletId &&
      wallets.some((wallet) => wallet.id === t.transferToWalletId)
        ? t.transferToWalletId
        : defaults.transferToWalletId;

    setCapturePreferences(preferences);
    setForm({
      ...createEmptyForm(),
      formMode,
      type: getTransactionTypeFromFormMode(formMode),
      amount: String(t.amount),
      categoryId:
        formMode === "transfer"
          ? ""
          : eligibleCategoryIds.has(t.categoryId)
            ? t.categoryId
            : defaults.categoryId,
      walletId,
      transferToWalletId,
      note: t.note,
      date: getLocalDateInputValue(),
      isRecurring: false,
      recurrence: "monthly",
      nextRunDate: "",
    });
    setSaveError(null);
    beginNewFormSession();
    setIsFormOpen(true);
  }

  function handleTypeChange(mode: TransactionFormMode) {
    const nextType = getTransactionTypeFromFormMode(mode);
    const { preferences, defaults } = resolveCreateCaptureDefaults(mode);

    if (!form.id) setCapturePreferences(preferences);
    setForm((prev) => ({
      ...prev,
      formMode: mode,
      type: nextType,
      categoryId: defaults.categoryId,
      walletId: prev.id ? prev.walletId : defaults.walletId,
      transferToWalletId:
        mode === "transfer"
          ? prev.id
            ? prev.transferToWalletId === prev.walletId
              ? ""
              : prev.transferToWalletId
            : defaults.transferToWalletId
          : "",
    }));
    setSaveError(null);
  }

  async function restoreWalletSnapshots(_walletSnapshots?: Wallet[]) {
    void _walletSnapshots;
    // Finance Engine v2 owns all wallet balance rollback.
    // Kept as a no-op so older save/delete flows do not double-apply balances.
  }

  async function applyTransferWalletBalance(
    _transaction: Transaction,
    _direction: 1 | -1,
  ) {
    void _transaction;
    void _direction;
    // Finance Engine v2 applies transfer effects inside add/update/deleteTransaction.
    // The UI should never mutate wallet balances before calling storage methods.
    return { error: null as string | null, previousWallets: [] as Wallet[] };
  }

  async function replaceTransferWalletBalance(
    _oldTransaction: Transaction | undefined,
    _nextTransaction: Transaction,
  ) {
    void _oldTransaction;
    void _nextTransaction;
    // Finance Engine v2 reverses the old transaction and applies the new one.
    return { error: null as string | null, previousWallets: [] as Wallet[] };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // TXN-FLOW-1: checked synchronously (a ref, not state) so two clicks
    // landing before React re-renders the disabled Save button still can't
    // both cross this line — only the first ever proceeds.
    if (isSubmittingThisSession(submittingSessionRef.current, formSessionRef.current))
      return;

    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      setSaveError("Vui lòng nhập số tiền hợp lệ");
      return;
    }
    const transactionType = getTransactionTypeFromFormMode(form.formMode);
    const isWalletTransferForm = form.formMode === "transfer";

    if (isWalletTransferForm) {
      if (!form.walletId) {
        setSaveError("Vui lòng chọn ví nguồn");
        return;
      }
      if (!form.transferToWalletId) {
        setSaveError("Vui lòng chọn ví đích");
        return;
      }
      if (form.walletId === form.transferToWalletId) {
        setSaveError("Ví nguồn và ví đích phải khác nhau");
        return;
      }
      const sourceWallet = wallets.find(
        (wallet) => wallet.id === form.walletId,
      );
      const editingTransaction = form.id
        ? transactions.find((transaction) => transaction.id === form.id)
        : undefined;
      const availableBalance =
        (sourceWallet?.balance ?? 0) +
        (editingTransaction &&
        isInternalTransferTransaction(editingTransaction) &&
        editingTransaction.walletId === form.walletId
          ? editingTransaction.amount
          : 0);
      if (sourceWallet && availableBalance < amount) {
        setSaveError("Ví nguồn không đủ số dư để chuyển tiền");
        return;
      }
    } else {
      if (!form.categoryId) {
        setSaveError("Vui lòng chọn danh mục");
        return;
      }
      if (!form.walletId) {
        setSaveError("Vui lòng chọn ví tiền");
        return;
      }
    }

    if (form.isRecurring && !form.nextRunDate) {
      setSaveError("Vui lòng chọn ngày chạy tiếp theo");
      return;
    }

    const transferReferenceType = isWalletTransferForm ? "wallet" : "";
    const sourceType = isWalletTransferForm ? "wallet" : "";
    const destinationType = isWalletTransferForm ? "wallet" : "";

    const transaction: Transaction & Record<string, unknown> = {
      id: form.id ?? crypto.randomUUID(),
      type: transactionType,
      amount,
      categoryId: isWalletTransferForm ? "" : form.categoryId,
      walletId: form.walletId,
      transferToWalletId: isWalletTransferForm
        ? form.transferToWalletId
        : form.transferToWalletId || undefined,
      note:
        form.note || (isWalletTransferForm ? "Chuyển tiền" : "Giao dịch mới"),
      date: form.date,
      isRecurring: form.isRecurring || undefined,
      // Paused legacy schedules keep recurrence/date metadata. Clearing the
      // schedule is an explicit action in /recurring, never a side effect of
      // editing the historical transaction.
      recurrence:
        form.isRecurring || form.nextRunDate ? form.recurrence : undefined,
      nextRunDate: form.nextRunDate || undefined,
      ...(transferReferenceType
        ? {
            transferReferenceType,
            sourceType,
            destinationType,
            // Keep snake_case keys as well because Supabase rows use snake_case
            // while the app view model mostly uses camelCase.
            transfer_reference_type: transferReferenceType,
            source_type: sourceType,
            destination_type: destinationType,
          }
        : {}),
    };
    setSaveError(null);
    const oldTransaction = form.id
      ? transactions.find((item) => item.id === form.id)
      : undefined;

    // TXN-FLOW-1: from here on this submit "crosses the mutation boundary".
    // `submittedSession` is this call's form-session fingerprint, captured
    // before any await — if a NEWER form (Create/Edit) opens before this
    // submit's backend result comes back, formSessionRef.current will have
    // moved on, and every step below treats its own result as stale: a
    // genuine backend write still gets reflected via runReload() (that
    // part is real and safe to show regardless of which form is open now),
    // but a stale result must never close/reset the newer form or show a
    // toast/error that could be misread as belonging to it.
    const submittedSession = formSessionRef.current;
    submittingSessionRef.current = submittedSession;
    setSubmittingSessionState(submittedSession);

    try {
      let balanceResult:
        | { error: string | null; previousWallets: Wallet[] }
        | undefined;

      if (isWalletTransferForm) {
        balanceResult = form.id
          ? await replaceTransferWalletBalance(oldTransaction, transaction)
          : await applyTransferWalletBalance(transaction, 1);
        if (balanceResult.error) {
          if (isSessionStillCurrent(submittedSession, formSessionRef.current)) {
            setSaveError(balanceResult.error);
            toast({ variant: "error", message: balanceResult.error });
          } else {
            console.error(
              "[TransactionsPage] stale submit's balance check failed:",
              balanceResult.error,
            );
          }
          return;
        }
      }

      const { error } = form.id
        ? await persistTransactionUpdate(transaction)
        : await addTransaction(transaction);
      if (error) {
        if (isWalletTransferForm) {
          await restoreWalletSnapshots(balanceResult?.previousWallets);
        }
        if (isSessionStillCurrent(submittedSession, formSessionRef.current)) {
          setSaveError(error);
          toast({ variant: "error", message: error });
        } else {
          console.error("[TransactionsPage] stale submit failed:", error);
        }
        return;
      }

      // The write genuinely reached the backend — always refresh
      // authoritative data, even if this submit's own form session is now
      // stale (a real change happened and must not be left stale-hidden).
      await runReload();

      if (!isSessionStillCurrent(submittedSession, formSessionRef.current)) {
        // Stale success: a newer form is open now. Do not touch its UI or
        // show a success toast that could be misread as describing it.
        return;
      }

      if (!form.id) {
        const nextCapturePreferences = rememberTransactionCaptureSuccess(
          readTransactionCapturePreferences(),
          {
            mode: form.formMode,
            walletId: form.walletId,
            categoryId: form.categoryId,
            transferToWalletId: form.transferToWalletId,
          },
        );
        persistTransactionCapturePreferences(nextCapturePreferences);
        setCapturePreferences(nextCapturePreferences);
      }

      // A newly created transaction sorts to the top only under the default
      // newest-first view — jump to page 1 there so the user sees it without
      // extra clicks. Leave the page alone under any other sort/filter, since
      // we can't assume where the new row landed.
      if (!form.id && sortKey === "date" && sortDir === "desc") {
        setCurrentPage(0);
      }
      toast({
        variant: "success",
        message: form.id
          ? "Đã cập nhật giao dịch thành công."
          : "Đã thêm giao dịch thành công.",
      });
      setIsFormOpen(false);
      setForm(createEmptyForm());
    } finally {
      // Only release the in-flight flag if it's still ours — a stale
      // completion must never clear a NEWER session's own legitimately
      // in-flight submit.
      if (submittingSessionRef.current === submittedSession) {
        submittingSessionRef.current = null;
        setSubmittingSessionState(null);
      }
    }
  }

  function handleDelete(id: string) {
    const managedTransaction = transactions.find(
      (item) =>
        item.id === id &&
        (isSavingsManagedTransaction(item) ||
          isInvestmentManagedTransaction(item)),
    );
    if (managedTransaction) {
      const isInvestment =
        isInvestmentManagedTransaction(managedTransaction);
      toast({
        variant: "warning",
        message: isInvestment
          ? "Không thể xóa riêng dòng vốn Đầu tư từ Giao dịch vì sẽ làm lệch ví và vốn đầu tư. Hãy điều chỉnh tại trang Đầu tư."
          : "Không thể xóa riêng bút toán Tiết kiệm từ Giao dịch vì sẽ làm lệch số dư Tiết kiệm. Hãy tạo giao dịch bù hoặc tất toán tại trang Tiết kiệm.",
      });
      return;
    }

    setPendingAction({
      title: "Xóa giao dịch?",
      description:
        "Hành động này không thể hoàn tác. Dữ liệu sẽ bị xóa khỏi tài khoản của bạn.",
      variant: "danger",
      onConfirm: async () => {
        const transaction = transactions.find((item) => item.id === id);
        let balanceResult:
          | { error: string | null; previousWallets: Wallet[] }
          | undefined;
        if (transaction?.type === "transfer") {
          balanceResult = await applyTransferWalletBalance(transaction, -1);
          if (balanceResult.error) {
            toast({ variant: "error", message: balanceResult.error });
            return;
          }
        }

        const { error } = await deleteTransaction(id);
        if (error) {
          if (transaction?.type === "transfer") {
            await restoreWalletSnapshots(balanceResult?.previousWallets);
          }
          toast({ variant: "error", message: "Lỗi xóa giao dịch: " + error });
          return;
        }
        toast({ variant: "success", message: "Đã xóa giao dịch thành công." });
        await runReload();
      },
    });
  }

  function clearFilters() {
    setKeyword("");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setWalletFilter("");
    setCategoryFilter("");
    setAmountMin("");
    setAmountMax("");

    // Clearing filters that arrived via a contextual drill-down must also
    // drop those params from the URL — otherwise a refresh would silently
    // re-apply a filter the user just turned off.
    if (hasTransactionsContext(searchParams)) {
      appliedContextKeyRef.current = null;
      router.replace(pathname, { scroll: false });
    }
  }

  const hasActiveFilters = !!(
    keyword ||
    typeFilter !== "all" ||
    dateFrom ||
    dateTo ||
    walletFilter ||
    categoryFilter ||
    amountMin ||
    amountMax
  );
  const activeFilterCount = [
    dateFrom,
    dateTo,
    walletFilter,
    categoryFilter,
    amountMin,
    amountMax,
  ].filter(Boolean).length;
  const cashFlowMarginRate =
    totalIncome > 0
      ? Math.round((Math.max(0, netCashFlow) / totalIncome) * 100)
      : 0;

  const modalAmount = Number(form.amount) || 0;
  const selectedWallet = wallets.find((wallet) => wallet.id === form.walletId);
  const destinationWallet = wallets.find(
    (wallet) => wallet.id === form.transferToWalletId,
  );
  const walletBefore = selectedWallet?.balance ?? 0;
  const destinationWalletBefore = destinationWallet?.balance ?? 0;
  const isWalletDecrease =
    form.formMode === "expense" || form.formMode === "transfer";
  const walletAfter =
    form.formMode === "income"
      ? walletBefore + modalAmount
      : isWalletDecrease
        ? walletBefore - modalAmount
        : walletBefore;
  const destinationWalletAfter =
    form.formMode === "transfer"
      ? destinationWalletBefore + modalAmount
      : destinationWalletBefore;
  const canShowWalletPreview = !!selectedWallet && modalAmount > 0;
  const amountQuickActions = [50000, 100000, 200000, 500000, 1000000];
  const modalAccent =
    form.formMode === "income"
      ? {
          bg: "bg-emerald-500",
          bgHover: "hover:bg-emerald-600",
          text: "text-emerald-600",
          soft: "bg-emerald-50",
          border: "border-emerald-200",
          focus: "focus-within:border-emerald-400",
          shadow: "shadow-emerald-200",
        }
      : form.formMode === "transfer"
        ? {
            bg: "bg-blue-600",
            bgHover: "hover:bg-blue-700",
            text: "text-blue-600",
            soft: "bg-blue-50",
            border: "border-blue-200",
            focus: "focus-within:border-blue-400",
            shadow: "shadow-blue-200",
          }
        : {
            bg: "bg-rose-500",
            bgHover: "hover:bg-rose-600",
            text: "text-rose-600",
            soft: "bg-rose-50",
            border: "border-rose-200",
            focus: "focus-within:border-rose-400",
            shadow: "shadow-rose-200",
          };

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 overflow-x-hidden md:space-y-5">
      {toastState && (
        <div
          className={[
            "fixed right-4 top-4 z-120 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur sm:right-6 sm:top-6 sm:max-w-md",
            toastState.variant === "error"
              ? "border-rose-200 bg-rose-50/95 text-rose-700 shadow-rose-100"
              : toastState.variant === "warning"
                ? "border-amber-200 bg-amber-50/95 text-amber-700 shadow-amber-100"
                : toastState.variant === "success"
                  ? "border-emerald-200 bg-emerald-50/95 text-emerald-700 shadow-emerald-100"
                  : "border-blue-200 bg-blue-50/95 text-blue-700 shadow-blue-100",
          ].join(" ")}
          role="status"
          aria-live="polite"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70">
            {toastState.variant === "success"
              ? "✓"
              : toastState.variant === "error"
                ? "!"
                : "i"}
          </span>
          <span className="leading-5">{toastState.message}</span>
          <button
            type="button"
            onClick={() => setToastState(null)}
            className="-mr-1 rounded-full p-1 text-current/70 transition hover:bg-white/70 hover:text-current"
            aria-label="Đóng thông báo"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {/* SECTION 1 · Transaction Summary */}
      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-5">
        <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-center xl:justify-between xl:gap-5">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.16em] text-blue-500 sm:text-[11px] sm:tracking-[0.18em]">
              Trung tâm giao dịch
            </p>
            <h1 className="mt-0.5 whitespace-nowrap text-2xl font-black tracking-tight text-slate-900 sm:mt-1 sm:text-3xl">
              Giao dịch
            </h1>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-slate-500 sm:mt-1 sm:line-clamp-none sm:text-sm">
              {hasActiveFilters
                ? `Đang hiển thị các giao dịch phù hợp với bộ lọc trong ${effectiveRangeLabel}.`
                : `Tổng quan thu, chi và chuyển tiền trong ${effectiveRangeLabel}.`}
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="flex min-h-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-blue-200/60 transition hover:bg-blue-700 active:scale-[.98] sm:py-3 sm:shadow-lg xl:w-auto"
          >
            <Plus size={16} />
            Thêm giao dịch
          </button>
        </div>

        {!reviewMode &&
        !isLoadingTransactions &&
        !transactionsLoadError &&
        quickRepeatCandidates.length > 0 ? (
          <div
            data-transaction-quick-repeat="true"
            className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/55 p-2.5 sm:mt-4 sm:p-3"
          >
            <div className="flex items-center justify-between gap-3 px-0.5">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-cyan-800 sm:text-xs">
                  Ghi lại nhanh
                </p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-cyan-700/70 sm:text-[11px]">
                  Các giao dịch xuất hiện ít nhất 2 lần trong kỳ này.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-black text-cyan-700 ring-1 ring-cyan-100">
                {quickRepeatCandidates.length} gợi ý
              </span>
            </div>

            <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              {quickRepeatCandidates.map((candidate) => {
                const transaction = candidate.transaction;
                const displayType = getTransactionDisplayType(transaction);
                const category = categoryById.get(transaction.categoryId);
                const wallet = walletById.get(transaction.walletId);
                const destinationWallet = transaction.transferToWalletId
                  ? walletById.get(transaction.transferToWalletId)
                  : undefined;
                const detail =
                  displayType === "transfer"
                    ? getTransferWalletLabel(
                        transaction,
                        wallet?.name,
                        destinationWallet?.name,
                      ).title
                    : `${category?.name ?? "—"} · ${wallet?.name ?? "—"}`;
                const note = getTransactionDisplayNote(transaction);

                return (
                  <button
                    key={candidate.key}
                    type="button"
                    onClick={() => openDuplicateForm(transaction)}
                    aria-label={`Ghi lại ${note} hôm nay`}
                    className="min-h-16 w-60 shrink-0 rounded-2xl border border-cyan-100 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-xs font-black text-slate-800">
                        {note}
                      </span>
                      <span className="shrink-0 rounded-full bg-cyan-50 px-1.5 py-0.5 text-[9px] font-black text-cyan-700">
                        {candidate.occurrences} lần
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] font-semibold text-slate-400">
                      {detail}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="whitespace-nowrap text-xs font-black text-slate-700">
                        {formatVND(transaction.amount)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-cyan-700">
                        <CopyPlus size={12} /> Ghi hôm nay
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-3 sm:mt-4">
          <LiquidityHeroCard
            value={formatVND(totalLiquidity)}
            walletCount={wallets.length}
            netCashFlow={netCashFlow}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 xl:grid-cols-4">
          <SummaryCard
            label="Thu nhập"
            value={formatVND(totalIncome)}
            note={`${cashFlowTransactions.filter((item) => item.type === "income").length} giao dịch`}
            footerLabel="Dòng tiền kỳ này"
            footerValue={getSignedAmountText(netCashFlow)}
            hideFooterValueOnMobile
            tone="income"
          />

          <SummaryCard
            label="Chi tiêu"
            value={formatVND(totalExpense)}
            note={`${realExpenseTransactions.length} giao dịch`}
            footerLabel="Tỷ lệ chi tiêu / Thu nhập"
            mobileFooterLabel="Tỷ lệ chi / thu"
            footerValue={
              totalIncome > 0
                ? `${Math.round((totalExpense / totalIncome) * 100)}%`
                : "0%"
            }
            tone="expense"
          />

          <SummaryCard
            label="Dòng tiền ròng"
            value={getSignedAmountText(netCashFlow)}
            note={netCashFlow >= 0 ? "Thu lớn hơn chi" : "Chi lớn hơn thu"}
            footerLabel="Dư sau chi / Thu nhập"
            footerValue={`${cashFlowMarginRate}%`}
            tone={netCashFlow >= 0 ? "positive" : "negative"}
          />

          <SummaryCard
            label="Chuyển nội bộ"
            value={formatVND(internalTransferTurnover)}
            note={`${transferCount} giao dịch`}
            footerLabel="Ảnh hưởng thu chi"
            footerValue="Không"
            tone="transfer"
          />
        </div>
      </section>

      {reviewMode && (
        <section
          data-transaction-review-workflow="true"
          className="overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm sm:rounded-4xl"
        >
          <div className="flex flex-col gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">Quy trình rà soát</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">Rà soát giao dịch</h2>
              <p className="mt-1 text-xs text-slate-500">
                Còn {transactionReviewInbox.total} giao dịch cần xử lý trong kỳ đang xem.
              </p>
            </div>
            <button
              type="button"
              onClick={closeReviewWorkspace}
              className="min-h-10 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-50"
            >
              Đóng rà soát
            </button>
          </div>

          {/* FINANCE-REVIEW-INBOX-2: durable-review-workspace */}
          {transactionReviewInbox.total > 0 ? (
            <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-6">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Mức độ
                  </span>
                  <select
                    value={reviewFilters.severity}
                    onChange={(event) =>
                      setReviewFilters((current) => ({
                        ...current,
                        severity: event.target.value as FinanceReviewFilters["severity"],
                      }))
                    }
                    className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="all">Tất cả</option>
                    <option value="high">Ưu tiên cao</option>
                    <option value="action">Cần xử lý</option>
                    <option value="info">Theo dõi</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Lý do
                  </span>
                  <select
                    value={reviewFilters.reason}
                    onChange={(event) =>
                      setReviewFilters((current) => ({
                        ...current,
                        reason: event.target.value as FinanceReviewFilters["reason"],
                      }))
                    }
                    className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="all">Tất cả</option>
                    <option value="category-type-mismatch">Sai loại danh mục</option>
                    <option value="uncategorized">Chưa phân loại</option>
                    <option value="possible-duplicate">Có thể trùng</option>
                    <option value="unusual-expense">Chi tiêu bất thường</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Ví
                  </span>
                  <select
                    value={reviewFilters.walletId}
                    onChange={(event) =>
                      setReviewFilters((current) => ({
                        ...current,
                        walletId: event.target.value,
                      }))
                    }
                    className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="">Tất cả ví</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Danh mục
                  </span>
                  <select
                    value={reviewFilters.categoryId}
                    onChange={(event) =>
                      setReviewFilters((current) => ({
                        ...current,
                        categoryId: event.target.value,
                      }))
                    }
                    className="min-h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none"
                  >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold text-slate-500">
                  Hiển thị {filteredReviewItems.length}/{transactionReviewInbox.total} giao dịch
                  {reviewActiveFilterCount > 0
                    ? ` · ${reviewActiveFilterCount} bộ lọc`
                    : ""}
                </p>
                {reviewActiveFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setReviewFilters(DEFAULT_FINANCE_REVIEW_FILTERS)
                    }
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-blue-600 hover:bg-blue-50"
                  >
                    Xóa lọc
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {transactionReviewInbox.total === 0 ? (
            <div className="p-5 text-center sm:p-6">
              <p className="text-base font-black text-emerald-700">Hàng đợi đã xử lý xong</p>
              <p className="mt-1 text-sm text-slate-500">Không còn giao dịch cần rà soát theo các quy tắc hiện tại.</p>
            </div>
          ) : filteredReviewItems.length === 0 ? (
            <div className="p-5 text-center sm:p-6">
              <p className="text-base font-black text-slate-700">
                Không có giao dịch khớp bộ lọc
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Xóa hoặc đổi bộ lọc để xem các việc rà soát còn lại.
              </p>
            </div>
          ) : activeReviewTransaction && activeReviewItem ? (
            <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {activeReviewReasons.map((reason) => (
                    <span
                      key={reason}
                      className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-100"
                    >
                      {getTransactionReviewReasonLabel(reason)}
                    </span>
                  ))}
                </div>
                <div className="mt-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                    {getFinanceReviewSeverityLabel(
                      getFinanceReviewSeverity(activeReviewReasons),
                    )}
                  </span>
                </div>
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-900">{getTransactionDisplayNote(activeReviewTransaction)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatTransactionDayLabel(activeReviewTransaction.date)} · {walletById.get(activeReviewTransaction.walletId)?.name ?? "—"}
                      </p>
                    </div>
                    <p className="shrink-0 text-base font-black tabular-nums text-slate-800">{formatVND(activeReviewTransaction.amount)}</p>
                  </div>
                </div>

                {activeReviewRuleSuggestion ? (
                  <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                          Đề xuất theo quy tắc
                        </p>
                        <p className="mt-1 truncate text-sm font-black text-slate-800">
                          {activeReviewRuleSuggestion.rule.name}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {activeReviewRuleSuggestion.patch.categoryId
                            ? `Danh mục → ${categoryById.get(activeReviewRuleSuggestion.patch.categoryId)?.name ?? "Danh mục"}`
                            : ""}
                          {activeReviewRuleSuggestion.patch.categoryId &&
                          activeReviewRuleSuggestion.patch.walletId
                            ? " · "
                            : ""}
                          {activeReviewRuleSuggestion.patch.walletId
                            ? `Ví → ${walletById.get(activeReviewRuleSuggestion.patch.walletId)?.name ?? "Ví"}`
                            : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleApplyReviewRuleSuggestion()}
                        className="min-h-10 shrink-0 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white transition hover:bg-violet-700"
                      >
                        Áp dụng gợi ý
                      </button>
                    </div>
                  </div>
                ) : null}
                {(activeReviewReasons.includes("uncategorized") ||
                  activeReviewReasons.includes("category-type-mismatch")) && (
                  <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                    <p className="text-sm font-black text-slate-800">
                      {activeReviewReasons.includes("category-type-mismatch")
                        ? "Danh mục hiện tại không phù hợp loại giao dịch"
                        : "Chọn danh mục đúng"}
                    </p>
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        const categoryId = event.target.value;
                        if (categoryId)
                          void handleReviewCategoryChange(
                            activeReviewTransaction,
                            categoryId,
                          );
                      }}
                      className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-400"
                    >
                      <option value="">Chọn danh mục…</option>
                      {categories
                        .filter(
                          (category) =>
                            category.type === activeReviewTransaction.type,
                        )
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {activeReviewReasons.includes("possible-duplicate") && (
                  <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-slate-800">So sánh giao dịch có thể trùng</p>
                      <button
                        type="button"
                        onClick={() =>
                          void handleKeepDuplicateGroup(activeReviewTransaction)
                        }
                        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700"
                      >
                        Giữ tất cả
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {[activeReviewTransaction, ...activeDuplicatePeers].map(
                        (peer) => (
                          <div
                            key={peer.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-slate-700">{getTransactionDisplayNote(peer)}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400">{peer.date} · {formatVND(peer.amount)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDelete(peer.id)}
                              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-black text-rose-600 transition hover:bg-rose-50"
                            >
                              Xóa bản này
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {activeReviewReasons.includes("unusual-expense") && (
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-rose-100 bg-rose-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-800">Khoản chi cao hơn mức thường thấy</p>
                      <p className="mt-1 text-xs text-slate-500">Nếu đây là khoản hợp lệ, xác nhận để bỏ khỏi hàng đợi rà soát.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleMarkUnusualNormal(activeReviewTransaction)
                      }
                      className="min-h-10 shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50"
                    >
                      Đây là khoản bình thường
                    </button>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(activeReviewTransaction)}
                    className="min-h-10 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    Sửa giao dịch
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(activeReviewTransaction.id)}
                    className="min-h-10 rounded-xl border border-rose-200 px-3 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50"
                  >
                    Xóa giao dịch này
                  </button>
                </div>
              </div>

              <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Hàng đợi</p>
                <div className="mt-2 space-y-1.5">
                  {filteredReviewItems.slice(0, 8).map((item, index) => (
                    <button
                      key={item.transactionId}
                      type="button"
                      onClick={() => openReviewTarget(item.transactionId)}
                      className={[
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition",
                        item.transactionId === activeReviewTransaction.id
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-700 hover:bg-blue-50",
                      ].join(" ")}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-black text-blue-700">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">{item.title}</span>
                      <span className="shrink-0 text-[9px] font-black opacity-70">
                        {getFinanceReviewSeverity(item.reasons) === "high"
                          ? "CAO"
                          : getFinanceReviewSeverity(item.reasons) === "action"
                            ? "XỬ LÝ"
                            : "THEO DÕI"}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 px-1 text-[10px] leading-4 text-slate-400">
                  “Giữ tất cả” và “Khoản bình thường” được ghi nhớ trên thiết bị này. Nếu nội dung giao dịch thay đổi, xác nhận cũ tự hết hiệu lực.
                </p>
              </aside>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">Đang tải giao dịch cần rà soát…</div>
          )}
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 · Smart Filter Command Bar
          ════════════════════════════════════════════════════════════════════ */}
      <div className="relative z-20">
        <div className="rounded-3xl border border-slate-200 bg-white/95 shadow-md shadow-slate-200/80 backdrop-blur-md sm:rounded-4xl">
          {/* Main bar */}
          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5 sm:py-3.5">
            {/* Search */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 transition-all focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-sm">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm giao dịch, danh mục, ví tiền..."
                aria-label="Tìm kiếm giao dịch"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {keyword && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                    {sorted.length}
                  </span>
                  <button
                    onClick={() => setKeyword("")}
                    aria-label="Xóa tìm kiếm"
                    className="text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Type filter pills — color-coded */}
            <div className="grid w-full grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:w-auto sm:flex sm:max-w-full sm:gap-0.5 sm:overflow-x-auto sm:scrollbar-none">
              {(["all", "income", "expense", "transfer"] as const).map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={
                      "min-h-11 shrink-0 whitespace-nowrap rounded-xl px-2 py-2 text-xs font-bold transition-all duration-150 sm:min-h-0 sm:px-3 sm:py-1.5 " +
                      (typeFilter === t
                        ? t === "income"
                          ? "bg-emerald-500 text-white shadow-sm"
                          : t === "expense"
                            ? "bg-rose-500 text-white shadow-sm"
                            : "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    {t === "all"
                      ? "Tất cả"
                      : t === "income"
                        ? "Thu"
                        : t === "transfer"
                          ? "Chuyển"
                          : "Chi"}
                  </button>
                ),
              )}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2 sm:gap-1.5">
              {/* Filter toggle with badge */}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={
                  "relative flex min-h-11 items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all sm:min-h-0 " +
                  (showFilters || hasActiveFilters
                    ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
                }
              >
                <SlidersHorizontal size={13} />
                Lọc
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Mobile secondary actions: keep the primary filter row calm. */}
              <div className="relative ml-auto sm:hidden">
                <button
                  type="button"
                  onClick={() => setShowMobileActions((value) => !value)}
                  aria-label="Mở tác vụ giao dịch"
                  aria-expanded={showMobileActions}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  <MoreHorizontal size={18} />
                </button>
                {showMobileActions && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/70">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRulesOpen(true);
                        setShowMobileActions(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Sparkles size={15} className="text-violet-600" />
                      Quy tắc
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCsvImportOpen(true);
                        setShowMobileActions(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Upload size={15} className="text-blue-600" />
                      Nhập CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        exportCSV();
                        setShowMobileActions(false);
                      }}
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Download size={15} className="text-slate-500" />
                      Xuất CSV
                    </button>
                    <div className="mt-1 grid grid-cols-2 gap-1 border-t border-slate-100 pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode("table");
                          setShowMobileActions(false);
                        }}
                        className={
                          "flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition " +
                          (viewMode === "table"
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-500 hover:bg-slate-50")
                        }
                      >
                        <List size={14} />
                        Bảng
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode("timeline");
                          setShowMobileActions(false);
                        }}
                        className={
                          "flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition " +
                          (viewMode === "timeline"
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-500 hover:bg-slate-50")
                        }
                      >
                        <LayoutList size={14} />
                        Timeline
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop utility actions */}
              <div className="hidden items-center gap-1.5 sm:flex">
                <button
                  type="button"
                  onClick={() => setIsRulesOpen(true)}
                  title="Quy tắc giao dịch"
                  aria-label="Quy tắc giao dịch"
                  className="flex items-center rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-violet-600 transition-all hover:border-violet-300 hover:bg-violet-100 hover:text-violet-700"
                >
                  <Sparkles size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsCsvImportOpen(true)}
                  title="Nhập CSV"
                  aria-label="Nhập CSV"
                  className="flex items-center rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-600 transition-all hover:border-blue-300 hover:bg-blue-100 hover:text-blue-700"
                >
                  <Upload size={14} />
                </button>

                <button
                  onClick={exportCSV}
                  title="Xuất CSV"
                  aria-label="Xuất CSV"
                  className="flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                >
                  <Download size={14} />
                </button>

                <div className="flex gap-0.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    onClick={() => setViewMode("table")}
                    title="Dạng bảng"
                    aria-label="Xem dạng bảng"
                    aria-pressed={viewMode === "table"}
                    className={
                      "rounded-xl p-1.5 transition-all " +
                      (viewMode === "table"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-600")
                    }
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode("timeline")}
                    title="Dạng dòng thời gian"
                    aria-label="Xem dạng dòng thời gian"
                    aria-pressed={viewMode === "timeline"}
                    className={
                      "rounded-xl p-1.5 transition-all " +
                      (viewMode === "timeline"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-600")
                    }
                  >
                    <LayoutList size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-5 py-2.5">
              {typeFilter !== "all" && (
                <FilterChip
                  label={
                    typeFilter === "income"
                      ? "Thu nhập"
                      : typeFilter === "transfer"
                        ? "Chuyển tiền"
                        : "Chi tiêu"
                  }
                  onRemove={() => setTypeFilter("all")}
                  color={
                    typeFilter === "income"
                      ? "emerald"
                      : typeFilter === "transfer"
                        ? "slate"
                        : "rose"
                  }
                />
              )}
              {dateFrom && (
                <FilterChip
                  label={"Từ " + dateFrom}
                  onRemove={() => setDateFrom("")}
                />
              )}
              {dateTo && (
                <FilterChip
                  label={"Đến " + dateTo}
                  onRemove={() => setDateTo("")}
                />
              )}
              {walletFilter && (
                <FilterChip
                  label={
                    wallets.find((w) => w.id === walletFilter)?.name ?? "Ví"
                  }
                  onRemove={() => setWalletFilter("")}
                />
              )}
              {categoryFilter && (
                <FilterChip
                  label={
                    categories.find((c) => c.id === categoryFilter)?.name ??
                    "Danh mục"
                  }
                  onRemove={() => setCategoryFilter("")}
                />
              )}
              {amountMin && (
                <FilterChip
                  label={"≥ " + Number(amountMin).toLocaleString()}
                  onRemove={() => setAmountMin("")}
                />
              )}
              {amountMax && (
                <FilterChip
                  label={"≤ " + Number(amountMax).toLocaleString()}
                  onRemove={() => setAmountMax("")}
                />
              )}
              <button
                onClick={clearFilters}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-100"
              >
                Xóa tất cả
              </button>
            </div>
          )}

          {/* Advanced filter drawer */}
          {showFilters && (
            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Từ ngày
                  </p>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Đến ngày
                  </p>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Ví tiền
                  </p>
                  <select
                    value={walletFilter}
                    onChange={(e) => setWalletFilter(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="">Tất cả ví</option>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Danh mục
                  </p>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Số tiền tối thiểu
                  </p>
                  <CurrencyInput
                    value={amountMin}
                    onChange={setAmountMin}
                    placeholder="0"
                    showPrefix={false}
                    className="[&_input]:bg-white [&_input]:py-2.5 [&_input]:px-4"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-black text-slate-600">
                    Số tiền tối đa
                  </p>
                  <CurrencyInput
                    value={amountMax}
                    onChange={setAmountMax}
                    placeholder="Không giới hạn"
                    showPrefix={false}
                    className="[&_input]:bg-white [&_input]:py-2.5 [&_input]:px-4"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          Bulk Action Bar (sticky, only when rows selected)
          ════════════════════════════════════════════════════════════════════ */}
      {selectedIds.size > 0 && (
        <div className="sticky top-20 z-30">
          <div className="overflow-hidden rounded-2xl border border-blue-500/30 bg-blue-600 shadow-xl shadow-blue-900/30">
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="flex size-8 items-center justify-center rounded-xl bg-white/20 text-sm font-black text-white">
                {selectedIds.size}
              </div>
              <p className="text-sm font-bold text-white">giao dịch đã chọn</p>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-white/25 active:scale-95"
                >
                  <Download size={12} />
                  CSV
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-bold text-white transition-all hover:bg-rose-600 active:scale-95"
                >
                  <Trash2 size={12} />
                  Xóa
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  aria-label="Bỏ chọn tất cả"
                  className="rounded-xl bg-white/15 p-2 transition-all hover:bg-white/25"
                >
                  <X size={13} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 4 · Transaction Feed
          ════════════════════════════════════════════════════════════════════ */}
      <section
        ref={feedSectionRef}
        className="overflow-clip rounded-4xl border border-slate-200 bg-white shadow-sm"
      >
        {/* Feed header */}
        <div
          data-dark-surface="transaction-feed-summary"
          className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-3.5"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-sm font-black text-blue-700">
              {sorted.length} giao dịch
            </p>
            {totalPages > 1 && (
              <span className="text-[11px] font-bold text-blue-400">
                Hiển thị {displayRangeStart}–{displayRangeEnd}
              </span>
            )}
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                Đã lọc
              </span>
            )}
          </div>
          <div className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 text-xs text-slate-400 scrollbar-none">
            <span>Sắp xếp:</span>
            {(["date", "amount", "category", "wallet"] as SortKey[]).map(
              (k) => (
                <button
                  key={k}
                  onClick={() => toggleSort(k)}
                  className={
                    "flex items-center gap-0.5 rounded-lg px-2 py-1 font-bold transition-colors " +
                    (sortKey === k
                      ? "bg-blue-100 text-blue-700"
                      : "text-slate-400 hover:text-slate-600")
                  }
                >
                  {k === "date"
                    ? "Ngày"
                    : k === "amount"
                      ? "Tiền"
                      : k === "category"
                        ? "Danh mục"
                        : "Ví"}
                  {sortKey === k &&
                    (sortDir === "asc" ? (
                      <ChevronUp size={10} />
                    ) : (
                      <ChevronDown size={10} />
                    ))}
                </button>
              ),
            )}
          </div>
        </div>

        {viewMode === "table" ? (
          <>
            {/* Desktop column header */}
            <div className="sticky top-0 z-10 hidden grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px] items-center border-b border-blue-100 bg-white/98 px-6 py-2.5 text-xs font-black uppercase tracking-wide text-blue-400 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur lg:grid">
              <div>
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size === sorted.length && sorted.length > 0
                  }
                  onChange={toggleSelectAll}
                  title="Chọn tất cả giao dịch đã lọc (mọi trang)"
                  aria-label="Chọn tất cả giao dịch đã lọc (mọi trang)"
                  className="h-4 w-4 cursor-pointer rounded border-slate-300"
                />
              </div>
              <div>Giao dịch</div>
              <div>Danh mục</div>
              <div>Ví tiền</div>
              <div>Thời gian</div>
              <div className="text-right">Số tiền</div>
              <div className="text-right">Thao tác</div>
            </div>

            <div>
              {visibleGroups.map(({ date, txns }) => {
                const dayIncome = txns
                  .filter(
                    (transaction) =>
                      getTransactionDisplayType(transaction) === "income",
                  )
                  .reduce((sum, transaction) => sum + transaction.amount, 0);
                const dayExpense = txns
                  .filter(
                    (transaction) =>
                      getTransactionDisplayType(transaction) === "expense",
                  )
                  .reduce((sum, transaction) => sum + transaction.amount, 0);
                const dayTransferTurnover = txns
                  .filter(
                    (transaction) =>
                      isInternalTransferTransaction(transaction),
                  )
                  .reduce(
                    (sum, transaction) =>
                      sum + getInternalTransferTurnoverAmount(transaction),
                    0,
                  );
                return (
                  <div key={date}>
                    <div
                      data-dark-surface="transaction-day-header"
                      className="relative z-1 border-b border-slate-100 bg-slate-50/95 px-3 py-1.5 sm:px-6 sm:py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="whitespace-nowrap text-[12px] font-black text-slate-800 sm:text-sm">
                            {formatTransactionDayLabel(date)}
                          </span>
                          <span
                            className="shrink-0 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200 sm:px-2 sm:text-[11px]"
                            title={`${txns.length} giao dịch`}
                          >
                            <span className="sm:hidden">{txns.length}</span>
                            <span className="hidden sm:inline">
                              {txns.length} giao dịch
                            </span>
                          </span>
                        </div>

                        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto text-[9px] font-black scrollbar-none sm:hidden">
                          {dayIncome > 0 && (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600 ring-1 ring-emerald-100">
                              +{formatVND(dayIncome)}
                            </span>
                          )}
                          {dayExpense > 0 && (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-rose-600 ring-1 ring-rose-100">
                              -{formatVND(dayExpense)}
                            </span>
                          )}
                          {dayTransferTurnover > 0 && (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600 ring-1 ring-indigo-100">
                              ⇄ {formatVND(dayTransferTurnover)}
                            </span>
                          )}
                        </div>

                        <div className="ml-auto hidden items-center gap-2 text-[11px] font-bold sm:flex">
                          {dayIncome > 0 && (
                            <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2 py-1 text-emerald-600">
                              +{formatVND(dayIncome)}
                            </span>
                          )}
                          {dayExpense > 0 && (
                            <span className="whitespace-nowrap rounded-full bg-rose-50 px-2 py-1 text-rose-600">
                              -{formatVND(dayExpense)}
                            </span>
                          )}
                          {dayTransferTurnover > 0 && (
                            <span
                              className="whitespace-nowrap rounded-full bg-indigo-50 px-2 py-1 text-indigo-600"
                              title={
                                "Luân chuyển nội bộ: " +
                                formatVND(dayTransferTurnover)
                              }
                            >
                              ⇄ {formatVND(dayTransferTurnover)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100/80">
                      {txns.map((t) => {
                        const cat = categoryById.get(t.categoryId);
                        const wal = walletById.get(t.walletId);
                        const dstWal = t.transferToWalletId
                          ? walletById.get(t.transferToWalletId)
                          : undefined;
                        const isSelected = selectedIds.has(t.id);
                        const isSwiped = swipedId === t.id;
                        const displayType = getTransactionDisplayType(t);
                        const isIncome = displayType === "income";
                        const isTransfer = displayType === "transfer";
                        const categoryLabel = getCompactCategoryName(cat);

                        return (
                          <div key={t.id} className="relative overflow-hidden">
                            {/* Swipe actions — mobile only */}
                            <div
                              className={
                                "absolute inset-y-0 right-0 z-10 flex items-center gap-2 bg-white px-4 transition-transform duration-200 lg:hidden " +
                                (isSwiped
                                  ? "translate-x-0"
                                  : "translate-x-full")
                              }
                            >
                              <button
                                onClick={() => {
                                  openDuplicateForm(t);
                                  setSwipedId(null);
                                }}
                                aria-label="Nhân bản giao dịch"
                                className="flex size-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 transition-all active:scale-90"
                              >
                                <CopyPlus size={15} />
                              </button>
                              <button
                                onClick={() => {
                                  openEditForm(t);
                                  setSwipedId(null);
                                }}
                                aria-label="Sửa giao dịch"
                                className="flex size-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 transition-all active:scale-90"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => {
                                  handleDelete(t.id);
                                  setSwipedId(null);
                                }}
                                aria-label="Xóa giao dịch"
                                className="flex size-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 transition-all active:scale-90"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            <div
                              className={
                                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 border-l-2 px-3 py-2.5 transition-all duration-200 hover:bg-blue-50/40 sm:border-l-4 sm:px-6 sm:py-4 lg:grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px] lg:items-center lg:gap-x-2 " +
                                getTransactionAccentClass(t) +
                                " " +
                                (isSelected ? "bg-blue-50" : "bg-white") +
                                " " +
                                (isSwiped
                                  ? "-translate-x-[10.5rem] lg:translate-x-0"
                                  : "")
                              }
                              onTouchStart={(e) => {
                                touchStartX.current = e.touches[0].clientX;
                              }}
                              onTouchEnd={(e) => {
                                const delta =
                                  touchStartX.current -
                                  e.changedTouches[0].clientX;
                                if (delta > 55) setSwipedId(t.id);
                                else if (delta < -25) setSwipedId(null);
                              }}
                            >
                              {/* Checkbox (desktop) */}
                              <div className="hidden items-center lg:flex">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(t.id)}
                                  className="h-4 w-4 cursor-pointer rounded border-slate-300"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>

                              {/* Mobile ledger identity: icon + two single-line text levels */}
                              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
                                <div
                                  className={
                                    "flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm sm:size-11 sm:rounded-2xl " +
                                    (isIncome
                                      ? "bg-emerald-100 text-emerald-600"
                                      : isTransfer
                                        ? "bg-indigo-100 text-indigo-600"
                                        : "bg-rose-100 text-rose-600")
                                  }
                                >
                                  {isIncome ? (
                                    <ArrowUpRight size={18} strokeWidth={2.5} />
                                  ) : isTransfer ? (
                                    <ArrowLeftRight
                                      size={18}
                                      strokeWidth={2.5}
                                    />
                                  ) : (
                                    <ArrowDownRight
                                      size={18}
                                      strokeWidth={2.5}
                                    />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate whitespace-nowrap text-[13px] font-black leading-4 text-slate-900 sm:max-w-65 sm:text-sm sm:leading-5">
                                    {getTransactionDisplayNote(t)}
                                  </p>
                                  <p className="mt-0.5 truncate whitespace-nowrap text-[10px] font-medium leading-3.5 text-slate-400 sm:max-w-none sm:text-xs sm:leading-4 lg:hidden">
                                    {isTransfer
                                      ? getTransferWalletLabel(
                                          t,
                                          wal?.name,
                                          dstWal?.name,
                                        ).title
                                      : categoryLabel.primary +
                                        " · " +
                                        (wal?.name ?? "—")}{" "}
                                    · {formatTransactionDayLabel(t.date)}{" "}
                                    {formatTransactionTime(t)}
                                  </p>
                                </div>
                              </div>

                              {/* Category pill (desktop) */}
                              <div className="hidden lg:block">
                                {isTransfer ? (
                                  <span className="inline-flex max-w-full items-center rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                                    Chuyển tiền
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700"
                                    title={cat?.name ?? ""}
                                  >
                                    <span className="max-w-21.5 truncate">
                                      {categoryLabel.primary}
                                    </span>
                                    {categoryLabel.extraCount > 0 && (
                                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-blue-600 ring-1 ring-blue-100">
                                        +{categoryLabel.extraCount}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>

                              {/* Wallet badge (desktop) */}
                              <div className="hidden min-w-0 lg:block">
                                {isTransfer ? (
                                  <span
                                    className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600"
                                    title={
                                      getTransferWalletLabel(
                                        t,
                                        wal?.name,
                                        dstWal?.name,
                                      ).title
                                    }
                                  >
                                    <span className="max-w-16 truncate">
                                      {
                                        getTransferWalletLabel(
                                          t,
                                          wal?.name,
                                          dstWal?.name,
                                        ).from
                                      }
                                    </span>
                                    <span className="px-1 text-slate-300">
                                      →
                                    </span>
                                    <span className="max-w-16 truncate">
                                      {
                                        getTransferWalletLabel(
                                          t,
                                          wal?.name,
                                          dstWal?.name,
                                        ).to
                                      }
                                    </span>
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600"
                                    title={wal?.name ?? ""}
                                  >
                                    <span className="max-w-32 truncate">
                                      {wal?.name ?? "—"}
                                    </span>
                                  </span>
                                )}
                              </div>

                              {/* Time badge (desktop) */}
                              <div className="hidden lg:block">
                                <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-400">
                                  {formatTransactionTime(t)}
                                </span>
                              </div>

                              {/* Amount (desktop) */}
                              <div
                                className={
                                  "hidden text-right text-base font-black lg:block " +
                                  getTransactionAmountColorClass(t)
                                }
                              >
                                {getTransactionAmountPrefix(t)}
                                {formatVND(t.amount)}
                              </div>

                              {/* Actions (desktop) */}
                              <div className="hidden items-center justify-end gap-1.5 lg:flex">
                                <button
                                  onClick={() => openEditForm(t)}
                                  className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                                  title="Sửa"
                                  aria-label="Sửa giao dịch"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(t.id)}
                                  className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                                  title="Xóa"
                                  aria-label="Xóa giao dịch"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* Mobile ledger amount: same visual row; actions stay in swipe drawer */}
                              <span
                                className={
                                  "shrink-0 whitespace-nowrap text-right text-[clamp(0.78rem,3.5vw,0.95rem)] font-black leading-none tracking-[-0.02em] tabular-nums lg:hidden " +
                                  getTransactionAmountColorClass(t)
                                }
                              >
                                {getTransactionAmountPrefix(t)}
                                {formatVND(t.amount)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {sorted.length === 0 && (
                <EmptyState
                  hasFilters={hasActiveFilters}
                  onClear={clearFilters}
                  onAdd={openCreateForm}
                  isLoading={isLoadingTransactions}
                  loadError={transactionsLoadError}
                />
              )}
            </div>
          </>
        ) : (
          /* ── Timeline View ─────────────────────────────────────────────── */
          <div className="divide-y divide-slate-100">
            {timelineGroups.length === 0 && (
              <EmptyState
                hasFilters={hasActiveFilters}
                onClear={clearFilters}
                onAdd={openCreateForm}
                isLoading={isLoadingTransactions}
                loadError={transactionsLoadError}
              />
            )}
            {visibleGroups.map(({ date, txns }) => {
              const dayInc = txns
                .filter((t) => getTransactionDisplayType(t) === "income")
                .reduce((s, t) => s + t.amount, 0);
              const dayExp = txns
                .filter((t) => getTransactionDisplayType(t) === "expense")
                .reduce((s, t) => s + t.amount, 0);
              return (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 bg-blue-50/50 px-6 py-3">
                    <span className="text-sm font-black text-slate-700">
                      {date}
                    </span>
                    <div className="flex-1 border-t border-slate-200" />
                    <div className="flex gap-2">
                      {dayInc > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">
                          +
                          {Math.round(dayInc / 1e3) >= 1000
                            ? (dayInc / 1e6).toFixed(1) + "M"
                            : Math.round(dayInc / 1e3) + "K"}
                        </span>
                      )}
                      {dayExp > 0 && (
                        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700">
                          −
                          {Math.round(dayExp / 1e3) >= 1000
                            ? (dayExp / 1e6).toFixed(1) + "M"
                            : Math.round(dayExp / 1e3) + "K"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Transactions for this date */}
                  {txns.map((t) => {
                    const cat = categoryById.get(t.categoryId);
                    const wal = walletById.get(t.walletId);
                    const tDstWal = t.transferToWalletId
                      ? walletById.get(t.transferToWalletId)
                      : undefined;
                    const displayType = getTransactionDisplayType(t);
                    const isIncome = displayType === "income";
                    const isTransferRow = displayType === "transfer";
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3.5 px-6 py-3.5 transition-colors hover:bg-blue-50/30"
                      >
                        <div
                          className={
                            "flex size-10 shrink-0 items-center justify-center rounded-2xl " +
                            (isIncome
                              ? "bg-emerald-100 text-emerald-600"
                              : isTransferRow
                                ? "bg-blue-100 text-blue-600"
                                : "bg-rose-100 text-rose-600")
                          }
                        >
                          {isIncome ? (
                            <ArrowUpRight size={16} strokeWidth={2.5} />
                          ) : isTransferRow ? (
                            <ArrowLeftRight size={16} strokeWidth={2.5} />
                          ) : (
                            <ArrowDownRight size={16} strokeWidth={2.5} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {getTransactionDisplayNote(t)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {isTransferRow
                              ? getTransferWalletLabel(
                                  t,
                                  wal?.name,
                                  tDstWal?.name,
                                ).title
                              : (cat?.name ?? "—") + " · " + (wal?.name ?? "—")}
                          </p>
                        </div>
                        <span
                          className={
                            "shrink-0 text-base font-black " +
                            getTransactionAmountColorClass(t)
                          }
                        >
                          {getTransactionAmountPrefix(t)}
                          {formatVND(t.amount)}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => openDuplicateForm(t)}
                            aria-label="Nhân bản giao dịch"
                            className="flex size-7 items-center justify-center rounded-xl border border-transparent text-slate-300 transition-all hover:border-cyan-100 hover:text-cyan-700"
                          >
                            <CopyPlus size={12} />
                          </button>
                          <button
                            onClick={() => openEditForm(t)}
                            aria-label="Sửa giao dịch"
                            className="flex size-7 items-center justify-center rounded-xl border border-transparent text-slate-300 transition-all hover:border-slate-200 hover:text-blue-600"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            aria-label="Xóa giao dịch"
                            className="flex size-7 items-center justify-center rounded-xl border border-transparent text-slate-300 transition-all hover:border-slate-200 hover:text-rose-500"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
            {/* Mobile: compact prev/next + "Trang N / M" */}
            <div className="flex w-full items-center justify-between gap-2 sm:hidden">
              <button
                type="button"
                aria-label="Trang trước"
                disabled={safePage === 0}
                onClick={() => goToPage(safePage - 1)}
                className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronDown size={16} className="rotate-90" />
              </button>
              <span className="text-xs font-bold text-slate-500">
                Trang {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Trang sau"
                disabled={safePage === totalPages - 1}
                onClick={() => goToPage(safePage + 1)}
                className="flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronDown size={16} className="-rotate-90" />
              </button>
            </div>

            {/* Desktop: prev/next + nearby page numbers */}
            <div className="hidden w-full items-center justify-center gap-1 sm:flex">
              <button
                type="button"
                aria-label="Trang trước"
                disabled={safePage === 0}
                onClick={() => goToPage(safePage - 1)}
                className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
              >
                <ChevronDown size={14} className="rotate-90" />
                Trước
              </button>

              {getVisiblePageNumbers(totalPages, safePage).map(
                (page, index, pages) => (
                  <span key={page} className="flex items-center gap-1">
                    {index > 0 && pages[index - 1] !== page - 1 && (
                      <span className="px-1 text-xs text-slate-300">…</span>
                    )}
                    <button
                      type="button"
                      aria-label={`Trang ${page + 1}`}
                      aria-current={page === safePage ? "page" : undefined}
                      onClick={() => goToPage(page)}
                      className={
                        "flex size-8 items-center justify-center rounded-xl text-xs font-bold transition-colors " +
                        (page === safePage
                          ? "bg-blue-600 text-white"
                          : "border border-slate-200 text-slate-500 hover:border-blue-200 hover:text-blue-600")
                      }
                    >
                      {page + 1}
                    </button>
                  </span>
                ),
              )}

              <button
                type="button"
                aria-label="Trang sau"
                disabled={safePage === totalPages - 1}
                onClick={() => goToPage(safePage + 1)}
                className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
              >
                Sau
                <ChevronDown size={14} className="-rotate-90" />
              </button>
            </div>
          </div>
        )}
      </section>

      {isRulesOpen ? (
        <TransactionRulesManager
          rules={transactionRules}
          categories={categories}
          wallets={wallets}
          onClose={() => setIsRulesOpen(false)}
          onChanged={reloadTransactionRules}
        />
      ) : null}
      {isCsvImportOpen ? (
        <TransactionCsvImportModal
          wallets={wallets}
          categories={categories}
          rules={transactionRules}
          onClose={() => setIsCsvImportOpen(false)}
          onImported={async (result) => {
            await runReload();
            setCurrentPage(0);
            toast({
              variant: result.failures.length > 0 ? "warning" : "success",
              message:
                result.failures.length > 0
                  ? `Đã nhập ${result.importedCount} giao dịch; ${result.failures.length} dòng chưa thể ghi.`
                  : `Đã nhập ${result.importedCount} giao dịch từ CSV.`,
            });
          }}
        />
      ) : null}

      {/* ── CRUD Form Modal ─────────────────────────────────────────────── */}
      {isFormOpen && (
        <div className="fixed inset-0 overflow-x-hidden z-100 flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div
            ref={modalPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-dialog-title"
            aria-describedby="transaction-dialog-description"
            tabIndex={-1}
            className="flex h-dvh w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl outline-none sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl"
          >
            {/* Modal header */}
            <div className="shrink-0 border-b border-slate-100 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="transaction-dialog-title"
                    className="text-[1.15rem] font-black tracking-tight text-slate-900 sm:text-xl"
                  >
                    {form.id ? "Sửa giao dịch" : "Thêm giao dịch"}
                  </h2>
                  <p
                    id="transaction-dialog-description"
                    className="mt-0.5 max-w-60 text-[10px] font-medium leading-4 text-slate-400 sm:max-w-none sm:text-xs"
                  >
                    Ghi nhận khoản thu, chi hoặc chuyển tiền giữa các ví.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Đóng"
                  className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95 sm:size-9"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <form
              id="transaction-form"
              onSubmit={handleSubmit}
              className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-2.5 sm:px-6 sm:py-4 sm:pb-5"
            >
              {/* Amount — hero input */}
              <div className="mb-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-700">Số tiền</p>
                  {modalAmount > 0 && (
                    <p className={"text-xs font-black " + modalAccent.text}>
                      {formatVND(modalAmount)}
                    </p>
                  )}
                </div>
                <div
                  className={
                    "relative rounded-2xl border-2 bg-white transition-colors " +
                    modalAccent.border +
                    " " +
                    modalAccent.focus
                  }
                >
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300">
                    ₫
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(form.amount)}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        amount: parseCurrencyInput(e.target.value),
                      }))
                    }
                    placeholder="Nhập số tiền"
                    className="w-full rounded-2xl bg-transparent py-2.5 pl-11 pr-4 text-[1.3rem] font-black tracking-tight text-slate-900 outline-none placeholder:text-[14px] placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-300 sm:py-4 sm:text-2xl"
                  />
                </div>

                <div className="-mx-1 mt-1.5 flex gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-none">
                  {amountQuickActions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, amount: String(value) }))
                      }
                      className="min-h-7 shrink-0 rounded-full border border-slate-200 bg-white px-3 py-0.5 text-[10px] font-black text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95"
                    >
                      {value >= 1000000
                        ? value / 1000000 + "tr"
                        : value / 1000 + "k"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type selector — premium segmented control */}
              <div className="mb-2">
                <p className="mb-2 text-sm font-black text-slate-700">
                  Loại giao dịch
                </p>
                <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  {[
                    {
                      mode: "income" as TransactionFormMode,
                      icon: "↑",
                      label: "Thu",
                      active: "bg-emerald-500",
                    },
                    {
                      mode: "expense" as TransactionFormMode,
                      icon: "↓",
                      label: "Chi",
                      active: "bg-rose-500",
                    },
                    {
                      mode: "transfer" as TransactionFormMode,
                      icon: "⇄",
                      label: "Chuyển",
                      active: "bg-blue-600",
                    },
                  ].map((item) => {
                    const active = form.formMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => handleTypeChange(item.mode)}
                        className={
                          "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 text-center text-[11px] font-black transition-all active:scale-[.98] sm:min-h-14 sm:text-xs " +
                          (active
                            ? item.active + " text-white shadow-lg"
                            : "text-slate-500 hover:bg-white hover:text-slate-800")
                        }
                      >
                        <span className="text-base leading-none">
                          {item.icon}
                        </span>
                        <span className="leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!form.id &&
              form.formMode !== "transfer" &&
              recentCaptureCategories.length > 0 ? (
                <div
                  data-transaction-capture-speed="recent-categories"
                  className="mb-2.5 rounded-2xl border border-blue-100 bg-blue-50/50 px-3 py-2.5"
                >
                  <p className="text-[11px] font-black text-[#506A82]">
                    Danh mục gần đây
                  </p>
                  <div className="mt-2 flex max-w-full gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                    {recentCaptureCategories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={form.categoryId === category.id}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            categoryId: category.id,
                          }))
                        }
                        className={
                          "min-h-9 shrink-0 rounded-full border px-3 text-xs font-black transition active:scale-[0.98] " +
                          (form.categoryId === category.id
                            ? "border-blue-300 bg-blue-600 text-white"
                            : "border-blue-100 bg-white text-[#3977C3]")
                        }
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* TRANSACTION-RULES-1-UX-POLISH: suggestion-before-category */}
              <div className="grid gap-2 md:grid-cols-2">
                <FormInput
                  label="Ngày"
                  type="date"
                  value={form.date}
                  onChange={(v) => setForm((p) => ({ ...p, date: v }))}
                />

                {form.type === "transfer" ? (
                  <FormSelect
                    label="Ví nguồn"
                    value={form.walletId}
                    onChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        walletId: v,
                        transferToWalletId:
                          p.transferToWalletId === v ? "" : p.transferToWalletId,
                      }))
                    }
                    options={wallets.map((w) => ({
                      label: w.name,
                      value: w.id,
                    }))}
                  />
                ) : (
                  <FormSelect
                    label="Ví tiền"
                    value={form.walletId}
                    onChange={(v) => setForm((p) => ({ ...p, walletId: v }))}
                    options={wallets.map((w) => ({
                      label: w.name,
                      value: w.id,
                    }))}
                  />
                )}

                {form.type === "transfer" ? (
                  <div className="space-y-1.5">
                    <FormSelect
                      label="Ví đích"
                      value={form.transferToWalletId}
                      onChange={(v) =>
                        setForm((p) => ({ ...p, transferToWalletId: v }))
                      }
                      options={wallets
                        .filter((w) => w.id !== form.walletId)
                        .map((w) => ({ label: w.name, value: w.id }))}
                    />
                    <button
                      type="button"
                      data-transaction-capture-speed="swap-transfer-wallets"
                      disabled={!form.walletId || !form.transferToWalletId}
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          walletId: p.transferToWalletId,
                          transferToWalletId: p.walletId,
                        }))
                      }
                      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeftRight size={14} /> Đổi chiều ví
                    </button>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <FormInput
                      label="Ghi chú"
                      value={form.note}
                      onChange={(v) => setForm((p) => ({ ...p, note: v }))}
                      placeholder="Ví dụ: Grab Bike, Highlands, lương tháng..."
                    />
                  </div>
                )}

                {form.type === "transfer" ? (
                  <FormInput
                    label="Ghi chú"
                    value={form.note}
                    onChange={(v) => setForm((p) => ({ ...p, note: v }))}
                    placeholder="Ví dụ: Chuyển qua ví chính"
                  />
                ) : null}
              </div>

              {activeSmartDefaultsSuggestion ? (
                <div
                  data-transaction-smart-defaults="true"
                  className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <Sparkles size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-600">
                        Gợi ý từ lịch sử
                      </p>
                      <p className="mt-0.5 text-sm font-black text-slate-800">
                        {activeSmartDefaultsSuggestion.matchKind === "note"
                          ? `Khớp ${activeSmartDefaultsSuggestion.matchCount} giao dịch có cùng ghi chú.`
                          : `Dựa trên ${activeSmartDefaultsSuggestion.matchCount} giao dịch cùng danh mục.`}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">
                        {categoryById.get(activeSmartDefaultsSuggestion.categoryId)
                          ?.name ?? "Danh mục"}
                        {" · "}
                        {walletById.get(activeSmartDefaultsSuggestion.walletId)
                          ?.name ?? "Ví"}
                        {" · "}
                        {formatVND(activeSmartDefaultsSuggestion.amount)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">
                        Bạn vẫn kiểm tra trước khi lưu.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={applyActiveSmartDefaultsSuggestion}
                      className="min-h-10 shrink-0 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white transition hover:bg-sky-700 active:scale-[0.98]"
                    >
                      Dùng gợi ý
                    </button>
                  </div>
                </div>
              ) : null}

              {activeRuleSuggestion ? (
                <div
                  data-transaction-rule-suggestion="true"
                  className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <Sparkles size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                        Gợi ý từ quy tắc
                      </p>
                      <p className="mt-0.5 truncate text-sm font-black text-slate-800">
                        {activeRuleSuggestion.rule.name}
                      </p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">
                        {activeRuleSuggestion.patch.categoryId
                          ? `Danh mục → ${categoryById.get(activeRuleSuggestion.patch.categoryId)?.name ?? "Danh mục"}`
                          : ""}
                        {activeRuleSuggestion.patch.categoryId &&
                        activeRuleSuggestion.patch.walletId
                          ? " · "
                          : ""}
                        {activeRuleSuggestion.patch.walletId
                          ? `Ví → ${walletById.get(activeRuleSuggestion.patch.walletId)?.name ?? "Ví"}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={applyActiveRuleSuggestion}
                      className="min-h-10 shrink-0 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white transition hover:bg-violet-700"
                    >
                      Áp dụng gợi ý
                    </button>
                  </div>
                </div>
              ) : null}

              {form.type !== "transfer" ? (
                <div className="mt-2">
                  <FormSelect
                    label="Danh mục"
                    value={form.categoryId}
                    onChange={(v) => setForm((p) => ({ ...p, categoryId: v }))}
                    options={filteredCategories.map((c) => ({
                      label: c.name,
                      value: c.id,
                    }))}
                  />
                </div>
              ) : null}

              {activeEntryConfidenceWarnings.length > 0 ? (
                <div
                  data-transaction-entry-confidence="true"
                  aria-label="Cảnh báo độ tin cậy trước khi lưu"
                  className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/75 p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-xs font-black text-amber-700">
                      !
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">
                        Kiểm tra trước khi lưu
                      </p>
                      <p className="mt-0.5 text-[11px] font-semibold leading-4 text-amber-800/75">
                        Chỉ là cảnh báo, bạn vẫn có thể lưu giao dịch.
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {activeEntryConfidenceWarnings.map((warning) => {
                      const key =
                        warning.kind === "possible-duplicate"
                          ? `${warning.kind}:${warning.peerTransactionId}`
                          : warning.kind === "wallet-context-mismatch"
                            ? `${warning.kind}:${warning.expectedWalletId}`
                            : `${warning.kind}:${warning.direction}`;
                      const title =
                        warning.kind === "possible-duplicate"
                          ? "Có giao dịch rất giống trong cùng ngày."
                          : warning.kind === "wallet-context-mismatch"
                            ? "Ví đang chọn khác thói quen gần đây."
                            : warning.direction === "high"
                              ? "Số tiền cao hơn nhiều so với lịch sử."
                              : "Số tiền thấp hơn nhiều so với lịch sử.";
                      const detail =
                        warning.kind === "possible-duplicate"
                          ? "Trùng số tiền, danh mục, ví, ngày và ghi chú với một giao dịch đã có."
                          : warning.kind === "wallet-context-mismatch"
                            ? `Trong ${warning.contextCount} giao dịch cùng ghi chú, ${warning.expectedWalletCount} lần dùng ${walletById.get(warning.expectedWalletId)?.name ?? "ví khác"}.`
                            : `Mức thường thấy với ghi chú này khoảng ${formatVND(warning.baselineAmount)} từ ${warning.contextCount} giao dịch trước.`;

                      return (
                        <div
                          key={key}
                          className="rounded-xl border border-amber-100 bg-white/75 px-3 py-2"
                        >
                          <p className="text-xs font-black text-slate-800">
                            {title}
                          </p>
                          <p className="mt-0.5 text-[10px] font-semibold leading-4 text-slate-500">
                            {detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {/* Wallet preview */}
              {canShowWalletPreview && (
                <div
                  className={
                    "mt-3 hidden rounded-2xl border p-3 sm:block " +
                    modalAccent.border +
                    " " +
                    modalAccent.soft
                  }
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        Xem trước ví
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-800">
                        {selectedWallet?.name}
                      </p>
                    </div>
                    <span
                      className={
                        "rounded-full bg-white px-3 py-1 text-xs font-black shadow-sm " +
                        modalAccent.text
                      }
                    >
                      {form.formMode === "income"
                        ? "+ "
                        : form.formMode === "transfer"
                          ? "⇄ "
                          : "- "}
                      {formatVND(modalAmount)}
                    </span>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-500">
                        Số dư hiện tại
                      </span>
                      <span className="font-black text-slate-800">
                        {formatVND(walletBefore)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-500">
                        Sau giao dịch
                      </span>
                      <span className={"font-black " + modalAccent.text}>
                        {formatVND(walletAfter)}
                      </span>
                    </div>

                    {form.formMode === "transfer" && destinationWallet && (
                      <>
                        <div className="my-1 border-t border-white/70" />
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-slate-500">
                            Ví đích
                          </span>
                          <span className="font-black text-slate-800">
                            {destinationWallet.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-slate-500">
                            Sau khi nhận
                          </span>
                          <span className="font-black text-blue-600">
                            {formatVND(destinationWalletAfter)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Recurring toggle */}
              <div className="mt-2 border-t border-slate-100 pt-2">
                <div className="flex min-h-10 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-1.5">
                  <div>
                    <p className="text-sm font-black text-slate-700">Định kỳ</p>
                    <p className="text-xs font-medium text-slate-400">
                      Dùng cho dự báo dòng tiền
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {form.isRecurring && (
                      <select
                        value={form.recurrence}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            recurrence: e.target.value as RecurrenceFrequency,
                          }))
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
                      >
                        <option value="daily">Hàng ngày</option>
                        <option value="weekly">Hàng tuần</option>
                        <option value="monthly">Hàng tháng</option>
                        <option value="yearly">Hàng năm</option>
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          isRecurring: !p.isRecurring,
                          nextRunDate:
                            !p.isRecurring && !p.nextRunDate
                              ? p.date
                              : p.nextRunDate,
                        }))
                      }
                      className={
                        "relative inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full transition-colors " +
                        (form.isRecurring ? "bg-blue-600" : "bg-slate-300")
                      }
                    >
                      <span
                        className={
                          "inline-block size-6 transform rounded-full bg-white shadow-sm transition-transform " +
                          (form.isRecurring ? "translate-x-6" : "translate-x-1")
                        }
                      />
                    </button>
                  </div>
                </div>
                {form.isRecurring && (
                  <label className="mt-2 block rounded-2xl border border-blue-100 bg-blue-50/60 px-3.5 py-3">
                    <span className="text-xs font-black text-slate-600">
                      Ngày chạy tiếp
                    </span>
                    <input
                      type="date"
                      value={form.nextRunDate}
                      onChange={(event) =>
                        setForm((p) => ({
                          ...p,
                          nextRunDate: event.target.value,
                        }))
                      }
                      className="mt-1.5 min-h-10 w-full rounded-xl border border-blue-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
                    />
                  </label>
                )}
              </div>

              <SaveError
                message={saveError}
                onDismiss={() => setSaveError(null)}
              />
            </form>

            <div className="shrink-0 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_32px_rgba(15,23,42,0.06)] backdrop-blur sm:px-6 sm:py-3.5">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-10 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50 active:scale-[.98]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  form="transaction-form"
                  disabled={isSubmitting}
                  className={
                    "min-h-10 flex-1 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg transition-all active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 " +
                    modalAccent.bg +
                    " " +
                    modalAccent.bgHover +
                    " " +
                    modalAccent.shadow
                  }
                >
                  {isSubmitting
                    ? "Đang lưu..."
                    : form.id
                      ? "Lưu thay đổi"
                      : form.type === "transfer"
                        ? "Chuyển tiền"
                        : "Thêm giao dịch"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterChip({
  label,
  onRemove,
  color = "slate",
}: {
  label: string;
  onRemove: () => void;
  color?: "slate" | "blue" | "emerald" | "rose";
}) {
  const styles = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div
      className={
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold " +
        styles[color]
      }
    >
      {label}
      <button
        onClick={onRemove}
        aria-label={`Xóa bộ lọc ${label}`}
        className="text-current opacity-60 hover:opacity-100"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function LiquidityHeroCard({
  value,
  walletCount,
  netCashFlow,
}: {
  value: string;
  walletCount: number;
  netCashFlow: number;
}) {
  const positiveFlow = netCashFlow >= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-300 bg-linear-to-r from-blue-600 via-blue-600 to-indigo-600 px-3.5 py-3 text-white shadow-md shadow-blue-200/45 sm:rounded-[24px] sm:from-sky-500 sm:px-5 sm:py-4 sm:shadow-lg sm:shadow-blue-200/55">
      <div className="absolute -right-16 -top-20 hidden size-52 rounded-full bg-white/10 sm:block" />
      <div className="absolute -bottom-24 right-8 hidden size-56 rounded-full bg-indigo-400/25 sm:block" />
      <div className="absolute left-[42%] top-0 hidden h-full w-px bg-white/10 lg:block" />

      <div className="relative grid gap-2 sm:gap-4 lg:grid-cols-[1.55fr_1fr] lg:items-center">
        <div className="flex min-w-0 items-center gap-3 sm:items-start sm:gap-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-md shadow-blue-950/10 sm:size-11 sm:rounded-2xl sm:shadow-lg">
            <WalletCards size={19} strokeWidth={2.4} className="sm:hidden" />
            <WalletCards size={22} strokeWidth={2.4} className="hidden sm:block" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2 sm:flex-wrap sm:justify-start">
              <div className="min-w-0">
                <p className="hidden whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] text-blue-100 sm:block">
                  Số tiền khả dụng
                </p>
                <h3 className="whitespace-nowrap text-[13px] font-black text-white sm:mt-1 sm:text-sm">
                  Thanh khoản hiện tại
                </h3>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full border border-white/15 bg-white/12 px-2 py-0.5 text-[9px] font-black text-white backdrop-blur sm:px-3 sm:py-1 sm:text-[10px]">
                <span className="sm:hidden">{walletCount} ví</span>
                <span className="hidden sm:inline">
                  {walletCount} ví đang hoạt động
                </span>
              </span>
            </div>

            <p className="mt-1.5 whitespace-nowrap text-[1.6rem] font-black leading-none tracking-[-0.04em] tabular-nums sm:mt-2.5 sm:text-[2.35rem] sm:tracking-[-0.045em]">
              {value}
            </p>

            <p className="mt-2 hidden max-w-2xl text-sm font-semibold leading-5 text-blue-50/95 sm:block">
              Tổng số dư có thể dùng ngay để chi tiêu, thanh toán hoặc thực hiện
              giao dịch.
            </p>
          </div>
        </div>

        <div className="min-w-0 border-t border-white/15 pt-2 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/10 sm:px-3.5 sm:py-3 sm:backdrop-blur-sm lg:ml-2">
          <div className="flex items-center justify-between gap-3 sm:block">
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.14em] text-blue-100 sm:text-[10px] sm:tracking-[0.18em]">
                Dòng tiền kỳ này
              </p>
              <p className="mt-1 whitespace-nowrap text-lg font-black leading-none tabular-nums text-white sm:mt-2 sm:text-2xl">
                {getSignedAmountText(netCashFlow)}
              </p>
            </div>
            <span
              className={
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black sm:hidden " +
                (positiveFlow
                  ? "bg-emerald-500/25 text-emerald-100"
                  : "bg-rose-500/25 text-rose-100")
              }
            >
              {positiveFlow ? "Ổn định" : "Cần kiểm soát"}
            </span>
          </div>
          <div className="mt-3 hidden items-center justify-between gap-3 text-xs font-bold sm:flex">
            <span className="text-blue-100">Trạng thái</span>
            <span
              className={
                "rounded-full px-2.5 py-1 " +
                (positiveFlow
                  ? "bg-emerald-500/25 text-emerald-100"
                  : "bg-rose-500/25 text-rose-100")
              }
            >
              {positiveFlow ? "Ổn định" : "Cần kiểm soát"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  footerLabel,
  mobileFooterLabel,
  footerValue,
  hideFooterValueOnMobile = false,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  footerLabel: string;
  /** Shorter, semantic-equivalent label used only below `sm`, when the full
   * copy + value can't both fit on one line at 375-430px. Desktop always
   * shows `footerLabel` in full. */
  mobileFooterLabel?: string;
  footerValue: string;
  /** For the one footer that pairs a long label with a full VND amount
   * (Thu nhập's "Dòng tiền kỳ này"): that exact figure is already shown,
   * unabbreviated, as the "Dòng tiền ròng" card's own headline value in the
   * same 2x2 grid, so on mobile we drop the redundant repeat here instead of
   * shrinking the text below a readable size to force it onto one line. */
  hideFooterValueOnMobile?: boolean;
  tone:
    | "income"
    | "expense"
    | "positive"
    | "negative"
    | "liquidity"
    | "transfer";
}) {
  const styles = {
    income: {
      shell:
        "border-emerald-200 bg-linear-to-br from-emerald-50 to-white text-emerald-700",
      icon: "bg-emerald-100 text-emerald-600",
      footer: "bg-emerald-100/70 text-emerald-700",
      symbol: "↑",
    },
    expense: {
      shell:
        "border-rose-200 bg-linear-to-br from-rose-50 to-white text-rose-700",
      icon: "bg-rose-100 text-rose-600",
      footer: "bg-rose-100/70 text-rose-700",
      symbol: "↓",
    },
    positive: {
      shell:
        "border-blue-200 bg-linear-to-br from-blue-50 to-white text-blue-700",
      icon: "bg-blue-100 text-blue-600",
      footer: "bg-blue-100/70 text-blue-700",
      symbol: "↗",
    },
    negative: {
      shell:
        "border-amber-200 bg-linear-to-br from-amber-50 to-white text-amber-700",
      icon: "bg-amber-100 text-amber-600",
      footer: "bg-amber-100/70 text-amber-700",
      symbol: "↘",
    },
    liquidity: {
      shell:
        "border-cyan-200 bg-linear-to-br from-cyan-50 to-white text-cyan-700",
      icon: "bg-cyan-100 text-cyan-600",
      footer: "bg-cyan-100/70 text-cyan-700",
      symbol: "₫",
    },
    transfer: {
      shell:
        "border-indigo-200 bg-linear-to-br from-indigo-50 to-white text-indigo-700",
      icon: "bg-indigo-100 text-indigo-600",
      footer: "bg-indigo-100/70 text-indigo-700",
      symbol: "⇄",
    },
  };

  const style = styles[tone];
  const mobileFooterText = hideFooterValueOnMobile
    ? (mobileFooterLabel ?? footerLabel)
    : `${mobileFooterLabel ?? footerLabel} ${footerValue}`;

  return (
    <div
      className={
        "flex min-w-0 flex-col rounded-2xl border p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl sm:p-3.5 " +
        style.shell
      }
    >
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black sm:size-8 sm:text-sm " +
            style.icon
          }
        >
          {style.symbol}
        </span>
        <p className="min-w-0 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.02em] sm:text-[10px] sm:tracking-[0.16em]">
          {label}
        </p>
      </div>

      <p className="mt-2 whitespace-nowrap text-[clamp(0.82rem,3.55vw,0.95rem)] font-black leading-none tracking-tight tabular-nums sm:mt-3.5 sm:text-[clamp(0.85rem,4vw,1.3rem)]">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] font-bold opacity-75 sm:text-xs">{note}</p>

      <div
        className={
          "mt-2 flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-lg px-2 py-1 text-[8px] font-black sm:mt-auto sm:justify-between sm:gap-3 sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-[10px] " +
          style.footer
        }
      >
        <span className="truncate sm:hidden">{mobileFooterText}</span>
        <span className="hidden truncate sm:inline">{footerLabel}</span>
        <span className="hidden shrink-0 sm:inline">{footerValue}</span>
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
  onAdd,
  isLoading = false,
  loadError = null,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onAdd: () => void;
  /** FINANCE-DATA-1B: when the transactions fetch hasn't succeeded yet
   * (still loading, or the initial attempt failed), this must not render
   * "Chưa có giao dịch" — that's a legitimate-empty-ledger claim, not
   * what "we don't know yet" means. */
  isLoading?: boolean;
  loadError?: string | null;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex size-20 items-center justify-center rounded-4xl bg-slate-50 shadow-inner">
          <ArrowDownRight size={28} className="text-slate-300" />
        </div>
        <h3 className="mt-5 text-base font-black text-slate-700">
          Đang tải giao dịch...
        </h3>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex size-20 items-center justify-center rounded-4xl bg-rose-50 shadow-inner">
          <ArrowDownRight size={28} className="text-rose-400" />
        </div>
        <h3 className="mt-5 text-base font-black text-slate-700">
          Không thể tải giao dịch
        </h3>
        <p className="mt-2 max-w-60 text-sm leading-6 text-slate-400">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex size-20 items-center justify-center rounded-4xl bg-blue-50 shadow-inner">
        {hasFilters ? (
          <Search size={28} className="text-blue-300" />
        ) : (
          <ArrowDownRight size={28} className="text-blue-300" />
        )}
      </div>
      <h3 className="mt-5 text-base font-black text-slate-700">
        {hasFilters ? "Không tìm thấy kết quả" : "Chưa có giao dịch"}
      </h3>
      <p className="mt-2 max-w-60 text-sm leading-6 text-slate-400">
        {hasFilters
          ? "Hãy thay đổi bộ lọc hoặc từ khóa tìm kiếm."
          : "Bắt đầu bằng cách ghi lại khoản thu hoặc chi đầu tiên."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {hasFilters && (
          <button
            onClick={onClear}
            className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
          >
            Xóa bộ lọc
          </button>
        )}
        <button
          onClick={onAdd}
          className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95"
        >
          <Plus size={15} />
          Thêm giao dịch
        </button>
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-black text-slate-700 sm:text-sm">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-9 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[15px] outline-none transition-all focus:border-blue-400 focus:bg-white focus:shadow-sm sm:min-h-11 sm:px-4 sm:py-2.5 sm:text-sm"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-black text-slate-700 sm:text-sm">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-[15px] outline-none transition-all focus:border-blue-400 focus:bg-white sm:min-h-11 sm:px-4 sm:py-2.5 sm:text-sm"
      >
        <option value="">Chọn</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
