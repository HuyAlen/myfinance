import { formatLocalISODate } from "@/src/lib/date/calendarDate";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import type {
  SavingAccount,
  SavingType,
} from "@/src/types/finance";
export type SavingWithWallet = SavingAccount & {
  walletId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SavingsPageProps = {
  savings?: SavingWithWallet[];
};

export type SavingsFilter = "all" | "active" | "maturing" | "emergency" | "completed";

export type SavingFormState = {
  name: string;
  type: SavingType;
  balance: string;
  walletId: string;
  interestRate: string;
  maturityDate: string;
  notes: string;
};

export type ToastState = {
  type: "success" | "error";
  message: string;
};

export type SavingTransactionType = "deposit" | "withdraw" | "interest" | "settlement";

export type SavingTransaction = {
  id: string;
  savingId: string;
  type: SavingTransactionType;
  amount: number;
  date: string;
  note: string;
  transferReference?: string;
  transferDirection?: "out" | "in";
};

export type TransactionFormState = {
  type: Exclude<SavingTransactionType, "interest">;
  amount: string;
  walletId: string;
  note: string;
};

export type SavingRow = {
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

export type SavingTransactionRow = {
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

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const mapSavingRowToSaving = (row: SavingRow): SavingWithWallet => ({
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

export const parseSavingTransferLedgerNote = (note: string) => {
  const match = note.match(
    /^__saving_transfer__:([0-9a-f-]+):(out|in)\|(.*)$/i,
  );
  if (!match) return null;

  return {
    reference: match[1],
    direction: match[2] as "out" | "in",
    displayNote: match[3] || "Chuyển giữa các khoản tiết kiệm",
  };
};
export const mapTransactionRowToTransaction = (
  row: SavingTransactionRow,
): SavingTransaction => {
  const transfer = parseSavingTransferLedgerNote(row.note ?? "");

  return {
    id: row.id,
    savingId: row.saving_id,
    type: row.type,
    amount: Number(row.amount ?? 0),
    date: row.transaction_date,
    note: transfer?.displayNote ?? row.note ?? getTransactionLabel(row.type),
    transferReference: transfer?.reference,
    transferDirection: transfer?.direction,
  };
};

export const groupTransactionsBySavingId = (transactions: SavingTransaction[]) =>
  transactions.reduce<Record<string, SavingTransaction[]>>((grouped, item) => {
    grouped[item.savingId] = [...(grouped[item.savingId] ?? []), item];
    return grouped;
  }, {});

export const EMPTY_SAVINGS: SavingWithWallet[] = [];

export const INITIAL_FORM: SavingFormState = {
  name: "",
  type: "savings_account",
  balance: "",
  walletId: "",
  interestRate: "",
  maturityDate: "",
  notes: "",
};

export const INITIAL_TRANSACTION_FORM: TransactionFormState = {
  type: "deposit",
  amount: "",
  walletId: "",
  note: "",
};

export const todayInputValue = () => formatLocalISODate();

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

export const formatPercent = (value: number) =>
  `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)}%`;

export const formatDate = (date?: string) => {
  if (!date) return "-";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

export const getDaysUntil = (date?: string) => {
  if (!date) return null;

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  return Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
};

export const getSavingTypeLabel = (type: SavingType) => {
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

export const getSavingStatus = (saving: SavingWithWallet) => {
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

export const estimateAnnualInterest = (saving: SavingAccount) => {
  const rate = saving.interestRate ?? 0;
  return calculateProjectedInterest(saving.balance, rate, saving.maturityDate);
};

export const parseNumberInput = (value: string) => {
  const normalized = value
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseCurrencyValue = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return 0;

  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseCurrencyInput = (value: string) => {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return "";

  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(Number(digitsOnly));
};

export const formatCurrencyInputFromNumber = (value: number) =>
  value > 0
    ? new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 0,
      }).format(value)
    : "";

export const calculateProjectedInterest = (
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

export const getSavingFormConfig = (type: SavingType) => {
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
        previewTitle: "Xem trước tiền lãi",
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
        previewTitle: "Xem trước chứng chỉ tiền gửi",
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
        previewTitle: "Xem trước quỹ khẩn cấp",
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
        previewTitle: "Xem trước tiết kiệm",
        previewDescription:
          "Tài khoản tiết kiệm linh hoạt được ước tính theo 1 năm vì không có ngày đáo hạn.",
        interestTitle: "Lãi dự kiến / năm",
        totalTitle: "Giá trị sau 1 năm",
      };
  }
};

export const isInterestBearingSaving = (type: SavingType) =>
  type === "savings_account" ||
  type === "term_deposit" ||
  type === "certificate";

export const getTransactionLabel = (type: SavingTransactionType) => {
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

export const getTransactionIcon = (type: SavingTransactionType) => {
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

export const getSignedTransactionAmount = (transaction: SavingTransaction) => {
  if (transaction.type === "withdraw" || transaction.type === "settlement") {
    return -transaction.amount;
  }

  return transaction.amount;
};

export const MONTHLY_EXPENSE_TARGET = 25_000_000;
export const EMERGENCY_MONTH_TARGET = 6;

export const getSavingProgress = (saving: SavingWithWallet) => {
  const days = getDaysUntil(saving.maturityDate);

  if (days === null) return 100;
  if (days <= 0) return 100;

  const estimatedTermDays = days > 365 ? days + 180 : 365;
  return Math.max(
    8,
    Math.min(100, Math.round(100 - (days / estimatedTermDays) * 100)),
  );
};

export const getProgressLabel = (saving: SavingWithWallet) => {
  const days = getDaysUntil(saving.maturityDate);

  if (days === null) return "Linh hoạt";
  if (days < 0) return "Đã đáo hạn";
  if (days === 0) return "Đáo hạn hôm nay";
  return `Còn ${days} ngày`;
};
