"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useDateFilter } from "@/src/components/layout/DateFilterProvider";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  LayoutList,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";

import type {
  Category,
  ForexAccount,
  ForexCashTransaction,
  RecurrenceFrequency,
  Transaction,
  TransactionType,
  Wallet,
} from "@/src/types/finance";
import {
  addTransaction,
  deleteTransaction,
  deleteForexCashTransaction,
  getCategories,
  getForexAccounts,
  getForexCashTransactions,
  getTransactions,
  getWallets,
  updateTransaction,
} from "@/src/services/finance/financeStorage";
import {
  formatVND,
  getTotalExpense,
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
type TransactionDisplayFilter = "all" | TransactionType | "forex";

type ToastPayload = {
  variant?: "success" | "error" | "info" | "warning";
  message: string;
};

type TransactionFormMode = "income" | "expense" | "transfer";

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
};

const emptyForm: FormState = {
  type: "expense",
  formMode: "expense",
  amount: "",
  categoryId: "",
  walletId: "",
  transferToWalletId: "",
  note: "",
  date: new Date().toISOString().slice(0, 10),
  isRecurring: false,
  recurrence: "monthly",
};

type ForexUnifiedTransaction = Transaction & {
  unifiedSource: "forex_cash";
  sourceId: string;
  forexAccountId: string;
  forexAccountName: string;
  forexType: "deposit" | "withdrawal";
  forexFee: number;
  sourceLabel: string;
  destinationLabel: string;
};

function isForexUnifiedTransaction(
  transaction: Transaction,
): transaction is ForexUnifiedTransaction {
  return (
    (transaction as Partial<ForexUnifiedTransaction>).unifiedSource ===
    "forex_cash"
  );
}

function mapForexCashTransactionToUnified(
  transaction: ForexCashTransaction,
  account: ForexAccount | undefined,
  wallet: Wallet | undefined,
): ForexUnifiedTransaction {
  const accountName = account?.name ?? "Tài khoản Forex";
  const walletName = wallet?.name ?? "Ví";
  const isDeposit = transaction.type === "deposit";
  const metadata = transaction as ForexCashTransaction & {
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
  };
  const sourceTimestamp =
    metadata.createdAt ??
    metadata.created_at ??
    metadata.updatedAt ??
    metadata.updated_at ??
    "";

  return {
    id: `forex:${transaction.id}`,
    sourceId: transaction.id,
    unifiedSource: "forex_cash",
    forexAccountId: transaction.forexAccountId,
    forexAccountName: accountName,
    forexType: transaction.type,
    forexFee: Math.max(0, transaction.fee ?? 0),
    sourceLabel: isDeposit ? walletName : accountName,
    destinationLabel: isDeposit ? accountName : walletName,
    type: "transfer",
    amount: transaction.amount,
    categoryId: "",
    walletId: transaction.walletId,
    note:
      transaction.notes?.trim() ||
      (isDeposit ? "Nạp tiền vào Forex" : "Rút tiền từ Forex"),
    date: transaction.transactionDate,
    ...(sourceTimestamp ? { createdAt: sourceTimestamp } : {}),
    transferReference: `forex_cash:${transaction.id}`,
    transferReferenceType: "forex",
    sourceType: isDeposit ? "wallet" : "forex",
    destinationType: isDeposit ? "forex" : "wallet",
  } as ForexUnifiedTransaction;
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
  const fallbackTime = isForexUnifiedTransaction(transaction)
    ? "23:59:59.999"
    : "00:00:00.000";
  const dateTime = new Date(`${dateOnly}T${fallbackTime}`).getTime();
  return Number.isFinite(dateTime) ? dateTime : 0;
}

function compareTransactionNewestFirst(a: Transaction, b: Transaction) {
  const timeCompare = getTransactionSortTime(b) - getTransactionSortTime(a);
  if (timeCompare !== 0) return timeCompare;

  return String(b.id).localeCompare(String(a.id));
}

function getCategoryPlanningGroup(category?: Category) {
  return (
    category?.planningGroup ??
    (category?.type === "income" ? "income" : "variable")
  );
}

