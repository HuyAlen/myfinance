"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Percent,
  MessageSquareText,
  Clock3,
  Landmark,
  PiggyBank,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import type {
  SavingAccount,
  SavingType,
  Wallet as WalletType,
} from "@/src/types/finance";
import {
  createSavingAccount,
  createSavingMovement,
  deleteSavingAccount,
  getWallets,
  updateWallet,
} from "@/src/services/finance/financeStorage";
import { supabase } from "@/src/lib/supabase";

type SavingWithWallet = SavingAccount & {
  walletId?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SavingsPageProps = {
  savings?: SavingWithWallet[];
};

type SavingsFilter = "all" | "active" | "maturing" | "emergency" | "completed";

type SavingFormState = {
  name: string;
  type: SavingType;
  balance: string;
  walletId: string;
  interestRate: string;
  maturityDate: string;
  notes: string;
};

type ToastState = {
  type: "success" | "error";
  message: string;
};

type SavingTransactionType = "deposit" | "withdraw" | "interest" | "settlement";

type SavingTransaction = {
  id: string;
  savingId: string;
  type: SavingTransactionType;
  amount: number;
  date: string;
  note: string;
};

type TransactionFormState = {
  type: Exclude<SavingTransactionType, "interest">;
  amount: string;
  walletId: string;
  note: string;
};

type SavingRow = {
  id: string;
  user_id?: string | null;
  name: string;
  type: SavingType;
  balance: number;
  wallet_id: string | null;
  interest_rate: number | null;
  maturity_date: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

type SavingTransactionRow = {
  id: string;
  saving_id: string;
  user_id?: string | null;
  type: SavingTransactionType;
  amount: number;
  wallet_id?: string | null;
  transaction_date: string;
  note: string | null;
  created_at?: string;
};

const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const mapSavingRowToSaving = (row: SavingRow): SavingWithWallet => ({
  id: row.id,
  name: row.name,
  type: row.type,
  balance: Number(row.balance ?? 0),
  walletId: row.wallet_id ?? undefined,
  interestRate: row.interest_rate ?? undefined,
  maturityDate: row.maturity_date ?? undefined,
  notes: row.notes ?? undefined,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

const mapTransactionRowToTransaction = (
  row: SavingTransactionRow,
): SavingTransaction => ({
  id: row.id,
  savingId: row.saving_id,
  type: row.type,
  amount: Number(row.amount ?? 0),
  date: row.transaction_date,
  note: row.note ?? getTransactionLabel(row.type),
});

const groupTransactionsBySavingId = (transactions: SavingTransaction[]) =>
  transactions.reduce<Record<string, SavingTransaction[]>>((grouped, item) => {
    grouped[item.savingId] = [...(grouped[item.savingId] ?? []), item];
    return grouped;
  }, {});

const EMPTY_SAVINGS: SavingWithWallet[] = [];

const INITIAL_FORM: SavingFormState = {
  name: "",
  type: "savings_account",
  balance: "",
  walletId: "",
  interestRate: "",
  maturityDate: "",
  notes: "",
};

const INITIAL_TRANSACTION_FORM: TransactionFormState = {
  type: "deposit",
  amount: "",
  walletId: "",
  note: "",
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)}%`;

const formatDate = (date?: string) => {
  if (!date) return "-";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

const getDaysUntil = (date?: string) => {
  if (!date) return null;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
};

const getSavingTypeLabel = (type: SavingType) => {
  switch (type) {
    case "savings_account":
      return "Tài khoản tiết kiệm";
    case "term_deposit":
      return "Tiền gửi có kỳ hạn";
    case "certificate":
      return "Chứng chỉ tiền gửi";
    case "emergency_fund":
      return "Quỹ khẩn cấp";
    default:
      return "Khác";
  }
};

const getSavingStatus = (saving: SavingWithWallet) => {
  const daysUntilMaturity = getDaysUntil(saving.maturityDate);

  if (daysUntilMaturity !== null && daysUntilMaturity < 0) {
    return {
      label: "Đã đáo hạn",
      className: "bg-slate-100 text-slate-600",
    };
  }

  if (daysUntilMaturity !== null && daysUntilMaturity <= 30) {
    return {
      label: "Đáo hạn gần nhất",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (saving.type === "emergency_fund") {
    return {
      label: "Quỹ khẩn cấp",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "Đang gửi",
    className: "bg-blue-100 text-blue-700",
  };
};

const estimateAnnualInterest = (saving: SavingAccount) => {
  const rate = saving.interestRate ?? 0;
  return calculateProjectedInterest(saving.balance, rate, saving.maturityDate);
};

const parseNumberInput = (value: string) => {
  const normalized = value
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCurrencyValue = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return 0;

  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCurrencyInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return "";

  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(Number(digitsOnly));
};

const formatCurrencyInputFromNumber = (value: number) =>
  value > 0
    ? new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 0,
      }).format(value)
    : "";

const calculateProjectedInterest = (
  principal: number,
  annualRate: number,
  maturityDate?: string,
) => {
  if (principal <= 0 || annualRate <= 0) return 0;

  const daysUntilMaturity = getDaysUntil(maturityDate);
  const termInDays =
    daysUntilMaturity !== null && daysUntilMaturity > 0
      ? daysUntilMaturity
      : 365;

  return Math.round((principal * annualRate * termInDays) / 100 / 365);
};

const getSavingFormConfig = (type: SavingType) => {
  switch (type) {
    case "term_deposit":
      return {
        nameLabel: "Tên sổ tiết kiệm",
        namePlaceholder: "Ví dụ: Sổ tiết kiệm Techcombank 6 tháng",
        amountLabel: "Số tiền gửi",
        amountPlaceholder: "50.000.000",
        showInterestRate: true,
        interestLabel: "Lãi suất / năm (%)",
        interestPlaceholder: "5.8",
        showMaturityDate: true,
        maturityLabel: "Ngày đáo hạn",
        maturityRequired: true,
        notesPlaceholder: "Ví dụ: Tự động tái tục gốc và lãi",
        previewTitle: "Interest Preview",
        previewDescription:
          "Ước tính lãi theo ngày đáo hạn. Nếu chưa chọn ngày, hệ thống tạm tính theo 1 năm.",
        interestTitle: "Lãi dự kiến",
        totalTitle: "Giá trị đáo hạn",
      };

    case "certificate":
      return {
        nameLabel: "Tên chứng chỉ tiền gửi",
        namePlaceholder: "Ví dụ: Chứng chỉ tiền gửi ngân hàng 12 tháng",
        amountLabel: "Giá trị chứng chỉ",
        amountPlaceholder: "100.000.000",
        showInterestRate: true,
        interestLabel: "Lãi suất chứng chỉ / năm (%)",
        interestPlaceholder: "6.2",
        showMaturityDate: true,
        maturityLabel: "Ngày tất toán",
        maturityRequired: true,
        notesPlaceholder: "Ví dụ: Không rút trước hạn, giữ đến ngày tất toán",
        previewTitle: "Certificate Preview",
        previewDescription:
          "Ước tính lợi tức đến ngày tất toán. Nếu chưa chọn ngày, hệ thống tạm tính theo 1 năm.",
        interestTitle: "Lợi tức dự kiến",
        totalTitle: "Giá trị tất toán",
      };

    case "emergency_fund":
      return {
        nameLabel: "Tên quỹ khẩn cấp",
        namePlaceholder: "Ví dụ: Quỹ khẩn cấp gia đình",
        amountLabel: "Số tiền gửi ban đầu",
        amountPlaceholder: "30.000.000",
        showInterestRate: false,
        interestLabel: "",
        interestPlaceholder: "",
        showMaturityDate: false,
        maturityLabel: "",
        maturityRequired: false,
        notesPlaceholder: "Ví dụ: Dự phòng 6 tháng chi phí sinh hoạt",
        previewTitle: "Emergency Fund Preview",
        previewDescription:
          "Quỹ khẩn cấp là khoản linh hoạt, không cần lãi suất hoặc ngày đáo hạn.",
        interestTitle: "Lãi dự kiến",
        totalTitle: "Tổng quỹ",
      };

    case "savings_account":
    default:
      return {
        nameLabel: "Tên tài khoản tiết kiệm",
        namePlaceholder: "Ví dụ: Tài khoản tiết kiệm linh hoạt",
        amountLabel: "Số dư hiện tại",
        amountPlaceholder: "50.000.000",
        showInterestRate: true,
        interestLabel: "Lãi suất / năm (%)",
        interestPlaceholder: "4.5",
        showMaturityDate: false,
        maturityLabel: "",
        maturityRequired: false,
        notesPlaceholder: "Ví dụ: Tài khoản linh hoạt, có thể nạp/rút khi cần",
        previewTitle: "Savings Preview",
        previewDescription:
          "Tài khoản tiết kiệm linh hoạt được ước tính theo 1 năm vì không có ngày đáo hạn.",
        interestTitle: "Lãi dự kiến / năm",
        totalTitle: "Giá trị sau 1 năm",
      };
  }
};

const isInterestBearingSaving = (type: SavingType) =>
  type === "savings_account" ||
  type === "term_deposit" ||
  type === "certificate";

const getTransactionLabel = (type: SavingTransactionType) => {
  switch (type) {
    case "deposit":
      return "Nạp thêm";
    case "withdraw":
      return "Rút tiền";
    case "interest":
      return "Ghi nhận lãi";
    case "settlement":
      return "Tất toán";
    default:
      return "Giao dịch";
  }
};

const getTransactionIcon = (type: SavingTransactionType) => {
  switch (type) {
    case "deposit":
      return <ArrowUpRight size={17} />;
    case "withdraw":
      return <ArrowDownLeft size={17} />;
    case "interest":
      return <TrendingUp size={17} />;
    case "settlement":
      return <CheckCircle2 size={17} />;
    default:
      return <Banknote size={17} />;
  }
};

const getSignedTransactionAmount = (transaction: SavingTransaction) => {
  if (transaction.type === "withdraw" || transaction.type === "settlement") {
    return -transaction.amount;
  }

  return transaction.amount;
};

const MONTHLY_EXPENSE_TARGET = 25_000_000;
const EMERGENCY_MONTH_TARGET = 6;

const getSavingProgress = (saving: SavingWithWallet) => {
  const days = getDaysUntil(saving.maturityDate);

  if (days === null) return 100;
  if (days <= 0) return 100;

  const estimatedTermDays = days > 365 ? days + 180 : 365;
  return Math.max(
    8,
    Math.min(100, Math.round(100 - (days / estimatedTermDays) * 100)),
  );
};

const getProgressLabel = (saving: SavingWithWallet) => {
  const days = getDaysUntil(saving.maturityDate);

  if (days === null) return "Linh hoạt";
  if (days < 0) return "Đã đáo hạn";
  if (days === 0) return "Đáo hạn hôm nay";
  return `Còn ${days} ngày`;
};

export default function SavingsPage({
  savings = EMPTY_SAVINGS,
}: SavingsPageProps) {
  const [localSavings, setLocalSavings] = useState<SavingWithWallet[]>(savings);
  const [wallets, setWallets] = useState<WalletType[]>([]);
  // FINANCE-DATA-1B: selectedWalletBalance below falls back to 0 when the
  // wallet lookup misses. If that miss is because the wallet load actually
  // FAILED (rather than the wallet genuinely not existing), showing "0 đ"
  // reads as an authoritative current balance — set on load failure so the
  // balance UI can show a neutral message instead, and cleared on success.
  const [walletsLoadError, setWalletsLoadError] = useState<string | null>(
    null,
  );
  const walletsRef = useRef<WalletType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<SavingsFilter>("all");
  const [] = useState<string[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingSavingId, setEditingSavingId] = useState<string | null>(null);
  const [transactionSavingId, setTransactionSavingId] = useState<string | null>(
    null,
  );
  const [historySavingId, setHistorySavingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavingWithWallet | null>(
    null,
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [form, setForm] = useState<SavingFormState>(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [transactionsBySavingId, setTransactionsBySavingId] = useState<
    Record<string, SavingTransaction[]>
  >({});
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>(
    INITIAL_TRANSACTION_FORM,
  );
  const [transactionError, setTransactionError] = useState("");
  const [isHydrating, setIsHydrating] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);

  const metrics = useMemo(() => {
    const totalSavings = localSavings.reduce(
      (sum, item) => sum + item.balance,
      0,
    );
    const totalPrincipal = localSavings.reduce(
      (sum, item) => sum + item.balance,
      0,
    );
    const expectedInterest = localSavings.reduce(
      (sum, item) => sum + estimateAnnualInterest(item),
      0,
    );
    const emergencyFund = localSavings
      .filter((item) => item.type === "emergency_fund")
      .reduce((sum, item) => sum + item.balance, 0);
    const maturingSoon = localSavings.filter((item) => {
      const days = getDaysUntil(item.maturityDate);
      return days !== null && days >= 0 && days <= 30;
    }).length;

    return {
      totalSavings,
      totalPrincipal,
      expectedInterest,
      emergencyFund,
      maturingSoon,
    };
  }, [localSavings]);

  const filteredSavings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return localSavings.filter((item) => {
      const days = getDaysUntil(item.maturityDate);
      const matchesSearch =
        normalizedSearch.length === 0 ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        getSavingTypeLabel(item.type)
          .toLowerCase()
          .includes(normalizedSearch) ||
        (item.notes ?? "").toLowerCase().includes(normalizedSearch);

      const matchesFilter = (() => {
        switch (activeFilter) {
          case "active":
            return days === null || days >= 0;
          case "maturing":
            return days !== null && days >= 0 && days <= 30;
          case "emergency":
            return item.type === "emergency_fund";
          case "completed":
            return days !== null && days < 0;
          default:
            return true;
        }
      })();

      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, localSavings, searchTerm]);

  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);

  const activeSavingId =
    editingSavingId ?? transactionSavingId ?? historySavingId;
  const selectedSaving = useMemo(
    () =>
      activeSavingId
        ? (localSavings.find((item) => item.id === activeSavingId) ?? null)
        : null,
    [activeSavingId, localSavings],
  );

  const selectedWallet = useMemo(
    () =>
      wallets.find((wallet) => wallet.id === transactionForm.walletId) ?? null,
    [transactionForm.walletId, wallets],
  );

  const selectedInitialWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === form.walletId) ?? null,
    [form.walletId, wallets],
  );

  const selectedTransactions = useMemo(() => {
    if (!selectedSaving) return [];

    return [...(transactionsBySavingId[selectedSaving.id] ?? [])].sort(
      (left, right) => right.date.localeCompare(left.date),
    );
  }, [selectedSaving, transactionsBySavingId]);

  const transactionAmountPreview = parseCurrencyValue(transactionForm.amount);
  const transactionWalletBalanceAfter = selectedWallet
    ? transactionForm.type === "deposit"
      ? selectedWallet.balance - transactionAmountPreview
      : selectedWallet.balance +
        (transactionForm.type === "settlement" && transactionAmountPreview <= 0
          ? (selectedSaving?.balance ?? 0)
          : transactionAmountPreview)
    : null;
  const transactionSavingBalanceAfter = selectedSaving
    ? transactionForm.type === "deposit"
      ? selectedSaving.balance + transactionAmountPreview
      : transactionForm.type === "settlement"
        ? 0
        : Math.max(0, selectedSaving.balance - transactionAmountPreview)
    : null;
  const transactionPreviewAmount =
    transactionForm.type === "settlement" && transactionAmountPreview <= 0
      ? (selectedSaving?.balance ?? 0)
      : transactionAmountPreview;

  const formConfig = getSavingFormConfig(form.type);
  const previewPrincipal = parseCurrencyValue(form.balance);
  const previewRate = formConfig.showInterestRate
    ? parseNumberInput(form.interestRate)
    : 0;
  const previewInterest = formConfig.showInterestRate
    ? calculateProjectedInterest(
        previewPrincipal,
        previewRate,
        formConfig.showMaturityDate
          ? form.maturityDate || undefined
          : undefined,
      )
    : 0;

  const filters: Array<{ key: SavingsFilter; label: string; count?: number }> =
    [
      { key: "all", label: "Tất cả", count: localSavings.length },
      { key: "active", label: "Đang gửi" },
      { key: "maturing", label: "Sắp đáo hạn", count: metrics.maturingSoon },
      { key: "emergency", label: "Quỹ khẩn cấp" },
      { key: "completed", label: "Đã tất toán" },
    ];

  const savingsExperience = useMemo(() => {
    const interestBearingSavings = localSavings.filter((item) =>
      isInterestBearingSaving(item.type),
    );
    const averageRate =
      interestBearingSavings.length > 0
        ? interestBearingSavings.reduce(
            (sum, item) => sum + (item.interestRate ?? 0),
            0,
          ) / interestBearingSavings.length
        : 0;

    const emergencyMonths =
      MONTHLY_EXPENSE_TARGET > 0
        ? metrics.emergencyFund / MONTHLY_EXPENSE_TARGET
        : 0;
    const emergencyTarget = MONTHLY_EXPENSE_TARGET * EMERGENCY_MONTH_TARGET;
    const emergencyProgress =
      emergencyTarget > 0
        ? Math.min(
            100,
            Math.round((metrics.emergencyFund / emergencyTarget) * 100),
          )
        : 0;
    const emergencyGap = Math.max(0, emergencyTarget - metrics.emergencyFund);
    const emergencyMonthlyTopUp = Math.ceil(emergencyGap / 6);

    const nextMaturity = [...localSavings]
      .filter((saving) => {
        const days = getDaysUntil(saving.maturityDate);
        return days !== null && days >= 0;
      })
      .sort(
        (left, right) =>
          (getDaysUntil(left.maturityDate) ?? 9999) -
          (getDaysUntil(right.maturityDate) ?? 9999),
      )[0];

    return {
      averageRate,
      emergencyMonths,
      emergencyTarget,
      emergencyProgress,
      emergencyGap,
      emergencyMonthlyTopUp,
      nextMaturity,
    };
  }, [localSavings, metrics.emergencyFund]);

  const savingsAnalytics = useMemo(() => {
    const allTransactions = Object.values(transactionsBySavingId).flat();
    const totalDeposits = allTransactions
      .filter((item) => item.type === "deposit" || item.type === "interest")
      .reduce((sum, item) => sum + item.amount, 0);
    const totalWithdrawals = allTransactions
      .filter((item) => item.type === "withdraw" || item.type === "settlement")
      .reduce((sum, item) => sum + item.amount, 0);
    const netMovement = totalDeposits - totalWithdrawals;

    const allocation = (
      [
        "emergency_fund",
        "savings_account",
        "term_deposit",
        "certificate",
      ] as SavingType[]
    )
      .map((type) => ({
        type,
        label: getSavingTypeLabel(type),
        value: localSavings
          .filter((item) => item.type === type)
          .reduce((sum, item) => sum + item.balance, 0),
      }))
      .filter((item) => item.value > 0);

    const recentTransactions = allTransactions
      .map((transaction) => ({
        ...transaction,
        savingName:
          localSavings.find((saving) => saving.id === transaction.savingId)
            ?.name ?? "Khoản tiết kiệm",
      }))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 6);

    const averageBalance =
      localSavings.length > 0 ? metrics.totalSavings / localSavings.length : 0;

    const baseRate = Math.max(savingsExperience.averageRate, 0);
    const projection = [1, 3, 5].map((years) => ({
      years,
      value: Math.round(
        metrics.totalSavings * Math.pow(1 + baseRate / 100, years),
      ),
    }));

    return {
      totalDeposits,
      totalWithdrawals,
      netMovement,
      allocation,
      recentTransactions,
      averageBalance,
      projection,
    };
  }, [
    transactionsBySavingId,
    localSavings,
    metrics.totalSavings,
    savingsExperience.averageRate,
  ]);

  const isEditing = editingSavingId !== null;
  // A failed wallet load means this lookup miss is unknown, not a real
  // zero balance — don't let 0 stand in as an authoritative balance.
  const hasUnknownWalletBalance = !selectedInitialWallet && !!walletsLoadError;
  const selectedWalletBalance = selectedInitialWallet?.balance ?? 0;
  const isInitialDepositTooHigh =
    !isEditing &&
    !hasUnknownWalletBalance &&
    form.walletId.length > 0 &&
    previewPrincipal > 0 &&
    previewPrincipal > selectedWalletBalance;
  const walletBalanceAfterInitialDeposit =
    !isEditing && selectedInitialWallet
      ? selectedWalletBalance - previewPrincipal
      : selectedWalletBalance;

  const showToast = useCallback((nextToast: ToastState) => {
    setToast(nextToast);
  }, []);

  const persistWalletBalance = useCallback(async (wallet: WalletType) => {
    const localResult = await updateWallet(wallet);

    if (localResult.error) {
      return localResult;
    }

    if (supabase) {
      const { error } = await supabase
        .from("wallets")
        .update({ balance: wallet.balance })
        .eq("id", wallet.id);

      if (error) {
        return { error: error.message };
      }
    }

    return { error: null };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadWalletsForSavingsEngine() {
      try {
        const walletRows = await getWallets();
        if (!isMounted) return;

        setWallets(walletRows);
        setWalletsLoadError(null);
        setTransactionForm((current) =>
          current.walletId || !walletRows[0]?.id
            ? current
            : { ...current, walletId: walletRows[0].id },
        );
        setForm((current) => {
          const defaultWallet = walletRows[0] ?? null;

          if (current.walletId || !defaultWallet?.id) {
            return current;
          }

          return {
            ...current,
            walletId: defaultWallet.id,
            balance: current.balance
              ? current.balance
              : formatCurrencyInputFromNumber(defaultWallet.balance),
          };
        });
      } catch (error) {
        if (!isMounted) return;

        setWalletsLoadError(
          "Không thể tải số dư ví. Vui lòng tải lại trang.",
        );
        showToast({
          type: "error",
          message:
            error instanceof Error
              ? `Không thể tải ví để đồng bộ tiết kiệm: ${error.message}`
              : "Không thể tải ví để đồng bộ tiết kiệm.",
        });
      }
    }

    void loadWalletsForSavingsEngine();

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    const fetchSavingsData = async () => {
      setIsHydrating(true);

      const [
        { data: savingRows, error: savingsError },
        { data: transactionRows, error: transactionsError },
      ] = await Promise.all([
        supabase
          .from("savings")
          .select(
            "id,user_id,name,type,balance,wallet_id,interest_rate,maturity_date,notes,created_at,updated_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("saving_transactions")
          .select(
            "id,saving_id,user_id,type,amount,wallet_id,transaction_date,note,created_at",
          )
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) return;

      if (savingsError || transactionsError) {
        showToast({
          type: "error",
          message:
            savingsError?.message ||
            transactionsError?.message ||
            "Không thể tải dữ liệu tiết kiệm từ Supabase.",
        });
        setIsHydrating(false);
        return;
      }

      const nextSavings = (savingRows ?? []).map((row: SavingRow) =>
        mapSavingRowToSaving(row),
      );
      const nextTransactions = (transactionRows ?? []).map(
        (row: SavingTransactionRow) => mapTransactionRowToTransaction(row),
      );

      setLocalSavings(nextSavings);
      setTransactionsBySavingId(groupTransactionsBySavingId(nextTransactions));
      setIsHydrating(false);
    };

    void fetchSavingsData();

    return () => {
      isMounted = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (!toast) return;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const updateForm = <Key extends keyof SavingFormState>(
    key: Key,
    value: SavingFormState[Key],
  ) => {
    setForm((current) => {
      if (key === "walletId") {
        const nextWalletId = value as string;
        const nextWallet = wallets.find((wallet) => wallet.id === nextWalletId);

        return {
          ...current,
          walletId: nextWalletId,
          balance:
            !isEditing && nextWallet
              ? formatCurrencyInputFromNumber(nextWallet.balance)
              : current.balance,
        };
      }

      if (key !== "type") {
        return { ...current, [key]: value };
      }

      const nextType = value as SavingType;
      const nextConfig = getSavingFormConfig(nextType);

      return {
        ...current,
        type: nextType,
        interestRate: nextConfig.showInterestRate ? current.interestRate : "",
        maturityDate: nextConfig.showMaturityDate ? current.maturityDate : "",
      };
    });
    setFormError("");
  };

  const openAddModal = () => {
    const defaultWallet = wallets[0] ?? null;

    setEditingSavingId(null);
    setTransactionSavingId(null);
    setHistorySavingId(null);
    setForm({
      ...INITIAL_FORM,
      walletId: defaultWallet?.id ?? "",
      balance: defaultWallet
        ? formatCurrencyInputFromNumber(defaultWallet.balance)
        : "",
    });
    setFormError("");
    setTransactionForm({
      ...INITIAL_TRANSACTION_FORM,
      walletId: defaultWallet?.id ?? "",
      note: "",
    });
    setTransactionError("");
    setIsAddOpen(true);
  };

  const openEditModal = (saving: SavingWithWallet) => {
    const selectedConfig = getSavingFormConfig(saving.type);

    setTransactionSavingId(null);
    setHistorySavingId(null);
    setEditingSavingId(saving.id);
    setForm({
      name: saving.name,
      type: saving.type,
      balance: formatCurrencyInputFromNumber(saving.balance),
      walletId: saving.walletId ?? wallets[0]?.id ?? "",
      interestRate: selectedConfig.showInterestRate
        ? String(saving.interestRate ?? "")
        : "",
      maturityDate: selectedConfig.showMaturityDate
        ? (saving.maturityDate ?? "")
        : "",
      notes: saving.notes ?? "",
    });
    setFormError("");
    setIsAddOpen(true);
  };

  const openMoneyMovementModal = (
    saving: SavingWithWallet,
    type: Exclude<SavingTransactionType, "interest">,
  ) => {
    setIsAddOpen(false);
    setEditingSavingId(null);
    setHistorySavingId(null);
    setTransactionSavingId(saving.id);
    setTransactionForm({
      type,
      amount:
        type === "settlement"
          ? formatCurrencyInputFromNumber(saving.balance)
          : "",
      walletId: saving.walletId ?? wallets[0]?.id ?? "",
      note: "",
    });
    setTransactionError("");
  };

  const openHistoryModal = (saving: SavingWithWallet) => {
    setIsAddOpen(false);
    setEditingSavingId(null);
    setTransactionSavingId(null);
    setHistorySavingId(saving.id);
  };

  const closeAddModal = () => {
    setIsAddOpen(false);
    setEditingSavingId(null);
    setFormError("");
  };

  const closeMoneyMovementModal = () => {
    setTransactionSavingId(null);
    setTransactionError("");
    setTransactionForm(INITIAL_TRANSACTION_FORM);
  };

  const closeHistoryModal = () => {
    setHistorySavingId(null);
  };

  const handleSubmitSaving = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const selectedConfig = getSavingFormConfig(form.type);
    const rawFormBalance = parseCurrencyValue(form.balance);
    const balance =
      editingSavingId && selectedSaving
        ? selectedSaving.balance
        : rawFormBalance;
    const interestRate = selectedConfig.showInterestRate
      ? parseNumberInput(form.interestRate)
      : undefined;

    if (!name) {
      setFormError("Vui lòng nhập tên khoản tiết kiệm.");
      return;
    }

    if (!editingSavingId && balance <= 0) {
      setFormError("Số tiền gửi ban đầu phải lớn hơn 0.");
      return;
    }

    if (!form.walletId) {
      setFormError(
        editingSavingId
          ? "Vui lòng chọn ví liên kết cho khoản tiết kiệm."
          : "Vui lòng chọn ví nguồn để tạo khoản tiết kiệm.",
      );
      return;
    }

    if (!editingSavingId && !selectedInitialWallet) {
      setFormError("Vui lòng chọn ví nguồn để tạo khoản tiết kiệm.");
      return;
    }

    if (
      !editingSavingId &&
      selectedInitialWallet &&
      selectedInitialWallet.balance < balance
    ) {
      setFormError("Ví nguồn không đủ số dư để tạo khoản tiết kiệm.");
      return;
    }

    if ((interestRate ?? 0) < 0) {
      setFormError("Lãi suất không được nhỏ hơn 0.");
      return;
    }

    if (selectedConfig.maturityRequired && !form.maturityDate) {
      setFormError(
        `Vui lòng chọn ${selectedConfig.maturityLabel.toLowerCase()}.`,
      );
      return;
    }

    const localId = editingSavingId ?? `saving-${Date.now()}`;
    const nextSaving = {
      id: localId,
      name,
      type: form.type,
      balance,
      walletId: form.walletId || undefined,
      interestRate,
      maturityDate: selectedConfig.showMaturityDate
        ? form.maturityDate || undefined
        : undefined,
      notes: form.notes.trim() || undefined,
    } satisfies SavingWithWallet;

    setIsPersisting(true);

    if (supabase) {
      const payload = {
        name,
        type: form.type,
        balance,
        wallet_id: form.walletId || null,
        interest_rate: interestRate ?? null,
        maturity_date: selectedConfig.showMaturityDate
          ? form.maturityDate || null
          : null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (editingSavingId) {
        const { data, error } = await supabase
          .from("savings")
          .update(payload)
          .eq("id", editingSavingId)
          .select(
            "id,user_id,name,type,balance,wallet_id,interest_rate,maturity_date,notes,created_at,updated_at",
          )
          .single();

        if (error) {
          setIsPersisting(false);
          showToast({
            type: "error",
            message: error.message || "Không thể cập nhật khoản tiết kiệm.",
          });
          return;
        }

        const savedSaving = mapSavingRowToSaving(data as SavingRow);
        setLocalSavings((current) =>
          current.map((item) =>
            item.id === editingSavingId ? savedSaving : item,
          ),
        );
      } else {
        const initialWallet = selectedInitialWallet;

        if (!initialWallet) {
          setIsPersisting(false);
          setFormError("Vui lòng chọn ví nguồn để tạo khoản tiết kiệm.");
          return;
        }

        // Finance Engine v3: wallet debit, the new saving row, and its
        // initial-deposit ledger row all commit or roll back together —
        // see supabase/finance-engine-3-savings-atomic.sql. No client-side
        // wallet arithmetic or manual multi-step undo is needed anymore.
        const { data: movement, error } = await createSavingAccount({
          id: crypto.randomUUID(),
          name,
          type: form.type,
          balance,
          walletId: initialWallet.id,
          savingTransactionId: crypto.randomUUID(),
          transactionDate: todayInputValue(),
          interestRate: interestRate ?? null,
          maturityDate: selectedConfig.showMaturityDate
            ? form.maturityDate || null
            : null,
          notes: form.notes.trim() || null,
        });

        if (error || !movement) {
          setIsPersisting(false);
          showToast({
            type: "error",
            message: error || "Không thể thêm khoản tiết kiệm.",
          });
          return;
        }

        const savedSaving = mapSavingRowToSaving(
          movement.saving as SavingRow,
        );

        setWallets((current) =>
          current.map((wallet) =>
            wallet.id === movement.wallet.id ? movement.wallet : wallet,
          ),
        );

        setLocalSavings((current) => [savedSaving, ...current]);

        const savedTransaction = mapTransactionRowToTransaction(
          movement.savingTransaction as SavingTransactionRow,
        );
        setTransactionsBySavingId((current) => ({
          ...current,
          [savedSaving.id]: [savedTransaction],
        }));
      }
    } else {
      if (!editingSavingId && selectedInitialWallet) {
        const nextWallet: WalletType = {
          ...selectedInitialWallet,
          balance: selectedInitialWallet.balance - balance,
        };
        const walletResult = await persistWalletBalance(nextWallet);
        if (walletResult.error) {
          setIsPersisting(false);
          setFormError(walletResult.error);
          return;
        }
        setWallets((current) =>
          current.map((wallet) =>
            wallet.id === nextWallet.id ? nextWallet : wallet,
          ),
        );
      }

      setLocalSavings((current) =>
        editingSavingId
          ? current.map((item) =>
              item.id === editingSavingId ? nextSaving : item,
            )
          : [nextSaving, ...current],
      );
    }

    setSearchTerm("");
    setActiveFilter("all");
    setForm({ ...INITIAL_FORM, walletId: wallets[0]?.id ?? "" });
    setFormError("");
    setEditingSavingId(null);
    setIsAddOpen(false);
    setIsPersisting(false);
    showToast({
      type: "success",
      message: editingSavingId
        ? "Đã cập nhật khoản tiết kiệm vào Supabase."
        : "Đã thêm khoản tiết kiệm vào Supabase.",
    });
  };

  useEffect(() => {
    if (!transactionSavingId || !transactionForm.walletId) return;

    let isMounted = true;

    async function refreshSelectedWalletBalance() {
      // FINANCE-DATA-1: getWallets now rejects on a genuine query failure
      // instead of silently resolving to [] — caught here so the focused
      // money-movement flow keeps the last-known wallet balance instead of
      // throwing an unhandled rejection.
      try {
        const walletRows = await getWallets();
        if (!isMounted) return;

        setWallets(walletRows);
        setWalletsLoadError(null);
      } catch (error) {
        if (!isMounted) return;

        console.error(
          "[SavingsPage] refreshSelectedWalletBalance failed:",
          error,
        );
        setWalletsLoadError(
          "Không thể tải số dư ví. Vui lòng tải lại trang.",
        );
      }
    }

    void refreshSelectedWalletBalance();

    return () => {
      isMounted = false;
    };
  }, [transactionSavingId, transactionForm.walletId]);

  const updateTransactionForm = <Key extends keyof TransactionFormState>(
    key: Key,
    value: TransactionFormState[Key],
  ) => {
    setTransactionForm((current) => ({ ...current, [key]: value }));
    setTransactionError("");
  };

  const handleAddTransaction = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectedSaving) return;

    const rawAmount = parseCurrencyValue(transactionForm.amount);
    const note = transactionForm.note.trim();
    const amount =
      transactionForm.type === "settlement" && rawAmount <= 0
        ? selectedSaving.balance
        : rawAmount;

    if (amount <= 0) {
      setTransactionError("Vui lòng nhập số tiền giao dịch lớn hơn 0.");
      return;
    }

    const activeWallet =
      walletsRef.current.find(
        (wallet) => wallet.id === transactionForm.walletId,
      ) ?? selectedWallet;

    if (!activeWallet) {
      setTransactionError(
        transactionForm.type === "deposit"
          ? "Vui lòng chọn ví nguồn để chuyển tiền vào tiết kiệm."
          : "Vui lòng chọn ví nhận tiền khi rút/tất toán.",
      );
      return;
    }

    if (transactionForm.type === "deposit" && activeWallet.balance < amount) {
      setTransactionError("Ví nguồn không đủ số dư để chuyển vào tiết kiệm.");
      return;
    }

    if (
      transactionForm.type === "withdraw" &&
      amount > selectedSaving.balance
    ) {
      setTransactionError("Số tiền rút không được lớn hơn số dư hiện tại.");
      return;
    }

    const transferTitle =
      transactionForm.type === "deposit"
        ? `Nạp vào tiết kiệm: ${selectedSaving.name}`
        : transactionForm.type === "withdraw"
          ? `Rút từ tiết kiệm: ${selectedSaving.name}`
          : `Tất toán tiết kiệm: ${selectedSaving.name}`;

    setIsPersisting(true);

    if (supabase) {
      // Finance Engine v3: wallet mutation, the main transactions ledger
      // row, savings.balance mutation, and the saving_transactions ledger
      // row all commit or roll back together — see
      // supabase/finance-engine-3-savings-atomic.sql. No client-side wallet
      // arithmetic or manual multi-step undo is needed anymore. Settlement
      // always moves the account's authoritative server-side balance, not
      // the client-supplied `amount`.
      const { data: movement, error } = await createSavingMovement({
        savingId: selectedSaving.id,
        walletId: activeWallet.id,
        type: transactionForm.type,
        amount,
        note: note || transferTitle,
        transactionDate: todayInputValue(),
        savingTransactionId: crypto.randomUUID(),
        financeTransactionId: crypto.randomUUID(),
      });

      if (error || !movement) {
        setIsPersisting(false);
        setTransactionError(error || "Không thể lưu giao dịch tiết kiệm.");
        return;
      }

      setWallets((current) => {
        const nextWallets = current.map((wallet) =>
          wallet.id === movement.wallet.id ? movement.wallet : wallet,
        );
        walletsRef.current = nextWallets;
        return nextWallets;
      });

      const savedSaving = mapSavingRowToSaving(movement.saving as SavingRow);
      const savedTransaction = mapTransactionRowToTransaction(
        movement.savingTransaction as SavingTransactionRow,
      );

      setLocalSavings((current) =>
        current.map((item) =>
          item.id === selectedSaving.id ? savedSaving : item,
        ),
      );

      setTransactionsBySavingId((current) => ({
        ...current,
        [selectedSaving.id]: [
          savedTransaction,
          ...(current[selectedSaving.id] ?? []),
        ],
      }));

      setForm((current) => ({
        ...current,
        balance: formatCurrencyInputFromNumber(savedSaving.balance),
      }));

      setTransactionForm({
        ...INITIAL_TRANSACTION_FORM,
        walletId: selectedSaving.walletId ?? activeWallet.id,
      });
      setTransactionError("");
      setIsPersisting(false);
      setTransactionSavingId(null);
      showToast({
        type: "success",
        message:
          transactionForm.type === "settlement"
            ? "Đã tất toán khoản tiết kiệm trên Supabase."
            : "Đã lưu giao dịch tiết kiệm vào Supabase.",
      });
      return;
    }

    // No Supabase configured (local/demo mode) — fall back to local-only
    // state, same as the account-creation flow's non-Supabase branch. There
    // is no RPC to call without a real backend.
    const signedAmount = transactionForm.type === "withdraw" ? -amount : amount;
    const nextBalance =
      transactionForm.type === "settlement"
        ? 0
        : Math.max(0, selectedSaving.balance + signedAmount);
    const nextMaturityDate =
      transactionForm.type === "settlement"
        ? todayInputValue()
        : selectedSaving.maturityDate;
    const localTransaction: SavingTransaction = {
      id: `transaction-${Date.now()}`,
      savingId: selectedSaving.id,
      type: transactionForm.type,
      amount,
      date: todayInputValue(),
      note:
        note ||
        (transactionForm.type === "settlement"
          ? "Tất toán khoản tiết kiệm"
          : getTransactionLabel(transactionForm.type)),
    };
    const nextWalletBalance =
      transactionForm.type === "deposit"
        ? activeWallet.balance - amount
        : activeWallet.balance + amount;
    const nextWallet: WalletType = {
      ...activeWallet,
      balance: nextWalletBalance,
    };

    const walletResult = await persistWalletBalance(nextWallet);
    if (walletResult.error) {
      setIsPersisting(false);
      setTransactionError(walletResult.error);
      return;
    }

    setWallets((current) => {
      const nextWallets = current.map((wallet) =>
        wallet.id === nextWallet.id ? nextWallet : wallet,
      );
      walletsRef.current = nextWallets;
      return nextWallets;
    });

    setLocalSavings((current) =>
      current.map((item) =>
        item.id === selectedSaving.id
          ? {
              ...item,
              balance: nextBalance,
              maturityDate: nextMaturityDate,
            }
          : item,
      ),
    );

    setTransactionsBySavingId((current) => ({
      ...current,
      [selectedSaving.id]: [
        localTransaction,
        ...(current[selectedSaving.id] ?? []),
      ],
    }));

    setForm((current) => ({
      ...current,
      balance: formatCurrencyInputFromNumber(nextBalance),
    }));

    setTransactionForm({
      ...INITIAL_TRANSACTION_FORM,
      walletId: selectedSaving.walletId ?? activeWallet.id,
    });
    setTransactionError("");
    setIsPersisting(false);
    setTransactionSavingId(null);
    showToast({
      type: "success",
      message:
        transactionForm.type === "settlement"
          ? "Đã tất toán khoản tiết kiệm trên Supabase."
          : "Đã lưu giao dịch tiết kiệm vào Supabase.",
    });
  };

  const handleDeleteSaving = async () => {
    if (!deleteTarget || isPersisting) return;

    const savingToDelete = deleteTarget;

    // Deleting a saving does not credit any wallet back — its balance would
    // otherwise vanish from the system. This is a fast, UX-only guard for
    // immediate feedback (no round trip); deleteSavingAccount()'s RPC
    // re-validates the same balance-is-zero rule server-side (MFS06) and is
    // the actual authoritative check — see finance-engine-3-savings-atomic.sql.
    if (savingToDelete.balance > 0) {
      setDeleteTarget(null);
      showToast({
        type: "error",
        message:
          "Vui lòng rút hết hoặc tất toán khoản tiết kiệm trước khi xóa để tránh mất số dư.",
      });
      return;
    }

    const relatedTransactions = transactionsBySavingId[savingToDelete.id] ?? [];

    setIsPersisting(true);

    try {
      if (supabase) {
        // Finance Engine v3: the ledger delete and the account delete
        // happen inside one atomic RPC call, which also re-validates the
        // balance is exactly zero server-side (MFS06) — the authoritative
        // check, independent of the client-side guard above. See
        // supabase/finance-engine-3-savings-atomic.sql.
        const { error: deleteError } = await deleteSavingAccount(
          savingToDelete.id,
        );

        if (deleteError) {
          throw new Error(deleteError);
        }
      }

      setLocalSavings((current) =>
        current.filter((item) => item.id !== savingToDelete.id),
      );

      setTransactionsBySavingId((current) => {
        const next = { ...current };
        delete next[savingToDelete.id];
        return next;
      });

      if (editingSavingId === savingToDelete.id) {
        setEditingSavingId(null);
        setIsAddOpen(false);
      }

      setDeleteTarget(null);
      showToast({
        type: "success",
        message:
          relatedTransactions.length > 0
            ? "Đã xóa khoản tiết kiệm và toàn bộ lịch sử liên quan."
            : "Đã xóa khoản tiết kiệm.",
      });
    } catch (error) {
      showToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Không thể xóa khoản tiết kiệm.",
      });
    } finally {
      setIsPersisting(false);
    }
  };

  return (
    <section className="space-y-5 overflow-x-hidden">
      {!isSupabaseConfigured ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-700">
          Chưa cấu hình Supabase env. Thêm NEXT_PUBLIC_SUPABASE_URL và
          NEXT_PUBLIC_SUPABASE_ANON_KEY để lưu thật.
        </div>
      ) : null}

      {isHydrating ? (
        <div className="rounded-3xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-bold text-blue-700">
          Đang tải dữ liệu tiết kiệm từ Supabase...
        </div>
      ) : null}

      {/* SAVINGS V2 HERO — aligned with Goals page format */}
      <section className="overflow-hidden rounded-4xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-linear-to-br from-blue-50 via-white to-cyan-50 px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">
                Savings Center
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Tiết kiệm
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Theo dõi tổng số dư, quỹ khẩn cấp, lãi dự kiến và hoạt động
                nạp/rút trong một nơi.
              </p>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-200/70 transition hover:bg-blue-700"
            >
              <Plus size={17} />
              Thêm khoản tiết kiệm
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeroMetric
              label="Tổng tiết kiệm"
              value={formatCurrency(metrics.totalSavings)}
              note={`${localSavings.length} khoản đang theo dõi`}
              icon={<PiggyBank size={18} />}
              tone="blue"
            />
            <HeroMetric
              label="Quỹ khẩn cấp"
              value={formatCurrency(metrics.emergencyFund)}
              note={`${savingsExperience.emergencyMonths.toFixed(1)} / ${EMERGENCY_MONTH_TARGET} tháng`}
              icon={<ShieldCheck size={18} />}
              tone="emerald"
            />
            <HeroMetric
              label="Lãi dự kiến"
              value={`+${formatCurrency(metrics.expectedInterest)}`}
              note={`Lãi suất TB ${formatPercent(savingsExperience.averageRate)}`}
              icon={<TrendingUp size={18} />}
              tone="amber"
            />
            <HeroMetric
              label="Dòng tiền tiết kiệm"
              value={formatCurrency(savingsAnalytics.netMovement)}
              note={`Nạp ${formatCurrency(savingsAnalytics.totalDeposits)}`}
              icon={<ArrowUpRight size={18} />}
              tone="violet"
            />
          </div>
        </div>
      </section>

      {/* SAVINGS PROGRESS — same visual structure as Goals page */}
      <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                Tiến độ quỹ khẩn cấp
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">
                {formatCurrency(metrics.emergencyFund)} /{" "}
                {formatCurrency(savingsExperience.emergencyTarget)}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Còn {formatCurrency(savingsExperience.emergencyGap)} để đạt mục
                tiêu {EMERGENCY_MONTH_TARGET} tháng chi phí.
              </p>
            </div>

            <span className="text-4xl font-black tracking-tight text-blue-600">
              {savingsExperience.emergencyProgress}%
            </span>
          </div>

          <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-linear-to-r from-blue-600 to-cyan-500 transition-all"
              style={{ width: `${savingsExperience.emergencyProgress}%` }}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SavingsInfoTile
              label="Hiện có"
              value={formatCurrency(metrics.emergencyFund)}
              tone="blue"
            />
            <SavingsInfoTile
              label="Còn thiếu"
              value={formatCurrency(savingsExperience.emergencyGap)}
              tone="rose"
            />
            <SavingsInfoTile
              label="Góp đề xuất / tháng"
              value={formatCurrency(savingsExperience.emergencyMonthlyTopUp)}
              tone="emerald"
            />
          </div>
        </div>

        <div className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Ưu tiên hiện tại
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            Kế hoạch tăng trưởng
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Dự phóng theo lãi suất trung bình hiện tại và chưa tính các khoản
            nạp thêm.
          </p>

          <div className="mt-4 space-y-3">
            {savingsAnalytics.projection.map((item) => (
              <div
                key={item.years}
                className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Sau {item.years} năm
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Giá trị ước tính
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-blue-700">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SAVINGS ANALYTICS */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Phân bổ tiết kiệm
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Cơ cấu theo loại khoản
              </h2>
            </div>
            <span className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Landmark size={18} />
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {savingsAnalytics.allocation.length > 0 ? (
              savingsAnalytics.allocation.map((item, index) => {
                const percent =
                  metrics.totalSavings > 0
                    ? Math.round((item.value / metrics.totalSavings) * 100)
                    : 0;
                const barClass = [
                  "bg-blue-600",
                  "bg-emerald-500",
                  "bg-indigo-500",
                  "bg-amber-500",
                ][index % 4];

                return (
                  <div key={item.type}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-bold text-slate-700">
                        {item.label}
                      </span>
                      <span className="shrink-0 font-black text-slate-950">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${barClass}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs font-bold text-slate-400">
                      {percent}% tổng tiết kiệm
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                Chưa có dữ liệu phân bổ.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                Hoạt động tiết kiệm
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Nạp, rút và số dư bình quân
              </h2>
            </div>
            <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={18} />
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SavingsInfoTile
              label="Tổng nạp"
              value={formatCurrency(savingsAnalytics.totalDeposits)}
              tone="emerald"
            />
            <SavingsInfoTile
              label="Tổng rút"
              value={formatCurrency(savingsAnalytics.totalWithdrawals)}
              tone="rose"
            />
            <SavingsInfoTile
              label="Số dư bình quân"
              value={formatCurrency(savingsAnalytics.averageBalance)}
              tone="blue"
            />
          </div>

          <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Khuyến nghị
            </p>
            <p className="mt-2 text-sm font-black text-slate-900">
              {savingsExperience.emergencyProgress >= 100
                ? "Quỹ khẩn cấp đã đạt mục tiêu."
                : `Cần bổ sung khoảng ${formatCurrency(
                    savingsExperience.emergencyMonthlyTopUp,
                  )}/tháng để hoàn thành quỹ khẩn cấp trong 6 tháng.`}
            </p>
          </div>
        </div>
      </section>

      {/* SEARCH + FILTERS */}
      <section className="rounded-4xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1 lg:max-w-sm">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm khoản tiết kiệm..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <div className="no-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl bg-slate-50 p-1.5 lg:ml-auto">
            {filters.map((filter) => {
              const isActive = activeFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  {filter.label}
                  {typeof filter.count === "number" ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-white text-slate-500"
                      }`}
                    >
                      {filter.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* SAVING ACCOUNTS */}
      <section className="rounded-4xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Danh sách khoản tiết kiệm
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              {filteredSavings.length} khoản đang hiển thị
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Nạp, rút, tất toán hoặc xem lịch sử trực tiếp trên từng khoản.
          </p>
        </div>

        {filteredSavings.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-blue-200 bg-blue-50/30 px-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-blue-100 text-blue-600">
              <PiggyBank size={30} />
            </span>
            <h2 className="mt-4 text-xl font-black text-slate-950">
              Chưa có khoản tiết kiệm
            </h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
              Tạo khoản tiết kiệm đầu tiên để theo dõi số dư, lãi suất và ngày
              đáo hạn.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-100"
            >
              <Plus size={17} />
              Thêm khoản tiết kiệm
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredSavings.map((item) => {
              const status = getSavingStatus(item);
              const expectedInterest = estimateAnnualInterest(item);
              const progress = getSavingProgress(item);
              const recentCount = transactionsBySavingId[item.id]?.length ?? 0;

              return (
                <article
                  key={item.id}
                  className="group rounded-3xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        {item.type === "emergency_fund" ? (
                          <ShieldCheck size={20} />
                        ) : (
                          <Landmark size={20} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <h3 className="wrap-anywhere text-base font-black text-slate-950">
                          {item.name}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {getSavingTypeLabel(item.type)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                        aria-label={`Chỉnh sửa ${item.name}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Xóa ${item.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                      Số dư hiện tại
                    </p>
                    <p className="mt-1 wrap-break-word text-2xl font-black text-blue-700">
                      {formatCurrency(item.balance)}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase text-slate-400">
                        Lãi suất
                      </p>
                      <p className="mt-1 text-sm font-black text-emerald-600">
                        {isInterestBearingSaving(item.type)
                          ? formatPercent(item.interestRate ?? 0)
                          : "Linh hoạt"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase text-slate-400">
                        Đáo hạn
                      </p>
                      <p className="mt-1 text-sm font-black text-slate-700">
                        {item.maturityDate
                          ? formatDate(item.maturityDate)
                          : "Không kỳ hạn"}
                      </p>
                    </div>
                  </div>

                  {isInterestBearingSaving(item.type) ? (
                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs font-black">
                        <span className="text-slate-400">
                          {getProgressLabel(item)}
                        </span>
                        <span className="text-slate-700">{progress}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-blue-500 to-emerald-400"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-bold text-emerald-600">
                        Lãi dự kiến: +{formatCurrency(expectedInterest)}
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span
                      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${status.className}`}
                    >
                      <CheckCircle2 size={12} />
                      {status.label}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      {recentCount} giao dịch
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => openMoneyMovementModal(item, "deposit")}
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-emerald-50 px-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                    >
                      <ArrowUpRight size={14} />
                      Nạp
                    </button>
                    <button
                      type="button"
                      onClick={() => openMoneyMovementModal(item, "withdraw")}
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-rose-50 px-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                    >
                      <ArrowDownLeft size={14} />
                      Rút
                    </button>
                    <button
                      type="button"
                      onClick={() => openHistoryModal(item)}
                      className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-blue-50 px-2 text-xs font-black text-blue-700 transition hover:bg-blue-100"
                    >
                      <Clock3 size={14} />
                      Lịch sử
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* RECENT SAVINGS TIMELINE */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Savings Timeline
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              Hoạt động gần đây
            </h2>
          </div>
          <span className="flex size-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Clock3 size={18} />
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100">
          {savingsAnalytics.recentTransactions.length > 0 ? (
            savingsAnalytics.recentTransactions.map((transaction) => {
              const signedAmount = getSignedTransactionAmount(transaction);
              const isPositive = signedAmount > 0;

              return (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-4 bg-white px-4 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                        isPositive
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {getTransactionIcon(transaction.type)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        {transaction.savingName}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-bold text-slate-400">
                        {transaction.note} · {formatDate(transaction.date)}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-black ${
                      isPositive ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {isPositive ? "+" : "-"}
                    {formatCurrency(Math.abs(signedAmount))}
                  </p>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              Chưa có giao dịch tiết kiệm.
            </p>
          )}
        </div>
      </section>

      {/* SAVINGS-UX-1: create/edit metadata is intentionally separate from money movement and history. */}
      {isAddOpen ? (
        <div className="fixed inset-0 z-50 bg-white sm:flex sm:items-center sm:justify-center sm:bg-slate-950/45 sm:p-4 sm:backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Đóng form khoản tiết kiệm"
            className="absolute inset-0 hidden cursor-default sm:block"
            onClick={closeAddModal}
          />

          <form
            onSubmit={handleSubmitSaving}
            className="relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-xl sm:rounded-4xl sm:shadow-2xl sm:shadow-slate-950/15"
          >
            {/* SAVINGS-UX-1.2: mobile edit/create is a true full-screen surface; desktop keeps the modal treatment. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <div className="min-w-0">
                <p className="hidden text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 sm:block">
                  {isEditing ? "EDIT SAVING" : "NEW SAVING"}
                </p>
                <h2 className="truncate text-lg font-black tracking-tight text-slate-950 sm:mt-1 sm:text-2xl">
                  {isEditing
                    ? "Chỉnh sửa khoản tiết kiệm"
                    : "Tạo khoản tiết kiệm mới"}
                </h2>
                <p className="mt-0.5 hidden text-sm font-medium text-slate-500 sm:block">
                  {isEditing
                    ? "Chỉ cập nhật thông tin. Nạp, rút và tất toán được thực hiện ở thao tác riêng."
                    : "Chọn ví nguồn và nhập các thông tin cần thiết."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeAddModal}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                aria-label="Đóng"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-5">
              <div className="grid gap-3 sm:gap-4">
                {isEditing && selectedSaving ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 sm:rounded-3xl sm:p-4">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-blue-500 sm:text-[10px]">
                        Số dư hiện tại
                      </p>
                      <p className="mt-0.5 wrap-break-word text-lg font-black leading-tight text-blue-700 sm:mt-1 sm:text-2xl">
                        {formatCurrency(selectedSaving.balance)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black sm:px-2.5 sm:py-1 sm:text-xs ${getSavingStatus(selectedSaving).className}`}
                      >
                        <CheckCircle2 size={11} />
                        {getSavingStatus(selectedSaving).label}
                      </span>
                      <span className="max-w-36 truncate text-[10px] font-semibold text-slate-500 sm:max-w-none sm:text-xs">
                        {getSavingTypeLabel(selectedSaving.type)}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 sm:rounded-3xl sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.2em]">
                        Thông tin
                      </p>
                      <h3 className="mt-0.5 text-sm font-black text-slate-950 sm:mt-1 sm:text-base">
                        {isEditing ? "Thông tin khoản" : "Thông tin khoản mới"}
                      </h3>
                    </div>
                    {isEditing ? (
                      <span className="text-[10px] font-semibold text-slate-400 sm:hidden">
                        Chỉ chỉnh thông tin
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2.5 sm:mt-4 sm:gap-3">
                    <label className="col-span-2">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                        Tên khoản
                      </span>
                      <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:gap-3 sm:rounded-2xl sm:px-4">
                        <PiggyBank size={16} className="shrink-0 text-blue-500 sm:size-[18px]" />
                        <input
                          value={form.name}
                          onChange={(event) => updateForm("name", event.target.value)}
                          placeholder={formConfig.namePlaceholder}
                          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-700 outline-none placeholder:text-slate-400 sm:text-sm"
                        />
                      </div>
                    </label>

                    <label className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                        Loại tiết kiệm
                      </span>
                      <select
                        value={form.type}
                        onChange={(event) =>
                          updateForm("type", event.target.value as SavingType)
                        }
                        className="mt-1 min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:rounded-2xl sm:px-4 sm:text-sm"
                      >
                        <option value="savings_account">Tài khoản tiết kiệm</option>
                        <option value="term_deposit">Tiền gửi có kỳ hạn</option>
                        <option value="certificate">Chứng chỉ tiền gửi</option>
                        <option value="emergency_fund">Quỹ khẩn cấp</option>
                      </select>
                    </label>

                    <label className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                        {isEditing ? "Ví liên kết" : "Ví nguồn"}
                      </span>
                      <select
                        value={form.walletId}
                        onChange={(event) => updateForm("walletId", event.target.value)}
                        className="mt-1 min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:rounded-2xl sm:px-4 sm:text-sm"
                      >
                        <option value="">
                          {isEditing ? "Chọn ví liên kết" : "Chọn ví nguồn"}
                        </option>
                        {wallets.map((wallet) => (
                          <option key={wallet.id} value={wallet.id}>
                            {wallet.name} · {formatCurrency(wallet.balance)}
                          </option>
                        ))}
                      </select>
                    </label>

                    {!isEditing ? (
                      <label className="col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                          {formConfig.amountLabel}
                        </span>
                        <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:gap-3 sm:rounded-2xl sm:px-4">
                          <Banknote size={16} className="shrink-0 text-blue-500 sm:size-[18px]" />
                          <input
                            value={form.balance}
                            inputMode="numeric"
                            onChange={(event) =>
                              updateForm(
                                "balance",
                                parseCurrencyInput(event.target.value),
                              )
                            }
                            placeholder={formConfig.amountPlaceholder}
                            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-700 outline-none placeholder:text-slate-400 sm:text-sm"
                          />
                        </div>
                      </label>
                    ) : null}

                    {formConfig.showInterestRate ? (
                      <label
                        className={
                          isEditing && !formConfig.showMaturityDate
                            ? "col-span-2"
                            : "min-w-0"
                        }
                      >
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                          {formConfig.interestLabel || "Lãi suất / năm"}
                        </span>
                        <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:gap-3 sm:rounded-2xl sm:px-4">
                          <Percent size={16} className="shrink-0 text-blue-500 sm:size-[18px]" />
                          <input
                            value={form.interestRate}
                            inputMode="decimal"
                            onChange={(event) =>
                              updateForm("interestRate", event.target.value)
                            }
                            placeholder={formConfig.interestPlaceholder}
                            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-700 outline-none placeholder:text-slate-400 sm:text-sm"
                          />
                        </div>
                      </label>
                    ) : null}

                    {formConfig.showMaturityDate ? (
                      <label className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                          {formConfig.maturityLabel}
                        </span>
                        <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:gap-3 sm:rounded-2xl sm:px-4">
                          <Clock3 size={16} className="hidden shrink-0 text-blue-500 sm:block sm:size-[18px]" />
                          <input
                            type="date"
                            value={form.maturityDate}
                            onChange={(event) =>
                              updateForm("maturityDate", event.target.value)
                            }
                            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-700 outline-none sm:text-sm"
                          />
                        </div>
                      </label>
                    ) : null}

                    <label className="col-span-2">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 sm:text-xs">
                        Ghi chú
                      </span>
                      <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-11 sm:gap-3 sm:rounded-2xl sm:px-4">
                        <MessageSquareText size={16} className="shrink-0 text-blue-500 sm:size-[18px]" />
                        <input
                          value={form.notes}
                          onChange={(event) => updateForm("notes", event.target.value)}
                          placeholder={formConfig.notesPlaceholder}
                          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-700 outline-none placeholder:text-slate-400 sm:text-sm"
                        />
                      </div>
                    </label>
                  </div>
                </div>

                {!isEditing ? (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3 sm:rounded-3xl sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-500 sm:text-xs sm:tracking-[0.2em]">
                          Tóm tắt
                        </p>
                        <h3 className="mt-0.5 text-sm font-black text-slate-950 sm:mt-1 sm:text-base">
                          Kiểm tra trước khi tạo
                        </h3>
                      </div>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 sm:size-10 sm:rounded-2xl">
                        <TrendingUp size={17} />
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 sm:mt-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-white p-2.5 sm:rounded-2xl sm:p-3">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 sm:text-[10px]">
                          Số tiền gửi
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-950 sm:mt-1 sm:text-sm">
                          {formatCurrency(previewPrincipal)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 sm:rounded-2xl sm:p-3">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 sm:text-[10px]">
                          {formConfig.interestTitle}
                        </p>
                        <p className="mt-0.5 text-xs font-black text-emerald-600 sm:mt-1 sm:text-sm">
                          +{formatCurrency(previewInterest)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 sm:rounded-2xl sm:p-3">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 sm:text-[10px]">
                          Số dư ví
                        </p>
                        <p className="mt-0.5 text-xs font-black text-slate-950 sm:mt-1 sm:text-sm">
                          {hasUnknownWalletBalance
                            ? "Không thể tải số dư"
                            : formatCurrency(selectedWalletBalance)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 sm:rounded-2xl sm:p-3">
                        <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 sm:text-[10px]">
                          Ví sau chuyển
                        </p>
                        <p className="mt-0.5 text-xs font-black text-blue-700 sm:mt-1 sm:text-sm">
                          {formatCurrency(walletBalanceAfterInitialDeposit)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isInitialDepositTooHigh ? (
                  <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                    Không đủ số dư ví. Ví hiện có{" "}
                    {formatCurrency(selectedWalletBalance)}, nhưng số tiền gửi là{" "}
                    {formatCurrency(previewPrincipal)}.
                  </div>
                ) : null}

                {formError ? (
                  <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                    {formError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-3.5">
              <button
                type="button"
                onClick={closeAddModal}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 sm:min-h-11 sm:rounded-2xl sm:px-4"
              >
                Hủy
              </button>

              <button
                type="submit"
                disabled={isPersisting || isInitialDepositTooHigh}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-11 sm:gap-2 sm:rounded-2xl sm:px-4"
              >
                {isEditing ? <Pencil size={16} /> : <Plus size={16} />}
                {isPersisting
                  ? "Đang lưu..."
                  : isEditing
                    ? "Lưu thay đổi"
                    : "Lưu khoản tiết kiệm"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* SAVINGS-UX-1: focused money-movement sheet. */}
      {transactionSavingId && selectedSaving ? (
        <div className="fixed inset-0 z-110 bg-white sm:flex sm:items-center sm:justify-center sm:bg-slate-950/45 sm:p-4 sm:backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Đóng giao dịch tiết kiệm"
            className="absolute inset-0 hidden cursor-default sm:block"
            onClick={closeMoneyMovementModal}
          />

          <div className="relative z-10 flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl sm:shadow-2xl">
            {/* SAVINGS-UX-1.2: mobile money movement is a true full-screen surface; desktop keeps the modal treatment. */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
              <div className="min-w-0">
                <p className="hidden text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600 sm:block">
                  MONEY MOVEMENT
                </p>
                <h2 className="truncate text-lg font-black tracking-tight text-slate-950 sm:mt-1 sm:text-xl">
                  {transactionForm.type === "deposit"
                    ? "Nạp vào tiết kiệm"
                    : transactionForm.type === "withdraw"
                      ? "Rút từ tiết kiệm"
                      : "Tất toán tiết kiệm"}
                </h2>
                <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-500 sm:mt-1 sm:text-sm">
                  <span className="truncate">{selectedSaving.name}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0 font-black text-blue-700">
                    {formatCurrency(selectedSaving.balance)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeMoneyMovementModal}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                aria-label="Đóng"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-[#F8FBFF] px-3 py-3 [-webkit-overflow-scrolling:touch] sm:bg-white sm:px-6 sm:py-4">
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-[#E3EBF3] bg-[#F3F7FB] p-1 sm:rounded-2xl">
                {(["deposit", "withdraw", "settlement"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setTransactionForm((current) => ({
                        ...current,
                        type,
                        amount:
                          type === "settlement"
                            ? formatCurrencyInputFromNumber(selectedSaving.balance)
                            : current.type === "settlement"
                              ? ""
                              : current.amount,
                      }))
                    }
                    className={`inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-bold whitespace-nowrap transition sm:h-10 sm:gap-1.5 sm:rounded-xl sm:px-2 sm:text-xs ${
                      transactionForm.type === type
                        ? type === "deposit"
                          ? "bg-white text-emerald-700 ring-1 ring-inset ring-emerald-200"
                          : type === "withdraw"
                            ? "bg-white text-[#2F80ED] ring-1 ring-inset ring-blue-200"
                            : "bg-white text-rose-600 ring-1 ring-inset ring-rose-200"
                        : "text-[#7890A6] hover:bg-white hover:text-[#4A6783]"
                    }`}
                  >
                    {getTransactionIcon(type)}
                    {getTransactionLabel(type)}
                  </button>
                ))}
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-x-2.5 gap-y-2.5 sm:mt-4 sm:gap-3">
                <label className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] sm:text-xs">
                    Số tiền
                  </span>
                  <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-12 sm:gap-3 sm:rounded-2xl sm:px-4">
                    <Banknote size={16} className="shrink-0 text-blue-500 sm:size-[18px]" />
                    <input
                      value={transactionForm.amount}
                      inputMode="numeric"
                      readOnly={transactionForm.type === "settlement"}
                      onChange={(event) =>
                        updateTransactionForm(
                          "amount",
                          parseCurrencyInput(event.target.value),
                        )
                      }
                      placeholder="10.000.000"
                      className={`h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-slate-400 ${
                        transactionForm.type === "settlement"
                          ? "cursor-not-allowed text-slate-500"
                          : "text-[#4A6783]"
                      }`}
                    />
                  </div>
                  {transactionForm.type === "settlement" ? (
                    <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-400 sm:mt-1.5 sm:text-xs">
                      Dùng toàn bộ số dư hiện tại.
                    </p>
                  ) : null}
                </label>

                <label className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] sm:text-xs">
                    {transactionForm.type === "deposit" ? "Ví nguồn" : "Ví nhận"}
                  </span>
                  <select
                    value={transactionForm.walletId}
                    onChange={(event) =>
                      updateTransactionForm("walletId", event.target.value)
                    }
                    className="mt-1 min-h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2.5 text-base font-semibold text-[#4A6783] outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 sm:mt-1.5 sm:min-h-12 sm:rounded-2xl sm:px-4 sm:text-sm"
                  >
                    <option value="">Chọn ví</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name} · {formatCurrency(wallet.balance)}
                      </option>
                    ))}
                  </select>
                  {selectedWallet ? (
                    <p className="mt-1 truncate text-[10px] font-semibold leading-4 text-slate-400 sm:mt-1.5 sm:text-xs">
                      Số dư: {formatCurrency(selectedWallet.balance)}
                    </p>
                  ) : null}
                </label>

                <label className="col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] sm:text-xs">
                    Ghi chú
                  </span>
                  <div className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 sm:mt-1.5 sm:min-h-12 sm:gap-3 sm:rounded-2xl sm:px-4">
                    <MessageSquareText size={16} className="shrink-0 text-blue-500 sm:size-[18px]" />
                    <input
                      value={transactionForm.note}
                      onChange={(event) =>
                        updateTransactionForm("note", event.target.value)
                      }
                      placeholder="Tùy chọn"
                      className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-[#4A6783] outline-none placeholder:text-slate-400 sm:text-sm"
                    />
                  </div>
                </label>
              </div>

              <div className="mt-3 rounded-2xl border border-[#E3EBF3] bg-white p-3 shadow-sm sm:mt-4 sm:rounded-3xl sm:p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8196AA] sm:text-[10px] sm:tracking-[0.16em]">
                  {transactionForm.type === "deposit"
                    ? "Sau khi nạp"
                    : transactionForm.type === "withdraw"
                      ? "Sau khi rút"
                      : "Sau khi tất toán"}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
                  <div className="rounded-xl bg-[#F8FBFF] px-3 py-2.5 sm:rounded-2xl sm:p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-[#8196AA] sm:text-[10px]">
                      Tiết kiệm
                    </p>
                    <p className="mt-0.5 wrap-break-word text-sm font-black text-[#2F80ED] sm:mt-1 sm:text-base">
                      {transactionSavingBalanceAfter !== null
                        ? formatCurrency(transactionSavingBalanceAfter)
                        : "-"}
                    </p>
                    <p
                      className={`mt-0.5 text-[10px] font-bold sm:text-xs ${
                        transactionForm.type === "deposit"
                          ? "text-emerald-600"
                          : "text-[#64748B]"
                      }`}
                    >
                      {transactionForm.type === "deposit" ? "+" : "−"}
                      {formatCurrency(transactionPreviewAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F8FBFF] px-3 py-2.5 sm:rounded-2xl sm:p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-[#8196AA] sm:text-[10px]">
                      {transactionForm.type === "deposit" ? "Ví nguồn" : "Ví nhận"}
                    </p>
                    <p className="mt-0.5 wrap-break-word text-sm font-black text-[#4A6783] sm:mt-1 sm:text-base">
                      {transactionWalletBalanceAfter !== null
                        ? formatCurrency(transactionWalletBalanceAfter)
                        : "Chọn ví"}
                    </p>
                    <p
                      className={`mt-0.5 text-[10px] font-bold sm:text-xs ${
                        transactionForm.type === "deposit"
                          ? "text-[#64748B]"
                          : "text-emerald-600"
                      }`}
                    >
                      {transactionForm.type === "deposit" ? "−" : "+"}
                      {formatCurrency(transactionPreviewAmount)}
                    </p>
                  </div>
                </div>
              </div>

              {transactionError ? (
                <div className="mt-2.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 sm:mt-4 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
                  {transactionError}
                </div>
              ) : null}
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:gap-3 sm:px-6 sm:pb-4 sm:pt-3">
              <button
                type="button"
                onClick={closeMoneyMovementModal}
                disabled={isPersisting}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:min-h-12 sm:rounded-2xl sm:px-4"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleAddTransaction()}
                disabled={isPersisting}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[13px] font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-12 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-sm ${
                  transactionForm.type === "deposit"
                    ? "bg-emerald-600 shadow-emerald-100 hover:bg-emerald-700"
                    : transactionForm.type === "withdraw"
                      ? "bg-[#2F80ED] shadow-blue-100 hover:bg-[#2676DE]"
                      : "bg-rose-600 shadow-rose-100 hover:bg-rose-700"
                }`}
              >
                <span className="hidden sm:inline-flex">
                  {getTransactionIcon(transactionForm.type)}
                </span>
                <span className="whitespace-nowrap">
                  {isPersisting
                    ? "Đang xử lý..."
                    : transactionForm.type === "deposit"
                      ? "Xác nhận nạp"
                      : transactionForm.type === "withdraw"
                        ? "Xác nhận rút"
                        : "Xác nhận tất toán"}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* SAVINGS-UX-1: history is a read-only sheet, not part of edit. */}
      {historySavingId && selectedSaving ? (
        <div className="fixed inset-0 z-110 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Đóng lịch sử tiết kiệm"
            className="absolute inset-0 cursor-default"
            onClick={closeHistoryModal}
          />

          <div className="relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[30px] bg-white shadow-2xl sm:rounded-4xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                  HISTORY
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                  Lịch sử tiết kiệm
                </h2>
                <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                  {selectedSaving.name}
                </p>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4 rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">
                    Số dư hiện tại
                  </p>
                  <p className="mt-1 text-2xl font-black text-blue-700">
                    {formatCurrency(selectedSaving.balance)}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">
                  {selectedTransactions.length} giao dịch
                </span>
              </div>

              <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100">
                {selectedTransactions.length > 0 ? (
                  selectedTransactions.map((transaction) => {
                    const signedAmount = getSignedTransactionAmount(transaction);
                    const isIncome = signedAmount > 0;

                    return (
                      <div
                        key={transaction.id}
                        className="grid gap-2 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span
                            className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl ${
                              isIncome
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-rose-50 text-rose-600"
                            }`}
                          >
                            {getTransactionIcon(transaction.type)}
                          </span>
                          <div className="min-w-0">
                            <p className="wrap-anywhere text-sm font-black text-slate-800">
                              {transaction.note}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              {formatDate(transaction.date)} ·{" "}
                              {getTransactionLabel(transaction.type)}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`text-sm font-black ${
                            isIncome ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {isIncome ? "+" : "-"}
                          {formatCurrency(Math.abs(signedAmount))}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-6 py-10 text-center">
                    <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                      <Clock3 size={20} />
                    </span>
                    <p className="mt-3 text-sm font-black text-slate-700">
                      Chưa có giao dịch
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      Các lần nạp, rút và tất toán sẽ xuất hiện tại đây.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
              <button
                type="button"
                onClick={closeHistoryModal}
                className="min-h-12 w-full rounded-2xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-120 flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Đóng xác nhận xóa"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!isPersisting) setDeleteTarget(null);
            }}
          />

          <div className="relative z-10 w-full overflow-hidden rounded-t-[30px] bg-white shadow-2xl sm:max-w-md sm:rounded-4xl">
            <div className="px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <Trash2 size={21} />
                </span>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isPersisting}
                  className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">
                Xác nhận xóa
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Xóa khoản tiết kiệm?
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                Bạn sắp xóa{" "}
                <span className="font-black text-slate-800">
                  {deleteTarget.name}
                </span>
                . Toàn bộ lịch sử nạp, rút và tất toán của khoản này cũng sẽ bị
                xóa khỏi trang Tiết kiệm.
              </p>

              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wide text-rose-400">
                  Số dư hiện tại
                </p>
                <p className="mt-1 text-xl font-black text-rose-700">
                  {formatCurrency(deleteTarget.balance)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isPersisting}
                className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteSaving()}
                disabled={isPersisting}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={17} />
                {isPersisting ? "Đang xóa..." : "Xóa khoản này"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HeroMetric({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const styles = {
    blue: {
      shell:
        "border-blue-200/70 bg-linear-to-br from-blue-50 to-white text-blue-700 shadow-blue-950/10",
      icon: "bg-blue-100 text-blue-600",
      label: "text-blue-500",
      note: "text-blue-500/80",
    },
    emerald: {
      shell:
        "border-emerald-200/70 bg-linear-to-br from-emerald-50 to-white text-emerald-700 shadow-emerald-950/10",
      icon: "bg-emerald-100 text-emerald-600",
      label: "text-emerald-500",
      note: "text-emerald-500/80",
    },
    amber: {
      shell:
        "border-amber-200/70 bg-linear-to-br from-amber-50 to-white text-amber-700 shadow-amber-950/10",
      icon: "bg-amber-100 text-amber-600",
      label: "text-amber-500",
      note: "text-amber-500/80",
    },
    violet: {
      shell:
        "border-violet-200/70 bg-linear-to-br from-violet-50 to-white text-violet-700 shadow-violet-950/10",
      icon: "bg-violet-100 text-violet-600",
      label: "text-violet-500",
      note: "text-violet-500/80",
    },
  };

  const style = styles[tone];

  return (
    <div
      className={
        "rounded-3xl border p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl " +
        style.shell
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={
            "text-[10px] font-black uppercase tracking-[0.16em] " + style.label
          }
        >
          {label}
        </p>
        <span
          className={
            "flex size-9 items-center justify-center rounded-xl " + style.icon
          }
        >
          {icon}
        </span>
      </div>

      <p className="mt-3 wrap-break-word text-xl font-black leading-tight">
        {value}
      </p>

      <p className={"mt-1 text-xs font-semibold leading-5 " + style.note}>
        {note}
      </p>
    </div>
  );
}

function SavingsInfoTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "emerald" | "rose";
}) {
  const styles = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-2xl border p-3 ${styles[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 wrap-break-word text-sm font-black">{value}</p>
    </div>
  );
}
