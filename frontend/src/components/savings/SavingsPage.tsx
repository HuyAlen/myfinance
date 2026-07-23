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
import { createClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Percent,
  MessageSquareText,
  Clock3,
  Landmark,
  MoreHorizontal,
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
  addTransaction,
  deleteTransaction,
  getWallets,
  updateWallet,
} from "@/src/services/finance/financeStorage";

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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

const getHealthScore = (savings: SavingAccount[]) => {
  if (savings.length === 0) return 0;

  const emergencyFund = savings
    .filter((item) => item.type === "emergency_fund")
    .reduce((sum, item) => sum + item.balance, 0);
  const totalSavings = savings.reduce((sum, item) => sum + item.balance, 0);
  const emergencyRatio = totalSavings > 0 ? emergencyFund / totalSavings : 0;
  const hasMaturityDates = savings.some((item) => item.maturityDate);
  const hasInterestRates = savings.some((item) => (item.interestRate ?? 0) > 0);

  return Math.min(
    100,
    Math.round(
      40 +
        emergencyRatio * 30 +
        (hasMaturityDates ? 15 : 0) +
        (hasInterestRates ? 15 : 0),
    ),
  );
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

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const getMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat("vi-VN", {
    month: "short",
  }).format(date);

export default function SavingsPage({
  savings = EMPTY_SAVINGS,
}: SavingsPageProps) {
  const [localSavings, setLocalSavings] = useState<SavingWithWallet[]>(savings);
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const walletsRef = useRef<WalletType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<SavingsFilter>("all");
  const [selectedSavingIds, setSelectedSavingIds] = useState<string[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingSavingId, setEditingSavingId] = useState<string | null>(null);
  const [, setDeleteTarget] = useState<SavingWithWallet | null>(null);
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
    const healthScore = getHealthScore(localSavings);

    return {
      totalSavings,
      totalPrincipal,
      expectedInterest,
      emergencyFund,
      maturingSoon,
      healthScore,
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

  const selectedSaving = useMemo(
    () =>
      editingSavingId
        ? (localSavings.find((item) => item.id === editingSavingId) ?? null)
        : null,
    [editingSavingId, localSavings],
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
  const previewMaturityValue = previewPrincipal + previewInterest;

  const filters: Array<{ key: SavingsFilter; label: string; count?: number }> =
    [
      { key: "all", label: "Tất cả", count: localSavings.length },
      { key: "active", label: "Đang gửi" },
      { key: "maturing", label: "Sắp đáo hạn", count: metrics.maturingSoon },
      { key: "emergency", label: "Quỹ khẩn cấp" },
      { key: "completed", label: "Đã tất toán" },
    ];

  const visibleSavingIds = useMemo(
    () => filteredSavings.map((item) => item.id),
    [filteredSavings],
  );
  const selectedVisibleCount = selectedSavingIds.filter((id) =>
    visibleSavingIds.includes(id),
  ).length;
  const isAllVisibleSelected =
    visibleSavingIds.length > 0 &&
    selectedVisibleCount === visibleSavingIds.length;

  const toggleSavingSelection = (savingId: string) => {
    setSelectedSavingIds((current) =>
      current.includes(savingId)
        ? current.filter((id) => id !== savingId)
        : [...current, savingId],
    );
  };

  const toggleAllVisibleSavings = () => {
    setSelectedSavingIds((current) => {
      if (isAllVisibleSelected) {
        return current.filter((id) => !visibleSavingIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleSavingIds]));
    });
  };

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

    const now = new Date();
    const maturityTimeline = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
      const monthKey = getMonthKey(date);
      const amount = localSavings
        .filter((saving) => {
          if (!saving.maturityDate) return false;
          const maturityDate = new Date(saving.maturityDate);
          return (
            !Number.isNaN(maturityDate.getTime()) &&
            getMonthKey(maturityDate) === monthKey
          );
        })
        .reduce(
          (sum, item) => sum + item.balance + estimateAnnualInterest(item),
          0,
        );

      return {
        key: monthKey,
        label: getMonthLabel(date),
        amount,
      };
    });

    const maxMaturityAmount = Math.max(
      1,
      ...maturityTimeline.map((item) => item.amount),
    );

    const interestForecast = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
      const monthlyInterest = localSavings.reduce((sum, saving) => {
        if (!isInterestBearingSaving(saving.type)) return sum;
        const rate = saving.interestRate ?? 0;
        return sum + Math.round((saving.balance * rate) / 100 / 12);
      }, 0);

      return {
        key: `${getMonthKey(date)}-interest`,
        label: getMonthLabel(date),
        amount: monthlyInterest,
      };
    });

    const maxInterestAmount = Math.max(
      1,
      ...interestForecast.map((item) => item.amount),
    );

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
      maturityTimeline,
      maxMaturityAmount,
      interestForecast,
      maxInterestAmount,
      nextMaturity,
    };
  }, [localSavings, metrics.emergencyFund]);

  const hasInterestForecast = savingsExperience.interestForecast.some(
    (item) => item.amount > 0,
  );
  const hasMaturityTimeline = savingsExperience.maturityTimeline.some(
    (item) => item.amount > 0,
  );

  const isEditing = editingSavingId !== null;
  const selectedWalletBalance = selectedInitialWallet?.balance ?? 0;
  const isInitialDepositTooHigh =
    !isEditing &&
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

      const nextSavings = (savingRows ?? []).map((row) =>
        mapSavingRowToSaving(row as SavingRow),
      );
      const nextTransactions = (transactionRows ?? []).map((row) =>
        mapTransactionRowToTransaction(row as SavingTransactionRow),
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
    setTransactionForm({
      ...INITIAL_TRANSACTION_FORM,
      walletId: saving.walletId ?? wallets[0]?.id ?? "",
      note: "",
    });
    setTransactionError("");
    setIsAddOpen(true);
  };

  const closeAddModal = () => {
    setIsAddOpen(false);
    setEditingSavingId(null);
    setFormError("");
    setTransactionError("");
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

        const nextWallet: WalletType = {
          ...initialWallet,
          balance: initialWallet.balance - balance,
        };

        const walletResult = await persistWalletBalance(nextWallet);
        if (walletResult.error) {
          setIsPersisting(false);
          setFormError(walletResult.error);
          return;
        }

        const { data, error } = await supabase
          .from("savings")
          .insert(payload)
          .select(
            "id,user_id,name,type,balance,wallet_id,interest_rate,maturity_date,notes,created_at,updated_at",
          )
          .single();

        if (error) {
          await persistWalletBalance(initialWallet);
          setWallets((current) =>
            current.map((wallet) =>
              wallet.id === initialWallet.id ? initialWallet : wallet,
            ),
          );
          setIsPersisting(false);
          showToast({
            type: "error",
            message: error.message || "Không thể thêm khoản tiết kiệm.",
          });
          return;
        }

        const savedSaving = mapSavingRowToSaving(data as SavingRow);

        setWallets((current) =>
          current.map((wallet) =>
            wallet.id === nextWallet.id ? nextWallet : wallet,
          ),
        );

        const { data: transactionData, error: transactionErrorResponse } =
          await supabase
            .from("saving_transactions")
            .insert({
              saving_id: savedSaving.id,
              type: "deposit",
              amount: balance,
              wallet_id: initialWallet.id,
              transaction_date: todayInputValue(),
              note: "Số dư ban đầu khi tạo khoản tiết kiệm",
            })
            .select(
              "id,saving_id,user_id,type,amount,wallet_id,transaction_date,note,created_at",
            )
            .single();

        if (transactionErrorResponse) {
          await persistWalletBalance(initialWallet);
          setWallets((current) =>
            current.map((wallet) =>
              wallet.id === initialWallet.id ? initialWallet : wallet,
            ),
          );
          setIsPersisting(false);
          showToast({
            type: "error",
            message:
              transactionErrorResponse.message ||
              "Không thể lưu giao dịch tạo khoản tiết kiệm.",
          });
          return;
        }

        setLocalSavings((current) => [savedSaving, ...current]);

        if (transactionData) {
          const savedTransaction = mapTransactionRowToTransaction(
            transactionData as SavingTransactionRow,
          );
          setTransactionsBySavingId((current) => ({
            ...current,
            [savedSaving.id]: [savedTransaction],
          }));
        }
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
    if (!isEditing || !transactionForm.walletId) return;

    let isMounted = true;

    async function refreshSelectedWalletBalance() {
      const walletRows = await getWallets();
      if (!isMounted) return;

      setWallets(walletRows);
    }

    void refreshSelectedWalletBalance();

    return () => {
      isMounted = false;
    };
  }, [isEditing, transactionForm.walletId]);

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

    // Savings transfer rule:
    // - Deposit: money leaves the source wallet and enters the saving.
    // - Withdraw/settlement: money enters the selected target wallet.
    // The saving transaction log below is history only; it must not be used to
    // recalculate wallet balances or applied again by the general transaction store.
    const nextWalletBalance =
      transactionForm.type === "deposit"
        ? activeWallet.balance - amount
        : activeWallet.balance + amount;

    const nextWallet: WalletType = {
      ...activeWallet,
      balance: nextWalletBalance,
    };

    const transferKind =
      transactionForm.type === "deposit"
        ? "saving_deposit"
        : transactionForm.type === "withdraw"
          ? "saving_withdraw"
          : "saving_close";
    const transferTitle =
      transactionForm.type === "deposit"
        ? `Nạp vào tiết kiệm: ${selectedSaving.name}`
        : transactionForm.type === "withdraw"
          ? `Rút từ tiết kiệm: ${selectedSaving.name}`
          : `Tất toán tiết kiệm: ${selectedSaving.name}`;
    const financeTransactionId = crypto.randomUUID();
    const transactionCreatedAt = new Date().toISOString();

    setIsPersisting(true);

    if (supabase) {
      const isSavingDeposit = transactionForm.type === "deposit";
      const financeTransactionPayload = {
        id: financeTransactionId,
        // Finance Engine v2 rule:
        // Savings deposit / withdraw / settlement are asset movements.
        // They must be stored as transfer transactions, not income or expense,
        // so Transactions, Reports, Dashboard and Analytics never count them
        // in Thu / Chi totals.
        type: "transfer",
        amount,
        categoryId: "",
        walletId: activeWallet.id,
        note: transferTitle,
        transferReference: `${transferKind}:${selectedSaving.id}:${transactionCreatedAt}`,
        transferReferenceType: "saving",
        sourceType: isSavingDeposit ? "wallet" : "saving",
        destinationType: isSavingDeposit ? "saving" : "wallet",
        // Keep snake_case keys as well because Supabase rows use snake_case
        // while the app view model mostly uses camelCase.
        transfer_reference_type: "saving",
        source_type: isSavingDeposit ? "wallet" : "saving",
        destination_type: isSavingDeposit ? "saving" : "wallet",
        date: todayInputValue(),
      } as Parameters<typeof addTransaction>[0] & Record<string, unknown>;

      const financeTransactionResult = await addTransaction(
        financeTransactionPayload,
      );

      if (financeTransactionResult.error) {
        setIsPersisting(false);
        setTransactionError(financeTransactionResult.error);
        return;
      }
    } else {
      const walletResult = await persistWalletBalance(nextWallet);
      if (walletResult.error) {
        setIsPersisting(false);
        setTransactionError(walletResult.error);
        return;
      }
    }

    setWallets((current) => {
      const nextWallets = current.map((wallet) =>
        wallet.id === nextWallet.id ? nextWallet : wallet,
      );
      walletsRef.current = nextWallets;
      return nextWallets;
    });

    let savedTransaction = localTransaction;

    if (supabase) {
      const { data: transactionData, error: transactionErrorResponse } =
        await supabase
          .from("saving_transactions")
          .insert({
            saving_id: selectedSaving.id,
            type: transactionForm.type,
            amount,
            wallet_id: activeWallet.id,
            transaction_date: todayInputValue(),
            note: localTransaction.note,
          })
          .select(
            "id,saving_id,user_id,type,amount,wallet_id,transaction_date,note,created_at",
          )
          .single();

      if (transactionErrorResponse) {
        await deleteTransaction(financeTransactionId);
        setWallets((current) => {
          const nextWallets = current.map((wallet) =>
            wallet.id === activeWallet.id ? activeWallet : wallet,
          );
          walletsRef.current = nextWallets;
          return nextWallets;
        });
        setIsPersisting(false);
        showToast({
          type: "error",
          message:
            transactionErrorResponse.message ||
            "Không thể lưu giao dịch tiết kiệm.",
        });
        return;
      }

      const { error: balanceError } = await supabase
        .from("savings")
        .update({
          balance: nextBalance,
          maturity_date: nextMaturityDate ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedSaving.id);

      if (balanceError) {
        if (transactionData?.id) {
          await supabase
            .from("saving_transactions")
            .delete()
            .eq("id", transactionData.id);
        }
        await deleteTransaction(financeTransactionId);
        setWallets((current) => {
          const nextWallets = current.map((wallet) =>
            wallet.id === activeWallet.id ? activeWallet : wallet,
          );
          walletsRef.current = nextWallets;
          return nextWallets;
        });
        setIsPersisting(false);
        showToast({
          type: "error",
          message:
            balanceError.message ||
            "Đã lưu giao dịch nhưng chưa cập nhật được số dư.",
        });
        return;
      }

      savedTransaction = mapTransactionRowToTransaction(
        transactionData as SavingTransactionRow,
      );
    }

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
        savedTransaction,
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
    showToast({
      type: "success",
      message:
        transactionForm.type === "settlement"
          ? "Đã tất toán khoản tiết kiệm trên Supabase."
          : "Đã lưu giao dịch tiết kiệm vào Supabase.",
    });
  };

  return (
    <section className="space-y-4">
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
      <div className="rounded-4xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/70 lg:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-600">
                  Savings
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 lg:text-[34px]">
                  Danh mục tiết kiệm
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Theo dõi tài khoản tiết kiệm, lãi dự kiến và lịch đáo hạn.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddModal}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 sm:self-start"
              >
                <Plus size={17} />
                Thêm khoản
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SavingsMetricCard
                title="Tổng tiết kiệm"
                value={formatCurrency(metrics.totalSavings)}
                description={`${localSavings.length} khoản đang theo dõi`}
                tone="blue"
                icon={<PiggyBank size={18} />}
              />
              <SavingsMetricCard
                title="Lãi dự kiến"
                value={`+${formatCurrency(metrics.expectedInterest)}`}
                description={`Lãi suất TB ${formatPercent(savingsExperience.averageRate)}`}
                tone="emerald"
                icon={<TrendingUp size={18} />}
              />
              <SavingsMetricCard
                title="Sắp đáo hạn"
                value={`${metrics.maturingSoon} khoản`}
                description={
                  savingsExperience.nextMaturity
                    ? getProgressLabel(savingsExperience.nextMaturity)
                    : "Chưa có lịch đáo hạn"
                }
                tone="amber"
                icon={<CalendarClock size={18} />}
              />
              <SavingsMetricCard
                title="Quỹ khẩn cấp"
                value={`${savingsExperience.emergencyMonths.toFixed(1)} tháng`}
                description={`${savingsExperience.emergencyProgress}% mục tiêu`}
                tone="indigo"
                icon={<ShieldCheck size={18} />}
              />
            </div>
          </div>

          <aside className="w-full rounded-3xl border border-slate-100 bg-slate-50/70 p-4 xl:max-w-xs">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                  Emergency Fund
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950">
                  {formatCurrency(metrics.emergencyFund)}
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Còn thiếu {formatCurrency(savingsExperience.emergencyGap)} để
                  đạt {EMERGENCY_MONTH_TARGET} tháng.
                </p>
              </div>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <ShieldCheck size={18} />
              </span>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs font-black text-slate-400">
                <span>Tiến độ</span>
                <span>{savingsExperience.emergencyProgress}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${savingsExperience.emergencyProgress}%` }}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-4xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                Maturity Timeline
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Lịch đáo hạn 6 tháng tới
              </h2>
            </div>
            <CalendarClock size={20} className="text-blue-500" />
          </div>

          {hasMaturityTimeline ? (
            <div className="mt-4 space-y-2">
              {savingsExperience.maturityTimeline.map((item) => (
                <div
                  key={item.key}
                  className="grid grid-cols-[56px_1fr_92px] items-center gap-3"
                >
                  <span className="text-sm font-black text-slate-500">
                    {item.label.replace("Tháng ", "T")}
                  </span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-blue-500 to-cyan-400"
                      style={{
                        width: `${Math.max(
                          4,
                          Math.round(
                            (item.amount /
                              savingsExperience.maxMaturityAmount) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                  <span className="text-right text-sm font-black text-slate-700">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
              <p className="text-sm font-black text-slate-700">
                Chưa có khoản đáo hạn trong 6 tháng tới.
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Thêm ngày đáo hạn để theo dõi lịch tiền về.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-4xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">
                Interest Forecast
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Ước tính lãi nhận theo tháng
              </h2>
            </div>
            <TrendingUp size={20} className="text-emerald-500" />
          </div>

          {hasInterestForecast ? (
            <>
              <div className="mt-4 flex h-32 items-end gap-3">
                {savingsExperience.interestForecast.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <div
                      className="w-full rounded-t-2xl bg-linear-to-t from-emerald-500 to-teal-300"
                      style={{
                        height: `${Math.max(
                          10,
                          Math.round(
                            (item.amount /
                              savingsExperience.maxInterestAmount) *
                              92,
                          ),
                        )}px`,
                      }}
                      title={formatCurrency(item.amount)}
                    />
                    <span className="text-xs font-black text-slate-400">
                      {item.label.replace("Tháng ", "T")}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Lãi tháng hiện tại ước tính khoảng{" "}
                <span className="font-black text-emerald-600">
                  {formatCurrency(
                    savingsExperience.interestForecast[0]?.amount ?? 0,
                  )}
                </span>
                .
              </p>
            </>
          ) : (
            <div className="mt-4 flex h-32 flex-col items-center justify-center rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 text-center">
              <TrendingUp size={24} className="text-emerald-500" />
              <p className="mt-2 text-sm font-black text-slate-700">
                Chưa có dữ liệu lãi.
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Thêm lãi suất cho tài khoản tiết kiệm để xem dự báo.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative flex-1 lg:max-w-sm">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm sổ tiết kiệm..."
            className="h-12 w-full rounded-3xl border border-slate-200 bg-white pl-12 pr-4 text-sm font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex gap-2 overflow-x-auto rounded-3xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
            {filters.map((filter) => {
              const isActive = activeFilter === filter.key;

              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                    isActive
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {filter.label}
                  {typeof filter.count === "number" ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500"
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
      </div>

      <div className="rounded-4xl border border-slate-100 bg-white p-5 shadow-sm shadow-slate-200/70 lg:p-6">
        {selectedSavingIds.length > 0 ? (
          <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-black text-blue-700 sm:flex-row sm:items-center sm:justify-between">
            <span>Đã chọn {selectedSavingIds.length} khoản tiết kiệm</span>
            <button
              type="button"
              onClick={() => setSelectedSavingIds([])}
              className="rounded-2xl bg-white px-4 py-2 text-slate-500 shadow-sm"
            >
              Bỏ chọn
            </button>
          </div>
        ) : null}

        <div className="mb-4 flex items-center justify-end">
          <details className="group relative">
            <summary
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-2xl bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-900 [&::-webkit-details-marker]:hidden"
              aria-label="Tùy chọn bảng tiết kiệm"
            >
              <MoreHorizontal size={18} />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-100 bg-white p-1.5 text-sm font-bold text-slate-600 shadow-xl shadow-slate-200/80">
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 hover:text-slate-950"
              >
                Export CSV
              </button>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 hover:text-slate-950"
              >
                Export Excel
              </button>
            </div>
          </details>
        </div>

        {filteredSavings.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 px-6 text-center">
            <span className="flex size-16 items-center justify-center rounded-3xl bg-blue-100 text-blue-600">
              <PiggyBank size={30} />
            </span>
            <h2 className="mt-5 text-xl font-black text-slate-950">
              Chưa có khoản tiết kiệm
            </h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-6 text-slate-500">
              Thêm sổ tiết kiệm đầu tiên để theo dõi lãi suất, ngày đáo hạn, quỹ
              khẩn cấp và giá trị tài sản ròng.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700"
            >
              <Plus size={18} />
              Thêm khoản tiết kiệm
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-100">
            <div className="sticky top-0 z-10 hidden grid-cols-[40px_1.25fr_0.85fr_1fr_0.8fr_0.95fr_0.95fr_0.95fr_1fr_0.75fr] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-wide text-slate-500 backdrop-blur lg:grid">
              <span>
                <input
                  type="checkbox"
                  checked={isAllVisibleSelected}
                  onChange={toggleAllVisibleSavings}
                  className="size-4 rounded border-slate-300"
                  aria-label="Chọn tất cả khoản tiết kiệm"
                />
              </span>
              <span>Tên khoản</span>
              <span>Loại</span>
              <span>Số tiền</span>
              <span>Lãi suất</span>
              <span>Ngày tạo</span>
              <span>Đáo hạn</span>
              <span>Tiến độ</span>
              <span>Trạng thái</span>
              <span className="text-right">Hành động</span>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredSavings.map((item) => {
                const status = getSavingStatus(item);
                const expectedInterest = estimateAnnualInterest(item);

                return (
                  <article
                    key={item.id}
                    className="grid gap-4 px-5 py-4 transition hover:bg-slate-50 lg:grid-cols-[40px_1.25fr_0.85fr_1fr_0.8fr_0.95fr_0.95fr_0.95fr_1fr_0.75fr] lg:items-center"
                  >
                    <div className="hidden lg:block">
                      <input
                        type="checkbox"
                        checked={selectedSavingIds.includes(item.id)}
                        className="size-4 rounded border-slate-300"
                        aria-label={`Chọn ${item.name}`}
                        onChange={() => toggleSavingSelection(item.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        {item.type === "emergency_fund" ? (
                          <ShieldCheck size={20} />
                        ) : (
                          <Landmark size={20} />
                        )}
                      </span>
                      <div>
                        <p className="font-black text-slate-950">{item.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {item.notes || "Chưa có ghi chú"}
                        </p>
                      </div>
                    </div>

                    <div className="text-sm font-bold text-slate-600">
                      {getSavingTypeLabel(item.type)}
                    </div>

                    <div className="text-base font-black text-blue-600">
                      {formatCurrency(item.balance)}
                    </div>

                    <div className="text-sm font-black text-emerald-600">
                      {isInterestBearingSaving(item.type)
                        ? formatPercent(item.interestRate ?? 0)
                        : "-"}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                      <CalendarClock size={16} className="text-blue-400" />
                      {formatDate(item.createdAt)}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                      <CalendarClock size={16} className="text-slate-400" />
                      {item.maturityDate
                        ? formatDate(item.maturityDate)
                        : "Linh hoạt"}
                    </div>

                    <div>
                      {isInterestBearingSaving(item.type) ? (
                        <>
                          <div className="mb-1 flex items-center justify-between gap-2 text-xs font-black text-slate-400">
                            <span>{getProgressLabel(item)}</span>
                            <span>{getSavingProgress(item)}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-linear-to-r from-blue-500 to-emerald-400"
                              style={{ width: `${getSavingProgress(item)}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs font-bold text-emerald-600">
                            Lãi: +{formatCurrency(expectedInterest)}
                          </p>
                        </>
                      ) : (
                        <div className="inline-flex w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                          Linh hoạt · Không kỳ hạn
                        </div>
                      )}
                    </div>

                    <span
                      className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black ${status.className}`}
                    >
                      {status.label === "Sắp đáo hạn" ? (
                        <AlertTriangle size={12} />
                      ) : (
                        <CheckCircle2 size={12} />
                      )}
                      {status.label}
                    </span>

                    <div className="flex items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditModal(item);
                        }}
                        className="inline-flex size-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                        aria-label={`Chỉnh sửa ${item.name}`}
                        title="Chỉnh sửa"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(item);
                        }}
                        className="inline-flex size-9 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                        aria-label={`Xóa ${item.name}`}
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 py-6 backdrop-blur-sm sm:py-8">
          <button
            type="button"
            aria-label="Đóng form khoản tiết kiệm"
            className="absolute inset-0 cursor-default"
            onClick={closeAddModal}
          />

          <form
            onSubmit={handleSubmitSaving}
            className="relative z-10 my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-220 flex-col overflow-hidden rounded-4xl bg-white shadow-2xl shadow-slate-950/20"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 bg-white p-6 lg:p-8">
              <div className="flex items-start gap-4">
                <span className="hidden size-14 shrink-0 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 sm:flex">
                  <PiggyBank size={26} />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                    {isEditing ? "EDIT SAVING" : "NEW SAVING"}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {isEditing
                      ? "Chỉnh sửa khoản tiết kiệm"
                      : "Tạo khoản tiết kiệm mới"}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {isEditing
                      ? "Chỉ giữ các trường cần sửa: thông tin, số tiền, lãi suất, kỳ hạn và preview."
                      : "Chọn nguồn vốn và thông tin khoản tiết kiệm để bắt đầu."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeAddModal}
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 lg:px-8 lg:py-6">
              <div className="grid gap-5">
                <div className="rounded-3xl border border-slate-100 bg-slate-50/60 p-4 lg:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                        Thông tin
                      </p>
                      <h3 className="mt-1 text-base font-black text-slate-950">
                        {isEditing
                          ? "Thông tin khoản tiết kiệm"
                          : "Tạo khoản tiết kiệm"}
                      </h3>
                    </div>
                    {isEditing && selectedSaving ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${getSavingStatus(selectedSaving).className}`}
                      >
                        <CheckCircle2 size={12} />
                        {getSavingStatus(selectedSaving).label}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Tên khoản
                      </span>
                      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
                        <PiggyBank
                          size={18}
                          className="shrink-0 text-blue-500"
                        />
                        <input
                          value={form.name}
                          onChange={(event) =>
                            updateForm("name", event.target.value)
                          }
                          placeholder={formConfig.namePlaceholder}
                          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                        />
                      </div>
                    </label>

                    <label>
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Loại tiết kiệm
                      </span>
                      <select
                        value={form.type}
                        onChange={(event) =>
                          updateForm("type", event.target.value as SavingType)
                        }
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="savings_account">
                          Tài khoản tiết kiệm
                        </option>
                        <option value="term_deposit">Tiền gửi có kỳ hạn</option>
                        <option value="certificate">Chứng chỉ tiền gửi</option>
                        <option value="emergency_fund">Quỹ khẩn cấp</option>
                      </select>
                    </label>

                    <label>
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {isEditing ? "Ví liên kết" : "Ví nguồn"}
                      </span>
                      <select
                        value={form.walletId}
                        onChange={(event) =>
                          updateForm("walletId", event.target.value)
                        }
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
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

                    <label>
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Ghi chú
                      </span>
                      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
                        <MessageSquareText
                          size={18}
                          className="shrink-0 text-blue-500"
                        />
                        <input
                          value={form.notes}
                          onChange={(event) =>
                            updateForm("notes", event.target.value)
                          }
                          placeholder={formConfig.notesPlaceholder}
                          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                        />
                      </div>
                    </label>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:p-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                      Tài chính
                    </p>
                    <h3 className="mt-1 text-base font-black text-slate-950">
                      Số tiền, lãi suất và kỳ hạn
                    </h3>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <label>
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Số tiền hiện tại
                      </span>
                      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
                        <Banknote
                          size={18}
                          className="shrink-0 text-blue-500"
                        />
                        <input
                          value={form.balance}
                          inputMode="numeric"
                          readOnly={isEditing}
                          onChange={(event) => {
                            if (isEditing) return;
                            updateForm(
                              "balance",
                              parseCurrencyInput(event.target.value),
                            );
                          }}
                          placeholder={formConfig.amountPlaceholder}
                          className={`h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400 ${isEditing ? "cursor-not-allowed text-slate-500" : "text-slate-700"}`}
                        />
                      </div>
                      {isEditing ? (
                        <p className="mt-2 text-xs font-bold text-slate-400">
                          Số tiền được cập nhật bằng giao dịch Nạp thêm, Rút bớt
                          hoặc Tất toán.
                        </p>
                      ) : null}
                    </label>

                    {formConfig.showInterestRate ? (
                      <label>
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Lãi suất / năm
                        </span>
                        <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
                          <Percent
                            size={18}
                            className="shrink-0 text-blue-500"
                          />
                          <input
                            value={form.interestRate}
                            inputMode="decimal"
                            onChange={(event) =>
                              updateForm("interestRate", event.target.value)
                            }
                            placeholder={formConfig.interestPlaceholder}
                            className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </label>
                    ) : null}

                    {formConfig.showMaturityDate ? (
                      <label>
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {formConfig.maturityLabel}
                        </span>
                        <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
                          <Clock3
                            size={18}
                            className="shrink-0 text-blue-500"
                          />
                          <input
                            type="date"
                            value={form.maturityDate}
                            onChange={(event) =>
                              updateForm("maturityDate", event.target.value)
                            }
                            className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none"
                          />
                        </div>
                      </label>
                    ) : null}
                  </div>
                </div>

                {isEditing && selectedSaving ? (
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4 lg:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">
                          Giao dịch tiền
                        </p>
                        <h3 className="mt-1 text-base font-black text-slate-950">
                          Nạp thêm, rút bớt hoặc tất toán
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          Mỗi giao dịch sẽ tự cập nhật số dư tiết kiệm và
                          cộng/trừ đúng vào ví đã chọn.
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-1 shadow-sm">
                        {(["deposit", "withdraw", "settlement"] as const).map(
                          (type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() =>
                                setTransactionForm((current) => ({
                                  ...current,
                                  type,
                                  amount:
                                    type === "settlement"
                                      ? formatCurrencyInputFromNumber(
                                          selectedSaving.balance,
                                        )
                                      : current.type === "settlement"
                                        ? ""
                                        : current.amount,
                                  walletId:
                                    current.walletId ||
                                    selectedSaving.walletId ||
                                    wallets[0]?.id ||
                                    "",
                                }))
                              }
                              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black transition ${
                                transactionForm.type === type
                                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                              }`}
                            >
                              {getTransactionIcon(type)}
                              {getTransactionLabel(type)}
                            </button>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_1.2fr]">
                      <label>
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Số tiền giao dịch
                        </span>
                        <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 transition focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100">
                          <Banknote
                            size={18}
                            className="shrink-0 text-emerald-500"
                          />
                          <input
                            value={transactionForm.amount}
                            inputMode="numeric"
                            onChange={(event) =>
                              updateTransactionForm(
                                "amount",
                                parseCurrencyInput(event.target.value),
                              )
                            }
                            placeholder={
                              transactionForm.type === "settlement"
                                ? formatCurrencyInputFromNumber(
                                    selectedSaving.balance,
                                  )
                                : "10.000.000"
                            }
                            className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </label>

                      <label>
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {transactionForm.type === "deposit"
                            ? "Ví nguồn"
                            : "Ví nhận"}
                        </span>
                        <select
                          value={transactionForm.walletId}
                          onChange={(event) =>
                            updateTransactionForm(
                              "walletId",
                              event.target.value,
                            )
                          }
                          className="mt-2 h-12 w-full rounded-2xl border border-emerald-100 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                        >
                          <option value="">Chọn ví</option>
                          {wallets.map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              {wallet.name} · {formatCurrency(wallet.balance)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Ghi chú giao dịch
                        </span>
                        <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 transition focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-100">
                          <MessageSquareText
                            size={18}
                            className="shrink-0 text-emerald-500"
                          />
                          <input
                            value={transactionForm.note}
                            onChange={(event) =>
                              updateTransactionForm("note", event.target.value)
                            }
                            placeholder={getTransactionLabel(
                              transactionForm.type,
                            )}
                            className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                          />
                        </div>
                      </label>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 md:grid-cols-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Tiết kiệm hiện tại
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {formatCurrency(selectedSaving.balance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Ví sau giao dịch
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {transactionWalletBalanceAfter !== null
                            ? formatCurrency(transactionWalletBalanceAfter)
                            : "Chọn ví"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Tiết kiệm sau giao dịch
                        </p>
                        <p className="mt-1 text-sm font-black text-emerald-700">
                          {formatCurrency(
                            transactionForm.type === "deposit"
                              ? selectedSaving.balance +
                                  parseCurrencyValue(transactionForm.amount)
                              : transactionForm.type === "settlement"
                                ? 0
                                : Math.max(
                                    0,
                                    selectedSaving.balance -
                                      parseCurrencyValue(
                                        transactionForm.amount,
                                      ),
                                  ),
                          )}
                        </p>
                      </div>
                    </div>

                    {transactionError ? (
                      <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                        {transactionError}
                      </div>
                    ) : null}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleAddTransaction()}
                        disabled={isPersisting}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {getTransactionIcon(transactionForm.type)}
                        {isPersisting
                          ? "Đang xử lý..."
                          : `Xác nhận ${getTransactionLabel(transactionForm.type).toLowerCase()}`}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4 lg:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">
                          Preview
                        </p>
                        <h3 className="mt-1 text-base font-black text-slate-950">
                          Ảnh hưởng sau khi lưu
                        </h3>
                      </div>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600">
                        <TrendingUp size={18} />
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Số tiền hiện tại
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {formatCurrency(previewPrincipal)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          {formConfig.interestTitle}
                        </p>
                        <p className="mt-1 text-sm font-black text-emerald-600">
                          +{formatCurrency(previewInterest)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          {formConfig.totalTitle}
                        </p>
                        <p className="mt-1 text-sm font-black text-blue-700">
                          {formatCurrency(previewMaturityValue)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Ngày đáo hạn
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {form.maturityDate
                            ? formatDate(form.maturityDate)
                            : "Linh hoạt"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:p-5">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                      Ví
                    </p>
                    <h3 className="mt-1 text-base font-black text-slate-950">
                      {selectedInitialWallet?.name ?? "Chưa chọn ví"}
                    </h3>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Số dư ví hiện tại
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {formatCurrency(selectedWalletBalance)}
                        </p>
                      </div>
                      {!isEditing ? (
                        <div className="rounded-2xl bg-emerald-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-emerald-500">
                            Sau khi chuyển vào tiết kiệm
                          </p>
                          <p className="mt-1 text-sm font-black text-emerald-700">
                            {formatCurrency(walletBalanceAfterInitialDeposit)}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Giao dịch gần đây
                          </p>
                          <p className="mt-1 text-sm font-black text-slate-950">
                            {selectedTransactions.length} dòng
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isEditing &&
                selectedSaving &&
                selectedTransactions.length > 0 ? (
                  <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                          Lịch sử
                        </p>
                        <h3 className="mt-1 text-base font-black text-slate-950">
                          Giao dịch tiết kiệm gần đây
                        </h3>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                        Hiển thị 3 dòng
                      </span>
                    </div>

                    <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
                      {selectedTransactions.slice(0, 3).map((transaction) => {
                        const signedAmount =
                          getSignedTransactionAmount(transaction);
                        const isIncome = signedAmount > 0;

                        return (
                          <div
                            key={transaction.id}
                            className="grid gap-2 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                          >
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-600">
                                {getTransactionIcon(transaction.type)}
                              </span>
                              <div>
                                <p className="text-sm font-black text-slate-800">
                                  {transaction.note}
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-400">
                                  {formatDate(transaction.date)} ·{" "}
                                  {getTransactionLabel(transaction.type)}
                                </p>
                              </div>
                            </div>
                            <p
                              className={`text-sm font-black ${isIncome ? "text-emerald-600" : "text-rose-600"}`}
                            >
                              {isIncome ? "+" : "-"}
                              {formatCurrency(Math.abs(signedAmount))}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {isInitialDepositTooHigh ? (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                    Không đủ số dư ví. Ví hiện có{" "}
                    {formatCurrency(selectedWalletBalance)}, nhưng số tiền gửi
                    là {formatCurrency(previewPrincipal)}.
                  </div>
                ) : null}

                {formError ? (
                  <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                    {formError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 bg-white/95 p-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
              {isEditing && selectedSaving ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(selectedSaving);
                    closeAddModal();
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-5 text-sm font-bold text-rose-600 transition hover:bg-rose-100"
                >
                  <Trash2 size={17} />
                  Xóa khoản này
                </button>
              ) : (
                <span />
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  disabled={isPersisting || isInitialDepositTooHigh}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isEditing ? <Pencil size={18} /> : <Plus size={18} />}
                  {isPersisting
                    ? "Đang lưu..."
                    : isEditing
                      ? "Lưu thay đổi"
                      : "Lưu khoản tiết kiệm"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function SavingsMetricCard({
  title,
  value,
  description,
  tone,
  icon,
}: {
  title: string;
  value: string;
  description: string;
  tone: "blue" | "emerald" | "amber" | "indigo";
  icon: ReactNode;
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50/70 text-blue-600",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-600",
    amber: "border-amber-100 bg-amber-50/70 text-amber-600",
    indigo: "border-indigo-100 bg-indigo-50/70 text-indigo-600",
  }[tone];

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            {title}
          </p>
          <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">{description}</p>
        </div>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