function getTransactionFormMode(
  transaction: Transaction,
  _categories: Category[],
): TransactionFormMode {
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
  const todayIso = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);

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

function normalizeTransactionNote(note: string) {
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

function getSavingTransferKind(
  transaction: Transaction,
): "deposit" | "withdraw" | "close" | null {
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

function isInternalTransferTransaction(transaction: Transaction) {
  if (transaction.type === "transfer") return true;

  const savingKind = getSavingTransferKind(transaction);
  if (savingKind) return true;

  const normalizedNote = normalizeTransactionNote(transaction.note);

  return (
    normalizedNote.startsWith("chuyen tien") ||
    normalizedNote.includes("chuyen vi") ||
    normalizedNote.includes("noi bo")
  );
}

function getTransactionDisplayType(transaction: Transaction) {
  if (isForexUnifiedTransaction(transaction)) return "forex";
  return isInternalTransferTransaction(transaction)
    ? "transfer"
    : transaction.type;
}

function getTransactionAccentClass(transaction: Transaction) {
  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "border-l-emerald-400";
  if (displayType === "forex") return "border-l-cyan-400";
  if (displayType === "transfer") return "border-l-indigo-400";
  return "border-l-rose-400";
}

function getTransactionAmountPrefix(transaction: Transaction) {
  if (isForexUnifiedTransaction(transaction)) return "⇄";
  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return "+";
  if (savingKind === "withdraw" || savingKind === "close") return "−";

  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "+";
  if (displayType === "transfer") return "⇄";
  return "−";
}

function getTransactionAmountColorClass(transaction: Transaction) {
  if (isForexUnifiedTransaction(transaction)) return "text-cyan-600";
  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return "text-emerald-600";
  if (savingKind === "withdraw" || savingKind === "close")
    return "text-rose-500";

  const displayType = getTransactionDisplayType(transaction);
  if (displayType === "income") return "text-emerald-600";
  if (displayType === "transfer") return "text-indigo-600";
  return "text-rose-500";
}

function getInternalTransferSignedAmount(transaction: Transaction) {
  const savingKind = getSavingTransferKind(transaction);

  if (savingKind === "deposit") return transaction.amount;
  if (savingKind === "withdraw" || savingKind === "close")
    return -transaction.amount;

  return 0;
}

function getInternalTransferTurnoverAmount(transaction: Transaction) {
  return isInternalTransferTransaction(transaction) ||
    isForexUnifiedTransaction(transaction)
    ? Math.abs(transaction.amount)
    : 0;
}

function getSignedAmountText(amount: number) {
  if (amount > 0) return "+" + formatVND(amount);
  if (amount < 0) return "−" + formatVND(Math.abs(amount));
  return formatVND(0);
}

function getTransactionDisplayNote(transaction: Transaction) {
  if (isForexUnifiedTransaction(transaction)) {
    return transaction.note;
  }

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
  if (isForexUnifiedTransaction(transaction)) {
    return {
      from: transaction.sourceLabel,
      to: transaction.destinationLabel,
      title: `${transaction.sourceLabel} → ${transaction.destinationLabel}`,
    };
  }

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

// ─── Main component ───────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const { selectedMonth } = useDateFilter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [forexAccounts, setForexAccounts] = useState<ForexAccount[]>([]);
  const [forexCashTransactions, setForexCashTransactions] = useState<
    ForexCashTransaction[]
  >([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);

  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionDisplayFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
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

  const reloadData = useCallback(async () => {
    const [
      txnsResult,
      forexAccountsResult,
      forexTxnsResult,
      catsResult,
      walletsResult,
    ] = await Promise.allSettled([
      getTransactions(),
      getForexAccounts(),
      getForexCashTransactions(),
      getCategories(),
      getWallets(),
    ]);

    const txns = txnsResult.status === "fulfilled" ? txnsResult.value : [];
    const forexAcc =
      forexAccountsResult.status === "fulfilled"
        ? forexAccountsResult.value
        : [];
    const forexTxns =
      forexTxnsResult.status === "fulfilled" ? forexTxnsResult.value : [];
    const cats = catsResult.status === "fulfilled" ? catsResult.value : [];
    const wlts =
      walletsResult.status === "fulfilled" ? walletsResult.value : [];

    if (txnsResult.status === "rejected") {
      console.error(
        "[TransactionsPage] Failed to load transactions",
        txnsResult.reason,
      );
    }
    if (forexAccountsResult.status === "rejected") {
      console.error(
        "[TransactionsPage] Failed to load Forex accounts",
        forexAccountsResult.reason,
      );
    }
    if (forexTxnsResult.status === "rejected") {
      console.error(
        "[TransactionsPage] Failed to load Forex cash transactions",
        forexTxnsResult.reason,
      );
      toast({
        variant: "error",
        message: "Không thể tải lịch sử Forex Cash. Vui lòng tải lại trang.",
      });
    }

    setTransactions(txns);
    setForexAccounts(forexAcc);
    setForexCashTransactions(forexTxns);
    setCategories(cats);
    setWallets(wlts);
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [reloadData]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);
  useRealtimeTable(
    [
      "transactions",
      "wallets",
      "categories",
      "forex_accounts",
      "forex_cash_transactions",
    ],
    reloadData,
  );

  const unifiedTransactions = useMemo(() => {
    const forexItems = forexCashTransactions.map((transaction) =>
      mapForexCashTransactionToUnified(
        transaction,
        forexAccounts.find(
          (account) => account.id === transaction.forexAccountId,
        ),
        wallets.find((wallet) => wallet.id === transaction.walletId),
      ),
    );

    return [...transactions, ...forexItems];
  }, [transactions, forexCashTransactions, forexAccounts, wallets]);

  const filtered = useMemo(() => {
    return unifiedTransactions.filter((t) => {
      if (!t.date.startsWith(selectedMonth)) return false;
      const cat = categories.find((c) => c.id === t.categoryId);
      const wal = wallets.find((w) => w.id === t.walletId);
      const dstWal = t.transferToWalletId
        ? wallets.find((w) => w.id === t.transferToWalletId)
        : undefined;
      const displayType = getTransactionDisplayType(t);
      const typeLabel =
        displayType === "income"
          ? "thu nhập income thu"
          : displayType === "expense"
            ? "chi tiêu expense chi"
            : displayType === "forex"
              ? "forex cash nạp rút tài khoản forex"
              : "chuyển khoản chuyển tiền nội bộ transfer";
      const searchText = [
        t.note,
        cat?.name,
        wal?.name,
        dstWal?.name,
        isForexUnifiedTransaction(t) ? t.forexAccountName : "",
        isForexUnifiedTransaction(t) ? t.sourceLabel : "",
        isForexUnifiedTransaction(t) ? t.destinationLabel : "",
        t.date,
        typeLabel,
        String(t.amount),
        formatVND(t.amount),
      ]
        .join(" ")
        .toLowerCase();
      if (typeFilter !== "all" && displayType !== typeFilter) return false;
      if (keyword && !searchText.includes(keyword.toLowerCase())) return false;
      const transactionDate = String(t.date ?? "").slice(0, 10);
      if (dateFrom && transactionDate < dateFrom) return false;
      if (dateTo && transactionDate > dateTo) return false;
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
    unifiedTransactions,
    selectedMonth,
    categories,
    wallets,
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
        const ca = categories.find((c) => c.id === a.categoryId)?.name ?? "";
        const cb = categories.find((c) => c.id === b.categoryId)?.name ?? "";
        cmp = ca.localeCompare(cb);
      } else {
        const wa = wallets.find((w) => w.id === a.walletId)?.name ?? "";
        const wb = wallets.find((w) => w.id === b.walletId)?.name ?? "";
        cmp = wa.localeCompare(wb);
      }

      if (cmp === 0) return compareTransactionNewestFirst(a, b);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, categories, wallets]);

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
  const totalExpense = useMemo(
    () => getTotalExpense(cashFlowTransactions, categories),
    [cashFlowTransactions, categories],
  );
  const totalLiquidity = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
    [wallets],
  );
  const netCashFlow = totalIncome - totalExpense;
  const internalTransferTurnover = useMemo(
    () =>
      filtered
        .filter(
          (transaction) =>
            isInternalTransferTransaction(transaction) ||
            isForexUnifiedTransaction(transaction),
        )
        .reduce(
          (sum, transaction) =>
            sum + getInternalTransferTurnoverAmount(transaction),
          0,
        ),
    [filtered],
  );
  const internalTransferNet = useMemo(
    () =>
      filtered
        .filter(
          (transaction) =>
            isInternalTransferTransaction(transaction) ||
            isForexUnifiedTransaction(transaction),
        )
        .reduce(
          (sum, transaction) =>
            sum + getInternalTransferSignedAmount(transaction),
          0,
        ),
    [filtered],
  );
  const transferCount = useMemo(
    () =>
      filtered.filter(
        (transaction) =>
          isInternalTransferTransaction(transaction) ||
          isForexUnifiedTransaction(transaction),
      ).length,
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
    setPendingAction({
      title: `Xóa ${count} giao dịch?`,
      description: `Hành động này không thể hoàn tác. ${count} giao dịch đã chọn sẽ bị xóa vĩnh viễn.`,
      variant: "danger",
      confirmText: "Xóa tất cả",
      onConfirm: async () => {
        for (const id of idsToDelete) {
          const unifiedTransaction = unifiedTransactions.find(
            (item) => item.id === id,
          );
          if (
            unifiedTransaction &&
            isForexUnifiedTransaction(unifiedTransaction)
          ) {
            const { error } = await deleteForexCashTransaction(
              unifiedTransaction.sourceId,
            );
            if (error) {
              toast({
                variant: "error",
                message: "Lỗi xóa giao dịch Forex: " + error,
              });
              return;
            }
            continue;
          }

          const transaction = transactions.find((item) => item.id === id);
          if (transaction?.type === "transfer") {
            const balanceResult = await applyTransferWalletBalance(
              transaction,
              -1,
            );
            if (balanceResult.error) {
              toast({ variant: "error", message: balanceResult.error });
              return;
            }
          }
          const { error } = await deleteTransaction(id);
          if (error) {
            if (transaction?.type === "transfer") {
              await applyTransferWalletBalance(transaction, 1);
            }
            toast({ variant: "error", message: "Lỗi xóa giao dịch: " + error });
            return;
          }
        }
        setSelectedIds(new Set());
        toast({ variant: "success", message: `Đã xóa ${count} giao dịch.` });
        await reloadData();
      },
    });
  }

  function exportCSV() {
    const toExport =
      selectedIds.size > 0
        ? sorted.filter((t) => selectedIds.has(t.id))
        : sorted;
    const rows = [
      ["Ngày", "Loại", "Ghi chú", "Danh mục", "Ví", "Số tiền"],
      ...toExport.map((t) => {
        const cat = categories.find((c) => c.id === t.categoryId)?.name ?? "";
        const wal = wallets.find((w) => w.id === t.walletId)?.name ?? "";
        const dstWal = t.transferToWalletId
          ? (wallets.find((w) => w.id === t.transferToWalletId)?.name ?? "")
          : "";
        return [
          t.date,
          isForexUnifiedTransaction(t)
            ? t.forexType === "deposit"
              ? "Nạp Forex"
              : "Rút Forex"
            : t.type === "income"
              ? "Thu"
              : t.type === "transfer"
                ? "Chuyển"
                : "Chi",
          t.note,
          cat,
          isForexUnifiedTransaction(t)
            ? `${t.sourceLabel} -> ${t.destinationLabel}`
            : t.type === "transfer" && dstWal
              ? wal + " -> " + dstWal
              : wal,
          String(t.amount),
        ];
      }),
    ];
    const csv = rows
      .map((r) => r.map((v) => '"' + v + '"').join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    a.click();
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

  function openCreateForm() {
    const defaultMode: TransactionFormMode = "expense";
    setForm({
      ...emptyForm,
      formMode: defaultMode,
      type: getTransactionTypeFromFormMode(defaultMode),
      categoryId:
        categories.find((category) => {
          if (category.type !== "expense") return false;
          const group = getCategoryPlanningGroup(category);
          return group === "fixed" || group === "variable";
        })?.id ?? "",
      walletId: wallets[0]?.id ?? "",
    });
    setSaveError(null);
    setIsFormOpen(true);
  }

  function openEditForm(t: Transaction) {
    if (isForexUnifiedTransaction(t)) {
      toast({
        variant: "info",
        message: "Hãy chỉnh sửa giao dịch Forex tại trang Đầu tư.",
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
    });
    setSaveError(null);
    setIsFormOpen(true);
  }

  function handleTypeChange(mode: TransactionFormMode) {
    const nextType = getTransactionTypeFromFormMode(mode);

    const nextCategoryId =
      mode === "transfer"
        ? ""
        : (categories.find((category) => {
            if (mode === "income") {
              return (
                category.type === "income" &&
                getCategoryPlanningGroup(category) === "income"
              );
            }

            if (category.type !== "expense") return false;
            const group = getCategoryPlanningGroup(category);
            return group === "fixed" || group === "variable";
          })?.id ?? "");

    setForm((prev) => ({
      ...prev,
      formMode: mode,
      type: nextType,
      categoryId: nextCategoryId,
      transferToWalletId: mode === "transfer" ? prev.transferToWalletId : "",
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
      recurrence: form.isRecurring ? form.recurrence : undefined,
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

    let balanceResult:
      | { error: string | null; previousWallets: Wallet[] }
      | undefined;

    if (isWalletTransferForm) {
      balanceResult = form.id
        ? await replaceTransferWalletBalance(oldTransaction, transaction)
        : await applyTransferWalletBalance(transaction, 1);
      if (balanceResult.error) {
        setSaveError(balanceResult.error);
        toast({ variant: "error", message: balanceResult.error });
        return;
      }
    }

    const { error } = form.id
      ? await updateTransaction(transaction)
      : await addTransaction(transaction);
    if (error) {
      if (isWalletTransferForm) {
        await restoreWalletSnapshots(balanceResult?.previousWallets);
      }
      setSaveError(error);
      toast({ variant: "error", message: error });
      return;
    }
    await reloadData();
    toast({
      variant: "success",
      message: form.id
        ? "Đã cập nhật giao dịch thành công."
        : "Đã thêm giao dịch thành công.",
    });
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  function handleDelete(id: string) {
    setPendingAction({
      title: "Xóa giao dịch?",
      description:
        "Hành động này không thể hoàn tác. Dữ liệu sẽ bị xóa khỏi tài khoản của bạn.",
      variant: "danger",
      onConfirm: async () => {
        const unifiedTransaction = unifiedTransactions.find(
          (item) => item.id === id,
        );
        if (
          unifiedTransaction &&
          isForexUnifiedTransaction(unifiedTransaction)
        ) {
          const { error } = await deleteForexCashTransaction(
            unifiedTransaction.sourceId,
          );
          if (error) {
            toast({
              variant: "error",
              message: "Lỗi xóa giao dịch Forex: " + error,
            });
            return;
          }
          toast({ variant: "success", message: "Đã xóa giao dịch Forex." });
          await reloadData();
          return;
        }

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
        await reloadData();
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
  const savingRate =
    totalIncome > 0
      ? Math.round((Math.max(0, netCashFlow) / totalIncome) * 100)
      : 0;
  const totalPot = totalIncome + totalExpense;
  const incomePct =
    totalPot > 0
      ? Math.min(Math.round((totalIncome / totalPot) * 100), 100)
      : 50;

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
    <div className="space-y-4 overflow-x-hidden pb-24 md:space-y-5 md:pb-0">
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
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-500">
              Transaction Center
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
              Giao dịch
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Theo dõi các khoản thu, chi và chuyển tiền trong tháng{" "}
              {selectedMonth}.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-200/60 transition hover:bg-blue-700 active:scale-[.98]"
          >
            <Plus size={16} />
            Thêm giao dịch
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Thu nhập"
            value={formatVND(totalIncome)}
            note={`${cashFlowTransactions.filter((item) => item.type === "income").length} giao dịch`}
            tone="income"
          />
          <SummaryCard
            label="Chi tiêu"
            value={formatVND(totalExpense)}
            note={`${cashFlowTransactions.filter((item) => item.type === "expense").length} giao dịch`}
            tone="expense"
          />
          <SummaryCard
            label="Dòng tiền ròng"
            value={getSignedAmountText(netCashFlow)}
            note={netCashFlow >= 0 ? "Thu lớn hơn chi" : "Chi lớn hơn thu"}
            tone={netCashFlow >= 0 ? "positive" : "negative"}
          />
          <SummaryCard
            label="Chuyển nội bộ"
            value={formatVND(internalTransferTurnover)}
            note={`${transferCount} giao dịch`}
            tone="transfer"
          />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECTION 2 · Smart Filter Command Bar (sticky)
          ════════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20">
        <div className="rounded-4xl border border-slate-200 bg-white/95 shadow-md shadow-slate-200/80 backdrop-blur-md">
          {/* Main bar */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
            {/* Search */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 transition-all focus-within:border-blue-400 focus-within:bg-white focus-within:shadow-sm">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm giao dịch, danh mục, ví tiền..."
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              {keyword && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
                    {sorted.length}
                  </span>
                  <button
                    onClick={() => setKeyword("")}
                    className="text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Type filter pills — color-coded */}
            <div className="flex gap-0.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {(["all", "income", "expense", "transfer", "forex"] as const).map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={
                      "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-150 " +
                      (typeFilter === t
                        ? t === "income"
                          ? "bg-emerald-500 text-white shadow-sm"
                          : t === "expense"
                            ? "bg-rose-500 text-white shadow-sm"
                            : t === "forex"
                              ? "bg-cyan-600 text-white shadow-sm"
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
                          : t === "forex"
                            ? "Forex"
                            : "Chi"}
                  </button>
                ),
              )}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1.5">
              {/* Filter toggle with badge */}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={
                  "relative flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all " +
                  (showFilters || hasActiveFilters
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
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

              {/* Export */}
              <button
                onClick={exportCSV}
                title="Xuất CSV"
                className="flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              >
                <Download size={14} />
              </button>

              {/* View mode toggle */}
              <div className="flex gap-0.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => setViewMode("table")}
                  title="Table view"
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
                  title="Timeline view"
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
                        : typeFilter === "forex"
                          ? "Forex Cash"
                          : "Chi tiêu"
                  }
                  onRemove={() => setTypeFilter("all")}
                  color={
                    typeFilter === "income"
                      ? "emerald"
                      : typeFilter === "transfer"
                        ? "slate"
                        : typeFilter === "forex"
                          ? "blue"
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
      <section className="overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-sm">
        {/* Feed header */}
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/40 px-6 py-3.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-blue-700">
              {sorted.length} giao dịch
            </p>
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                Đã lọc
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
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
            <div className="hidden grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px] items-center border-b border-blue-100 bg-white px-6 py-3 text-xs font-black uppercase tracking-wide text-blue-400 lg:grid">
              <div>
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size === sorted.length && sorted.length > 0
                  }
                  onChange={toggleSelectAll}
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
              {timelineGroups.map(({ date, txns }) => {
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
                      isInternalTransferTransaction(transaction) ||
                      isForexUnifiedTransaction(transaction),
                  )
                  .reduce(
                    (sum, transaction) =>
                      sum + getInternalTransferTurnoverAmount(transaction),
                    0,
                  );
                return (
                  <div key={date}>
                    <div className="sticky top-0 z-1 flex items-center justify-between border-b border-slate-100 bg-slate-50/95 px-4 py-2.5 backdrop-blur sm:px-6">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">
                          {formatTransactionDayLabel(date)}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-400 ring-1 ring-slate-200">
                          {txns.length} giao dịch
                        </span>
                      </div>
                      <div className="hidden items-center gap-2 text-[11px] font-bold sm:flex">
                        {dayIncome > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-600">
                            +{formatVND(dayIncome)}
                          </span>
                        )}
                        {dayExpense > 0 && (
                          <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-600">
                            -{formatVND(dayExpense)}
                          </span>
                        )}
                        {dayTransferTurnover > 0 && (
                          <span
                            className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-600"
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

                    <div className="divide-y divide-slate-100/80">
                      {txns.map((t) => {
                        const cat = categories.find(
                          (c) => c.id === t.categoryId,
                        );
                        const wal = wallets.find((w) => w.id === t.walletId);
                        const dstWal = t.transferToWalletId
                          ? wallets.find((w) => w.id === t.transferToWalletId)
                          : undefined;
                        const isSelected = selectedIds.has(t.id);
                        const isSwiped = swipedId === t.id;
                        const displayType = getTransactionDisplayType(t);
                        const isIncome = displayType === "income";
                        const isForex = displayType === "forex";
                        const isTransfer =
                          displayType === "transfer" || isForex;
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
                                  openEditForm(t);
                                  setSwipedId(null);
                                }}
                                className="flex size-10 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 transition-all active:scale-90"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => {
                                  handleDelete(t.id);
                                  setSwipedId(null);
                                }}
                                className="flex size-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 transition-all active:scale-90"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            <div
                              className={
                                "grid gap-3 border-l-4 px-4 py-4 transition-all duration-200 hover:bg-blue-50/40 sm:px-6 lg:grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px] lg:items-center " +
                                getTransactionAccentClass(t) +
                                " " +
                                (isSelected ? "bg-blue-50" : "bg-white") +
                                " " +
                                (isSwiped
                                  ? "-translate-x-24 lg:translate-x-0"
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

                              {/* Note + icon */}
                              <div className="flex min-w-0 items-center gap-3.5">
                                <div
                                  className={
                                    "flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-sm " +
                                    (isIncome
                                      ? "bg-emerald-100 text-emerald-600"
                                      : isForex
                                        ? "bg-cyan-100 text-cyan-700"
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
                                <div className="min-w-0">
                                  <p className="max-w-65 truncate text-sm font-black text-slate-900">
                                    {getTransactionDisplayNote(t)}
                                  </p>
                                  <p className="mt-0.5 truncate text-xs font-medium text-slate-400 lg:hidden">
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
                                    {isForex ? "Forex Cash" : "Chuyển tiền"}
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
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(t.id)}
                                  className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                                  title="Xóa"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* Mobile: amount + actions row */}
                              <div className="flex items-center justify-between lg:hidden">
                                <span
                                  className={
                                    "text-base font-black " +
                                    getTransactionAmountColorClass(t)
                                  }
                                >
                                  {getTransactionAmountPrefix(t)}
                                  {formatVND(t.amount)}
                                </span>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => openEditForm(t)}
                                    className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400"
                                  >
                                    <Edit3 size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(t.id)}
                                    className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
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
              />
            )}
            {timelineGroups.map(({ date, txns }) => {
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
                    const cat = categories.find((c) => c.id === t.categoryId);
                    const wal = wallets.find((w) => w.id === t.walletId);
                    const tDstWal = t.transferToWalletId
                      ? wallets.find((w) => w.id === t.transferToWalletId)
                      : undefined;
                    const displayType = getTransactionDisplayType(t);
                    const isIncome = displayType === "income";
                    const isForexRow = displayType === "forex";
                    const isTransferRow =
                      displayType === "transfer" || isForexRow;
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
                              : isForexRow
                                ? "bg-cyan-100 text-cyan-700"
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
                            onClick={() => openEditForm(t)}
                            className="flex size-7 items-center justify-center rounded-xl border border-transparent text-slate-300 transition-all hover:border-slate-200 hover:text-blue-600"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
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
      </section>

      {/* ── CRUD Form Modal ─────────────────────────────────────────────── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex h-[min(92dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl">
            {/* Modal header */}
            <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.35rem] font-black tracking-tight text-slate-900 sm:text-xl">
                    {form.id ? "Sửa giao dịch" : "Thêm giao dịch"}
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium leading-4 text-slate-400 sm:text-xs">
                    Ghi nhận khoản thu, chi hoặc chuyển tiền giữa các ví.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95 sm:size-9"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            <form
              id="transaction-form"
              onSubmit={handleSubmit}
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 py-3 pb-5 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-4 sm:pb-5"
            >
              {/* Type selector — premium segmented control */}
              <div className="mb-3">
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
                          "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 text-center text-[12px] font-black transition-all active:scale-[.98] sm:min-h-14 sm:text-xs " +
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

              {/* Amount — hero input */}
              <div className="mb-4">
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
                    className="w-full rounded-2xl bg-transparent py-3.5 pl-11 pr-4 text-[1.7rem] font-black tracking-tight text-slate-900 outline-none placeholder:text-base placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-300 sm:py-4 sm:text-2xl"
                  />
                </div>

                <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {amountQuickActions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, amount: String(value) }))
                      }
                      className="min-h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-black text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95"
                    >
                      {value >= 1000000
                        ? value / 1000000 + "tr"
                        : value / 1000 + "k"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
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
                    onChange={(v) => setForm((p) => ({ ...p, walletId: v }))}
                    options={wallets.map((w) => ({
                      label: w.name,
                      value: w.id,
                    }))}
                  />
                ) : (
                  <FormSelect
                    label="Danh mục"
                    value={form.categoryId}
                    onChange={(v) => setForm((p) => ({ ...p, categoryId: v }))}
                    options={filteredCategories.map((c) => ({
                      label: c.name,
                      value: c.id,
                    }))}
                  />
                )}

                {form.type === "transfer" ? (
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

                <div
                  className={form.type === "transfer" ? "" : "md:col-span-1"}
                >
                  <FormInput
                    label="Ghi chú"
                    value={form.note}
                    onChange={(v) => setForm((p) => ({ ...p, note: v }))}
                    placeholder={
                      form.type === "transfer"
                        ? "Ví dụ: Chuyển qua ví chính"
                        : "Ví dụ: Ăn trưa, lương tháng..."
                    }
                  />
                </div>
              </div>

              {/* Wallet preview */}
              {canShowWalletPreview && (
                <div
                  className={
                    "mt-3 rounded-2xl border p-3 " +
                    modalAccent.border +
                    " " +
                    modalAccent.soft
                  }
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        Wallet Preview
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
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex min-h-14 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-black text-slate-700">Định kỳ</p>
                    <p className="text-xs font-medium text-slate-400">
                      Lặp lại tự động
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
                        setForm((p) => ({ ...p, isRecurring: !p.isRecurring }))
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
              </div>

              <SaveError
                message={saveError}
                onDismiss={() => setSaveError(null)}
              />
            </form>

            <div className="shrink-0 border-t border-slate-100 bg-white/95 px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_32px_rgba(15,23,42,0.06)] backdrop-blur sm:px-6 sm:py-3.5">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 transition-all hover:bg-slate-50 active:scale-[.98]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  form="transaction-form"
                  className={
                    "min-h-12 flex-1 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg transition-all active:scale-[.98] " +
                    modalAccent.bg +
                    " " +
                    modalAccent.bgHover +
                    " " +
                    modalAccent.shadow
                  }
                >
                  {form.id
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
        className="text-current opacity-60 hover:opacity-100"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "income" | "expense" | "positive" | "negative" | "transfer";
}) {
  const styles = {
    income: "border-emerald-200 bg-emerald-50 text-emerald-700",
    expense: "border-rose-200 bg-rose-50 text-rose-700",
    positive: "border-blue-200 bg-blue-50 text-blue-700",
    negative: "border-amber-200 bg-amber-50 text-amber-700",
    transfer: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };

  return (
    <div className={"rounded-3xl border p-4 " + styles[tone]}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 truncate text-xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold opacity-70">{note}</p>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
  onAdd,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onAdd: () => void;
}) {
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
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base outline-none transition-all focus:border-blue-400 focus:bg-white focus:shadow-sm sm:text-sm"
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
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base outline-none transition-all focus:border-blue-400 focus:bg-white sm:text-sm"
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
