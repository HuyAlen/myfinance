"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useDateFilter } from "@/src/components/layout/DateFilterProvider";

import {
  Area,
  AreaChart,
  LabelList,
  Bar,
  Line,
  CartesianGrid,
  ComposedChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

import {
  getBudgets,
  getCategories,
  getDebts,
  getGoals,
  getInvestments,
  getTransactions,
  getWallets,
} from "@/src/services/finance/financeStorage";

import {
  buildCategorySpendingData,
  buildMonthlyCashFlowData,
  calculateDashboardSummary,
  calculateFinancialStructureSummary,
  calculateFinancialStabilitySummary,
  calculateFinancialIndependenceSummary,
  calculateAiCfoInsightSummary,
  calculateRule503020,
  filterBudgetsByDateRange,
  filterTransactionsByDateRange,
  formatVND,
  generateDashboardActions,
  getFinancialGrade,
  getGoalEffectiveCurrentAmount,
  getGoalLinkedSavingAmount,
} from "@/src/services/finance/financeCalculations";

import type {
  CategorySpending,
  DashboardActionIcon,
} from "@/src/services/finance/financeCalculations";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet as WalletType,
  SavingAccount,
} from "@/src/types/finance";

const ASSET_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#38bdf8", "#6366f1"];
const SPEND_COLORS = [
  "#fb7185",
  "#f97316",
  "#0ea5e9",
  "#6366f1",
  "#10b981",
  "#94a3b8",
];
const INV_TYPE_COLORS: Record<string, string> = {
  stock: "#2563eb",
  fund: "#10b981",
  crypto: "#f59e0b",
  gold: "#f97316",
  other: "#6366f1",
};
const INV_TYPE_LABELS: Record<string, string> = {
  stock: "Cổ phiếu",
  fund: "Quỹ ETF",
  crypto: "Crypto",
  gold: "Vàng",
  other: "Khác",
};
const SPARK = [30, 44, 38, 58, 52, 70, 63];

type SavingRow = {
  id: string;
  name: string;
  type: SavingAccount["type"];
  balance: number | string | null;
  principal?: number | string | null;
  principal_amount?: number | string | null;
  initial_amount?: number | string | null;
  opening_amount?: number | string | null;
  deposit_amount?: number | string | null;
  interest_rate: number | string | null;
  maturity_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type DashboardSavingAccount = SavingAccount & {
  createdAt?: string;
  principal?: number;
  initialAmount?: number;
};

const normalizeGoalText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();

const getDashboardGoalSavingAmount = (
  goal: Goal,
  savings: DashboardSavingAccount[],
) => {
  const linkedSavingIds = new Set(goal.savingCategoryIds ?? []);
  const selectedSavingsAmount = savings.reduce((sum, saving) => {
    if (!linkedSavingIds.has(saving.id)) return sum;
    return sum + saving.balance;
  }, 0);

  if (selectedSavingsAmount > 0) return selectedSavingsAmount;

  const goalName = normalizeGoalText(goal.name);

  return savings.reduce((sum, saving) => {
    const savingName = normalizeGoalText(saving.name);
    const isEmergencyGoal =
      goalName.includes("khan cap") ||
      goalName.includes("emergency") ||
      goalName.includes("du phong");
    const isEmergencySaving = saving.type === "emergency_fund";
    const isNameMatched =
      goalName.length > 0 &&
      savingName.length > 0 &&
      (goalName.includes(savingName) || savingName.includes(goalName));

    if ((isEmergencyGoal && isEmergencySaving) || isNameMatched) {
      return sum + saving.balance;
    }

    return sum;
  }, 0);
};

type DashboardGoalMeta = Goal & {
  percent: number;
  pct: number;
  remaining: number;
  linkedSavingAmount: number;
  supabaseSavingAmount: number;
  effectiveCurrentAmount: number;
  suggestedMonthly: number;
  monthsLeft: number;
};

type SavingTransactionRow = {
  id: string;
  saving_id: string;
  type: "deposit" | "withdraw" | "interest" | "settlement";
  amount: number | string | null;
  transaction_date: string | null;
  created_at?: string | null;
  note: string | null;
};

type DashboardSavingTransaction = {
  id: string;
  savingId: string;
  type: SavingTransactionRow["type"];
  amount: number;
  date: string;
  createdAt?: string;
  note: string;
};

type WalletTransferRow = {
  id?: string | number | null;
  amount?: number | string | null;
  transfer_date?: string | null;
  transaction_date?: string | null;
  date?: string | null;
  created_at?: string | null;
  note?: string | null;
};

type DashboardWalletTransfer = {
  id: string;
  amount: number;
  date: string;
  note: string;
};

const WALLET_TRANSFER_TABLES = [
  "wallet_transfers",
  "wallet_transfer_transactions",
  "transfer_transactions",
] as const;

const mapWalletTransferRow = (
  row: WalletTransferRow,
  index: number,
  tableName: string,
): DashboardWalletTransfer => ({
  id: String(row.id ?? `${tableName}-${index}`),
  amount: Number(row.amount ?? 0),
  date:
    row.transfer_date ??
    row.transaction_date ??
    row.date ??
    row.created_at ??
    new Date().toISOString(),
  note: row.note ?? "Chuyển ví",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const savingsSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const mapSavingRowToSavingAccount = (
  row: SavingRow,
): DashboardSavingAccount => {
  const principal = Number(
    row.principal ??
      row.principal_amount ??
      row.initial_amount ??
      row.opening_amount ??
      row.deposit_amount ??
      row.balance ??
      0,
  );

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balance: Number(row.balance ?? 0),
    principal: Number.isFinite(principal) ? principal : 0,
    initialAmount: Number.isFinite(principal) ? principal : 0,
    interestRate:
      row.interest_rate === null || row.interest_rate === undefined
        ? undefined
        : Number(row.interest_rate),
    maturityDate: row.maturity_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
};

const mapSavingTransactionRow = (
  row: SavingTransactionRow,
): DashboardSavingTransaction => ({
  id: row.id,
  savingId: row.saving_id,
  type: row.type,
  amount: Number(row.amount ?? 0),
  date:
    row.transaction_date ??
    row.created_at ??
    new Date().toISOString().slice(0, 10),
  createdAt: row.created_at ?? undefined,
  note: row.note ?? "Giao dịch tiết kiệm",
});

const getSavingTransactionLabel = (
  type: DashboardSavingTransaction["type"],
) => {
  switch (type) {
    case "deposit":
      return "Nạp tiết kiệm";
    case "withdraw":
      return "Rút tiết kiệm";
    case "settlement":
      return "Tất toán tiết kiệm";
    case "interest":
      return "Lãi tiết kiệm";
    default:
      return "Giao dịch tiết kiệm";
  }
};

function getMonthIndexFromDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getMonth() + 1;
}

function getYearFromDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getFullYear();
}

function getRecordDate(record: Record<string, unknown>) {
  const rawDate =
    record.date ??
    record.transactionDate ??
    record.transaction_date ??
    record.createdAt ??
    record.created_at;

  if (typeof rawDate !== "string" && !(rawDate instanceof Date)) return null;

  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecordAmount(record: Record<string, unknown>) {
  const rawAmount = record.amount ?? record.value ?? record.total;
  const amount = Number(rawAmount ?? 0);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

type RecentActivityKind =
  | "income"
  | "expense"
  | "saving"
  | "investment"
  | "transfer";

type RecentActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: number;
  date: string;
  dayLabel: string;
  timeLabel: string;
  kind: RecentActivityKind;
};

const INTERNAL_TRANSFER_KEYWORDS = [
  "transfer",
  "internal",
  "chuyển tiền",
  "chuyen tien",
  "chuyển khoản",
  "chuyen khoan",
  "chuyển nội bộ",
  "chuyen noi bo",
  "sang vietcombank",
  "sang tp bank",
  "sang tpbank",
];

function isInternalTransferTransaction(transaction: Transaction) {
  const record = transaction as Record<string, unknown>;
  const searchableText = [
    record.type,
    record.kind,
    record.transactionType,
    record.transaction_type,
    record.categoryType,
    record.category_type,
    record.categoryName,
    record.category_name,
    record.note,
    record.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    transaction.type === "transfer" ||
    INTERNAL_TRANSFER_KEYWORDS.some((keyword) =>
      searchableText.includes(keyword),
    )
  );
}

function getRecentDayLabel(dateText: string) {
  const date = new Date(dateText);
  if (!Number.isFinite(date.getTime())) return "Không rõ ngày";

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  const diffDays = Math.round((todayStart - dateStart) / 86400000);

  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";

  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function hasExplicitTime(value: unknown) {
  if (value instanceof Date) return true;
  if (typeof value !== "string") return false;

  // Date-only values such as 2026-07-01 are parsed as midnight UTC by JS and
  // render as 07:00 in Vietnam, which is wrong for Recent Transactions.
  return /[tT ]\d{1,2}:\d{2}/.test(value);
}

function pickRecentDateTime(
  fallbackDate: string,
  record?: Record<string, unknown>,
) {
  const candidates = [
    record?.transactionDateTime,
    record?.transaction_datetime,
    record?.datetime,
    record?.timestamp,
    record?.transactionDate,
    record?.transaction_date,
    record?.date,
    record?.time,
    record?.transactionTime,
    record?.transaction_time,
    record?.createdAt,
    record?.created_at,
    record?.updatedAt,
    record?.updated_at,
    fallbackDate,
  ];

  const timeOnly = [
    record?.time,
    record?.transactionTime,
    record?.transaction_time,
  ].find((value) => typeof value === "string" && /^\d{1,2}:\d{2}/.test(value));
  if (typeof timeOnly === "string") {
    const dateOnly = [
      record?.transactionDate,
      record?.transaction_date,
      record?.date,
      fallbackDate,
    ].find(
      (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value),
    );

    if (typeof dateOnly === "string") {
      return `${dateOnly.slice(0, 10)}T${timeOnly.slice(0, 5)}:00`;
    }
  }

  const explicit = candidates.find(hasExplicitTime);
  if (explicit instanceof Date) return explicit.toISOString();
  if (typeof explicit === "string") return explicit;

  const fallback = candidates.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return typeof fallback === "string" ? fallback : fallbackDate;
}

function getRecentTimeLabel(dateText: string) {
  if (!hasExplicitTime(dateText)) return "";

  const date = new Date(dateText);
  if (!Number.isFinite(date.getTime())) return "";

  return date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSavingActivityTitle(type: DashboardSavingTransaction["type"]) {
  if (type === "deposit") return "Gửi tiết kiệm";
  if (type === "withdraw") return "Rút gốc tiết kiệm";
  if (type === "interest") return "Nhận lãi tiết kiệm";
  return "Tất toán tiết kiệm";
}

function getRecentAmountPrefix(kind: RecentActivityKind) {
  if (kind === "income") return "+";
  if (kind === "expense") return "−";
  return "";
}

function getRecentIconClass(kind: RecentActivityKind) {
  if (kind === "income") return "bg-emerald-50 text-emerald-600";
  if (kind === "expense") return "bg-rose-50 text-rose-500";
  if (kind === "saving") return "bg-blue-50 text-blue-600";
  if (kind === "investment") return "bg-violet-50 text-violet-600";
  return "bg-slate-100 text-slate-500";
}

function getRecentAmountClass(kind: RecentActivityKind) {
  if (kind === "income") return "text-emerald-600";
  if (kind === "expense") return "text-rose-500";
  if (kind === "saving") return "text-blue-600";
  if (kind === "investment") return "text-violet-600";
  return "text-slate-500";
}

function getTransactionNetWorthImpact(transaction: Transaction) {
  const record = transaction as Record<string, unknown>;
  const amount = getRecordAmount(record);
  if (amount <= 0) return 0;

  const searchableText = [
    record.type,
    record.kind,
    record.transactionType,
    record.transaction_type,
    record.categoryType,
    record.category_type,
    record.categoryName,
    record.category_name,
    record.note,
    record.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    searchableText.includes("transfer") ||
    searchableText.includes("internal") ||
    searchableText.includes("chuyển") ||
    searchableText.includes("chuyen") ||
    searchableText.includes("tiết kiệm") ||
    searchableText.includes("tiet kiem") ||
    searchableText.includes("saving")
  ) {
    return 0;
  }

  if (
    searchableText.includes("income") ||
    searchableText.includes("thu nhập") ||
    searchableText.includes("thu nhap") ||
    searchableText.includes("revenue")
  ) {
    return amount;
  }

  if (
    searchableText.includes("expense") ||
    searchableText.includes("chi tiêu") ||
    searchableText.includes("chi tieu") ||
    searchableText.includes("spending")
  ) {
    return -amount;
  }

  const signedAmount = Number(record.amount ?? 0);
  return Number.isFinite(signedAmount) ? signedAmount : 0;
}

function getSavingTransactionNetWorthImpact(
  transaction: DashboardSavingTransaction,
) {
  if (transaction.type === "interest") return transaction.amount;
  return 0;
}

function getSavingCashflowAmount(saving: DashboardSavingAccount) {
  const record = saving as Record<string, unknown>;

  // Cash-flow uses the opening amount of the saving account, not the current
  // balance after interest/settlement. Balance is only a temporary fallback for
  // older records that do not yet have principal/initial_amount.
  const rawAmount =
    record.principal ??
    record.principal_amount ??
    record.initialAmount ??
    record.initial_amount ??
    record.openingAmount ??
    record.opening_amount ??
    record.depositAmount ??
    record.deposit_amount ??
    record.balance;

  const amount = Number(rawAmount ?? 0);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

function getInvestmentCashflowAmount(investment: Investment) {
  const record = investment as Record<string, unknown>;

  // Cash-flow uses invested capital only. Do not use currentValue/marketValue
  // because unrealized gain/loss belongs to asset performance, not cash-flow.
  const rawAmount =
    record.investedAmount ??
    record.invested_amount ??
    record.investedCapital ??
    record.invested_capital ??
    record.principal ??
    record.initialCapital ??
    record.initial_capital ??
    record.initialAmount ??
    record.initial_amount ??
    record.costBasis ??
    record.cost_basis ??
    record.amount;

  const amount = Number(rawAmount ?? 0);
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0;
}

function getEndOfMonth(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function formatOneDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(Math.round(value * 10) / 10);
}

function formatMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function formatMonthLabel(year: number, month: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(Math.round(value), 100));
}

export default function DashboardPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [savings, setSavings] = useState<DashboardSavingAccount[]>([]);
  const [savingTransactions, setSavingTransactions] = useState<
    DashboardSavingTransaction[]
  >([]);
  const [walletTransfers, setWalletTransfers] = useState<
    DashboardWalletTransfer[]
  >([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isHealthDrawerOpen, setIsHealthDrawerOpen] = useState(false);
  const { dateRange, selectedYear } = useDateFilter();

  const filteredTransactions = useMemo(
    () => filterTransactionsByDateRange(transactions, dateRange),
    [transactions, dateRange],
  );

  const filteredBudgets = useMemo(
    () => filterBudgetsByDateRange(budgets, dateRange),
    [budgets, dateRange],
  );

  /**
   * Dashboard v5 data model
   *
   * Flow data is scoped by the Date Timeline picker. This includes income,
   * expense, cash flow, spending, budgets, recent transactions, and AI
   * recommendations related to movement inside the selected period.
   *
   * Asset data is a current snapshot until the app has asset history tables.
   * This includes wallets, investments, debts, goals, net worth, and asset
   * allocation. Do not empty these arrays when the selected date range is in
   * the past or future.
   */
  const snapshotWallets = wallets;
  const snapshotInvestments = investments;
  const snapshotDebts = debts;
  const snapshotGoals = goals;

  const reloadData = useCallback(async () => {
    const transferHistoryPromise = savingsSupabase
      ? Promise.all(
          WALLET_TRANSFER_TABLES.map(async (tableName) => {
            const result = await savingsSupabase
              .from(tableName)
              .select("*")
              .order("created_at", { ascending: false });

            if (result.error) return [];

            return ((result.data ?? []) as WalletTransferRow[]).map(
              (row, index) => mapWalletTransferRow(row, index, tableName),
            );
          }),
        ).then((groups) => {
          const byId = new Map<string, DashboardWalletTransfer>();

          groups.flat().forEach((transfer) => {
            const key = `${transfer.id}-${transfer.date}-${transfer.amount}`;
            byId.set(key, transfer);
          });

          return Array.from(byId.values());
        })
      : Promise.resolve([] as DashboardWalletTransfer[]);

    const [
      w,
      inv,
      cat,
      txn,
      dbt,
      gls,
      bdg,
      savingRows,
      savingTxnRows,
      transferRows,
    ] = await Promise.all([
      getWallets(),
      getInvestments(),
      getCategories(),
      getTransactions(),
      getDebts(),
      getGoals(),
      getBudgets(),
      savingsSupabase
        ? savingsSupabase
            .from("savings")
            .select("*")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      savingsSupabase
        ? savingsSupabase
            .from("saving_transactions")
            .select("id,saving_id,type,amount,transaction_date,created_at,note")
            .order("transaction_date", { ascending: false })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      transferHistoryPromise,
    ]);

    setWallets(w);
    setInvestments(inv);
    setCategories(cat);
    setTransactions(txn);
    setDebts(dbt);
    setGoals(gls);
    setBudgets(bdg);
    setWalletTransfers(transferRows);

    if (!savingRows.error) {
      setSavings(
        ((savingRows.data ?? []) as SavingRow[]).map(
          mapSavingRowToSavingAccount,
        ),
      );
    }

    if (!savingTxnRows.error) {
      setSavingTransactions(
        ((savingTxnRows.data ?? []) as SavingTransactionRow[]).map(
          mapSavingTransactionRow,
        ),
      );
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [reloadData]);

  useRealtimeTable(
    ["wallets", "transactions", "investments", "debts", "goals", "budgets"],
    reloadData,
  );

  // ── Core summary ──────────────────────────────────────────────────────────
  const baseSummary = useMemo(
    () =>
      calculateDashboardSummary({
        wallets: snapshotWallets,
        savings,
        investments: snapshotInvestments,
        debts: snapshotDebts,
        transactions: filteredTransactions,
        categories,
        goals: snapshotGoals,
      }),
    [
      snapshotWallets,
      savings,
      snapshotInvestments,
      snapshotDebts,
      filteredTransactions,
      categories,
      snapshotGoals,
    ],
  );

  const savingsSnapshot = useMemo(() => {
    const totalSavings = savings.reduce((sum, item) => sum + item.balance, 0);
    const emergencyFund = savings
      .filter((item) => item.type === "emergency_fund")
      .reduce((sum, item) => sum + item.balance, 0);
    const expectedInterest = savings.reduce((sum, item) => {
      const rate = item.interestRate ?? 0;
      return sum + (item.balance * rate) / 100;
    }, 0);

    return { totalSavings, emergencyFund, expectedInterest };
  }, [savings]);

  const goalMeta = useMemo<DashboardGoalMeta[]>(
    () =>
      snapshotGoals.map((goal) => {
        const linkedSavingAmount = getGoalLinkedSavingAmount({
          goal,
          transactions,
        });
        const supabaseSavingAmount = getDashboardGoalSavingAmount(
          goal,
          savings,
        );
        const baseEffectiveCurrentAmount = getGoalEffectiveCurrentAmount({
          goal,
          transactions,
        });
        const effectiveCurrentAmount = Math.max(
          baseEffectiveCurrentAmount,
          goal.currentAmount + supabaseSavingAmount,
        );
        const percent =
          goal.targetAmount > 0
            ? Math.min(
                Math.round((effectiveCurrentAmount / goal.targetAmount) * 100),
                100,
              )
            : 0;
        const remaining = Math.max(
          goal.targetAmount - effectiveCurrentAmount,
          0,
        );
        const suggestedMonthly =
          remaining > 0 ? Math.ceil(remaining / 12 / 1000) * 1000 : 0;
        const monthsLeft =
          suggestedMonthly > 0 ? Math.ceil(remaining / suggestedMonthly) : 0;

        return {
          ...goal,
          percent,
          pct: percent,
          remaining,
          linkedSavingAmount,
          supabaseSavingAmount,
          effectiveCurrentAmount,
          suggestedMonthly,
          monthsLeft,
        };
      }),
    [snapshotGoals, transactions, savings],
  );

  const goalSnapshot = useMemo(() => {
    const trackedGoals = goalMeta.filter((goal) => goal.targetAmount > 0);
    const totalTarget = trackedGoals.reduce(
      (sum, goal) => sum + goal.targetAmount,
      0,
    );
    const totalSaved = trackedGoals.reduce(
      (sum, goal) =>
        sum + Math.min(goal.effectiveCurrentAmount, goal.targetAmount),
      0,
    );
    const averageProgress =
      totalTarget > 0 ? clampScore((totalSaved / totalTarget) * 100) : 0;

    return {
      trackedCount: trackedGoals.length,
      totalTarget,
      totalSaved,
      averageProgress,
    };
  }, [goalMeta]);

  const walletLiquidity = useMemo(
    () => snapshotWallets.reduce((sum, wallet) => sum + wallet.balance, 0),
    [snapshotWallets],
  );

  const savingsRateFromSavings = useMemo(() => {
    if (baseSummary.income <= 0) return 0;
    return clampScore(
      (savingsSnapshot.totalSavings / baseSummary.income) * 100,
    );
  }, [baseSummary.income, savingsSnapshot.totalSavings]);

  const netWorthWithSavings = useMemo(
    () =>
      walletLiquidity +
      savingsSnapshot.totalSavings +
      baseSummary.investmentAssets -
      baseSummary.totalDebt,
    [
      walletLiquidity,
      savingsSnapshot.totalSavings,
      baseSummary.investmentAssets,
      baseSummary.totalDebt,
    ],
  );

  const summary = useMemo(
    () => ({
      ...baseSummary,
      liquidBalance: walletLiquidity,
      netWorth: netWorthWithSavings,
      saving: savingsSnapshot.totalSavings,
      savingRate: savingsRateFromSavings,
      goalScore: goalSnapshot.averageProgress,
    }),
    [
      baseSummary,
      walletLiquidity,
      netWorthWithSavings,
      savingsSnapshot.totalSavings,
      savingsRateFromSavings,
      goalSnapshot.averageProgress,
    ],
  );

  // ── Net-worth timeline ────────────────────────────────────────────────────
  // Net worth is reconstructed from the current real asset snapshot and actual
  // balance-changing movements after each month end. Internal transfers such as
  // wallet transfers and saving deposits/withdrawals are ignored because they
  // only move money between asset buckets.
  const selectedMonth = useMemo(() => {
    const monthFromRange = getMonthIndexFromDate(dateRange.startDate);
    const yearFromRange = getYearFromDate(dateRange.startDate);

    if (monthFromRange && yearFromRange === selectedYear) return monthFromRange;

    const now = new Date();
    return now.getFullYear() === selectedYear ? now.getMonth() + 1 : 12;
  }, [dateRange.startDate, selectedYear]);

  const selectedMonthLabel = useMemo(
    () => formatMonthLabel(selectedYear, selectedMonth),
    [selectedMonth, selectedYear],
  );

  const navigateDashboardMonth = useCallback(
    (offset: number) => {
      const targetDate = new Date(selectedYear, selectedMonth - 1 + offset, 1);
      const targetMonth = formatMonthValue(
        targetDate.getFullYear(),
        targetDate.getMonth() + 1,
      );

      router.push(`?month=${targetMonth}`);
    },
    [router, selectedMonth, selectedYear],
  );

  const firstNetWorthDataMonth = useMemo(() => {
    const transactionMonths = transactions
      .map((item) => getRecordDate(item as Record<string, unknown>))
      .filter((date): date is Date =>
        Boolean(date && date.getFullYear() === selectedYear),
      )
      .map((date) => date.getMonth() + 1);

    const savingMonths = savings
      .map((item) => getRecordDate({ date: item.createdAt }))
      .filter((date): date is Date =>
        Boolean(date && date.getFullYear() === selectedYear),
      )
      .map((date) => date.getMonth() + 1);

    const months = [...transactionMonths, ...savingMonths];
    return months.length ? Math.min(...months) : selectedMonth;
  }, [savings, selectedMonth, selectedYear, transactions]);

  const netWorthTrend = useMemo(() => {
    const now = new Date();
    const currentNetWorth = summary.netWorth;
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const latestRealMonth =
      selectedYear < currentYear
        ? 12
        : selectedYear === currentYear
          ? currentMonth
          : 0;
    const snapshotMonth =
      selectedYear === currentYear
        ? Math.min(selectedMonth, currentMonth)
        : selectedMonth;

    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const isFutureMonth = month > latestRealMonth;

      if (isFutureMonth) {
        return {
          label: `T${month}`,
          month,
          value: null,
          hasData: false,
          isSnapshotMonth: false,
        };
      }

      // If the system has no records before the first real transaction month,
      // keep those months at 0 instead of back-filling the current wallet balance.
      if (month < firstNetWorthDataMonth) {
        return {
          label: `T${month}`,
          month,
          value: null,
          hasData: false,
          isSnapshotMonth: false,
        };
      }

      const monthEnd = getEndOfMonth(selectedYear, month);
      const transactionImpactAfterMonth = transactions.reduce((sum, item) => {
        const transactionDate = getRecordDate(item as Record<string, unknown>);
        if (
          !transactionDate ||
          transactionDate.getFullYear() !== selectedYear ||
          transactionDate <= monthEnd
        ) {
          return sum;
        }
        return sum + getTransactionNetWorthImpact(item);
      }, 0);

      const savingImpactAfterMonth = savingTransactions.reduce((sum, item) => {
        const transactionDate = getRecordDate({ date: item.date });
        if (
          !transactionDate ||
          transactionDate.getFullYear() !== selectedYear ||
          transactionDate <= monthEnd
        ) {
          return sum;
        }
        return sum + getSavingTransactionNetWorthImpact(item);
      }, 0);

      const value =
        currentNetWorth - transactionImpactAfterMonth - savingImpactAfterMonth;
      const isSnapshotMonth = month === snapshotMonth;

      return {
        label: `T${month}`,
        month,
        value,
        hasData: true,
        isSnapshotMonth,
      };
    });
  }, [
    firstNetWorthDataMonth,
    savingTransactions,
    selectedMonth,
    selectedYear,
    summary.netWorth,
    transactions,
  ]);

  const netWorthChartStats = useMemo(() => {
    const points = netWorthTrend.filter(
      (point) =>
        typeof point.value === "number" && Number.isFinite(point.value),
    );
    const currentPoint =
      points.find((point) => point.isSnapshotMonth) ?? points.at(-1) ?? null;
    const previousPoint = currentPoint
      ? ([...points]
          .reverse()
          .find((point) => point.month < currentPoint.month) ?? null)
      : null;
    const currentValue = currentPoint
      ? Number(currentPoint.value)
      : summary.netWorth;
    const highestValue = points.length
      ? Math.max(...points.map((point) => Number(point.value)))
      : currentValue;
    const lowestValue = points.length
      ? Math.min(...points.map((point) => Number(point.value)))
      : currentValue;

    return {
      currentLabel: currentPoint
        ? `Hiện tại • ${currentPoint.label}`
        : "Snapshot hiện tại",
      currentValue,
      highestValue,
      lowestValue,
      changeFromPrevious: previousPoint
        ? currentValue - Number(previousPoint.value)
        : 0,
    };
  }, [netWorthTrend, summary.netWorth]);

  // ── Cash-flow trend (real monthly transaction data) ───────────────────────
  const selectedYearTransactions = useMemo(
    () =>
      filterTransactionsByDateRange(transactions, {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
      }),
    [transactions, selectedYear],
  );

  const cashFlowTrend = useMemo(
    () =>
      buildMonthlyCashFlowData(
        selectedYearTransactions,
        categories,
        12,
        selectedYear,
      ),
    [selectedYearTransactions, categories, selectedYear],
  );

  // ── Asset pie ─────────────────────────────────────────────────────────────
  const assetPieData = useMemo(() => {
    const items = snapshotWallets.map((w, i) => ({
      name: w.name,
      value: w.balance,
      color: ASSET_COLORS[i % ASSET_COLORS.length],
    }));
    if (savingsSnapshot.totalSavings > 0)
      items.push({
        name: "Tiết kiệm",
        value: savingsSnapshot.totalSavings,
        color: "#38bdf8",
      });
    if (summary.investmentAssets > 0)
      items.push({
        name: "Đầu tư",
        value: summary.investmentAssets,
        color: "#10b981",
      });
    return items;
  }, [snapshotWallets, savingsSnapshot.totalSavings, summary.investmentAssets]);

  // ── Spending ──────────────────────────────────────────────────────────────
  const spendingByCategory = useMemo(
    () => buildCategorySpendingData(filteredTransactions, categories),
    [filteredTransactions, categories],
  );
  const spendingPieData = useMemo(
    () =>
      spendingByCategory.map((item, i) => ({
        id: item.id,
        name: item.name,
        value: item.value, // VND amount drives slice size
        percent: item.percent,
        color: SPEND_COLORS[i % SPEND_COLORS.length],
      })),
    [spendingByCategory],
  );

  // ── 50/30/20 ─────────────────────────────────────────────────────────────
  const allocation5030 = useMemo(() => {
    const allocation = calculateRule503020({
      transactions: filteredTransactions,
      categories,
      income: summary.income,
    });

    return {
      needs: allocation.needsPercentOfIncome,
      wants: allocation.wantsPercentOfIncome,
      savings: allocation.savingsPercentOfIncome,
      needsAmount: allocation.needsAmount,
      wantsAmount: allocation.wantsAmount,
      savingsAmount: allocation.savingsAmount,
      unclassifiedAmount: allocation.unclassifiedAmount,
    };
  }, [filteredTransactions, categories, summary.income]);

  const monthlySavingAllocation = useMemo(() => {
    const values = Array.from({ length: 12 }, () => 0);

    savings.forEach((saving) => {
      const date = getRecordDate({
        createdAt: saving.createdAt,
        created_at: (saving as Record<string, unknown>).created_at,
      });

      if (!date || date.getFullYear() !== selectedYear) return;

      // Cash-flow chart shows money allocated into Savings in the month the
      // saving account was created. Use opening principal/initial amount, not
      // current balance after interest.
      values[date.getMonth()] += getSavingCashflowAmount(saving);
    });

    return values;
  }, [savings, selectedYear]);

  const monthlyInvestmentAllocation = useMemo(() => {
    const values = Array.from({ length: 12 }, () => 0);

    investments.forEach((investment) => {
      const record = investment as Record<string, unknown>;
      const date = getRecordDate({
        createdAt: record.createdAt,
        created_at: record.created_at,
        date: record.date,
        purchaseDate: record.purchaseDate,
        purchase_date: record.purchase_date,
        transactionDate: record.transactionDate,
        transaction_date: record.transaction_date,
      });

      if (!date || date.getFullYear() !== selectedYear) return;

      // Cash-flow chart shows money allocated into Investments in the month
      // the investment position was created. It uses invested capital, not
      // unrealized profit/loss or current market value unless that is the only
      // amount available.
      values[date.getMonth()] += getInvestmentCashflowAmount(investment);
    });

    return values;
  }, [investments, selectedYear]);

  const cashFlowData = useMemo(
    () =>
      cashFlowTrend.map((item, index) => {
        const tietKiem = monthlySavingAllocation[index] ?? 0;
        const dauTu = monthlyInvestmentAllocation[index] ?? 0;

        return {
          ...item,
          tietKiem,
          dauTu,
          dongTienRong: item.thu - item.chi,
        };
      }),
    [cashFlowTrend, monthlyInvestmentAllocation, monthlySavingAllocation],
  );

  const cashFlowMonthsWithData = useMemo(
    () =>
      cashFlowData.filter(
        (item) =>
          item.thu > 0 || item.chi > 0 || item.tietKiem !== 0 || item.dauTu > 0,
      ).length,
    [cashFlowData],
  );

  const cashFlowYearTotals = useMemo(
    () =>
      cashFlowData.reduce(
        (totals, item) => ({
          income: totals.income + item.thu,
          expense: totals.expense + item.chi,
          saving: totals.saving + Math.max(item.tietKiem, 0),
          investment: totals.investment + item.dauTu,
          net: totals.net + item.dongTienRong,
        }),
        { income: 0, expense: 0, saving: 0, investment: 0, net: 0 },
      ),
    [cashFlowData],
  );

  const averageMonthlyNetWorthGrowth = useMemo(() => {
    const points = netWorthTrend
      .filter(
        (point) =>
          typeof point.value === "number" && Number.isFinite(point.value),
      )
      .map((point) => ({ month: point.month, value: Number(point.value) }))
      .sort((a, b) => a.month - b.month);

    if (points.length < 2) return 0;

    const changes = points.slice(1).map((point, index) => {
      const previous = points[index];
      return point.value - previous.value;
    });

    return changes.reduce((sum, value) => sum + value, 0) / changes.length;
  }, [netWorthTrend]);

  const cashFlowSubtitle =
    cashFlowMonthsWithData <= 0
      ? `Chưa có dữ liệu trong năm ${selectedYear}`
      : `Dòng tiền 12 tháng trong năm ${selectedYear}`;

  const netCashFlow = summary.income - summary.expense;
  const yearlyNetCashFlow = cashFlowYearTotals.net;
  const yearlySavingRate =
    cashFlowYearTotals.income > 0
      ? Math.round(
          (Math.max(yearlyNetCashFlow, 0) / cashFlowYearTotals.income) * 100,
        )
      : 0;

  const filteredWalletTransfers = useMemo(() => {
    const start = new Date(`${dateRange.startDate}T00:00:00`).getTime();
    const end = new Date(`${dateRange.endDate}T23:59:59`).getTime();

    return walletTransfers.filter((transfer) => {
      const time = new Date(transfer.date).getTime();
      return Number.isFinite(time) && time >= start && time <= end;
    });
  }, [walletTransfers, dateRange.startDate, dateRange.endDate]);

  const transferAmount = useMemo(() => {
    const transactionTransfers = filteredTransactions
      .filter((transaction) => transaction.type === "transfer")
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

    const transferHistory = filteredWalletTransfers.reduce(
      (sum, transfer) => sum + transfer.amount,
      0,
    );

    return transactionTransfers + transferHistory;
  }, [filteredTransactions, filteredWalletTransfers]);

  const cashFlowFormulaRows = useMemo(
    () => [
      {
        label: "Thu nhập trong kỳ",
        value: summary.income,
        tone: "text-emerald-600",
      },
      {
        label: "Chi tiêu trong kỳ",
        value: -summary.expense,
        tone: "text-rose-500",
      },
      {
        label: "Chuyển ví",
        value: transferAmount,
        tone: "text-slate-500",
        note: "Lấy từ lịch sử chuyển ví, không tính vào dòng tiền",
      },
    ],
    [summary.income, summary.expense, transferAmount],
  );

  const netWorthForecast = useMemo(() => {
    const monthlyGrowth = Number.isFinite(averageMonthlyNetWorthGrowth)
      ? averageMonthlyNetWorthGrowth
      : 0;
    const project = (months: number) =>
      summary.netWorth + monthlyGrowth * months;

    return [
      { label: "3 tháng", value: project(3) },
      { label: "6 tháng", value: project(6) },
      { label: "12 tháng", value: project(12) },
    ];
  }, [averageMonthlyNetWorthGrowth, summary.netWorth]);

  const emergencyMonthsExact = useMemo(() => {
    if (summary.monthlyExpense <= 0) return 0;
    return savingsSnapshot.emergencyFund / summary.monthlyExpense;
  }, [savingsSnapshot.emergencyFund, summary.monthlyExpense]);

  // ── V11.1 Financial Structure ───────────────────────────────────────────
  const financialStructure = useMemo(
    () =>
      calculateFinancialStructureSummary({
        transactions: filteredTransactions,
        categories,
      }),
    [filteredTransactions, categories],
  );

  const financialStructureAdjusted = useMemo(() => {
    const income = financialStructure.income || summary.income;
    const savingAmount = savingsSnapshot.totalSavings;
    const planningSavingRate =
      income > 0 ? clampScore((savingAmount / income) * 100) : 0;

    return {
      ...financialStructure,
      income,
      savingAmount,
      planningSavingRate,
    };
  }, [financialStructure, summary.income, savingsSnapshot.totalSavings]);

  const financialStructureCards = useMemo(
    () => [
      {
        title: "Chi phí cố định",
        value: `${financialStructureAdjusted.fixedCostRatio}%`,
        amount: `${formatVND(financialStructureAdjusted.fixedCost)} / ${formatVND(financialStructureAdjusted.income)}`,
        note:
          financialStructureAdjusted.fixedCostRatio < 40
            ? "Tốt · dưới 40% thu nhập"
            : financialStructureAdjusted.fixedCostRatio <= 60
              ? "Cần theo dõi · 40–60% thu nhập"
              : "Rủi ro · trên 60% thu nhập",
        tone:
          financialStructureAdjusted.fixedCostRatio < 40
            ? "good"
            : financialStructureAdjusted.fixedCostRatio <= 60
              ? "warning"
              : "danger",
        bar: Math.min(financialStructureAdjusted.fixedCostRatio, 100),
      },
      {
        title: "Chi phí biến đổi",
        value: `${financialStructureAdjusted.variableCostRatio}%`,
        amount: `${formatVND(financialStructureAdjusted.variableCost)} / ${formatVND(financialStructureAdjusted.income)}`,
        note:
          financialStructureAdjusted.variableCostRatio <= 30
            ? "Gọn nhẹ · dễ kiểm soát"
            : financialStructureAdjusted.variableCostRatio <= 50
              ? "Trung bình · nên theo dõi"
              : "Cao · cần tối ưu",
        tone:
          financialStructureAdjusted.variableCostRatio <= 30
            ? "good"
            : financialStructureAdjusted.variableCostRatio <= 50
              ? "warning"
              : "danger",
        bar: Math.min(financialStructureAdjusted.variableCostRatio, 100),
      },
      {
        title: "Tỷ lệ tiết kiệm",
        value: `${financialStructureAdjusted.planningSavingRate}%`,
        amount: `${formatVND(financialStructureAdjusted.savingAmount)} / ${formatVND(financialStructureAdjusted.income)}`,
        note:
          financialStructureAdjusted.planningSavingRate >= 20
            ? "Xuất sắc · trên 20% thu nhập"
            : financialStructureAdjusted.planningSavingRate >= 10
              ? "Tốt · 10–20% thu nhập"
              : "Thấp · nên tăng dần",
        tone:
          financialStructureAdjusted.planningSavingRate >= 20
            ? "good"
            : financialStructureAdjusted.planningSavingRate >= 10
              ? "warning"
              : "danger",
        bar: Math.min(financialStructureAdjusted.planningSavingRate, 100),
      },
      {
        title: "Tỷ lệ đầu tư",
        value: `${financialStructureAdjusted.investmentRate}%`,
        amount: `${formatVND(financialStructureAdjusted.investmentAmount)} / ${formatVND(financialStructureAdjusted.income)}`,
        note:
          financialStructureAdjusted.investmentRate >= 15
            ? "Tích cực xây tài sản"
            : financialStructureAdjusted.investmentRate >= 5
              ? "Đang bắt đầu"
              : "Cần tăng đầu tư",
        tone:
          financialStructureAdjusted.investmentRate >= 15
            ? "good"
            : financialStructureAdjusted.investmentRate >= 5
              ? "warning"
              : "danger",
        bar: Math.min(financialStructureAdjusted.investmentRate, 100),
      },
    ],
    [financialStructureAdjusted],
  );

  const financialStability = useMemo(
    () =>
      calculateFinancialStabilitySummary({
        financialStructure: financialStructureAdjusted,
        emergencyMonths: emergencyMonthsExact,
      }),
    [financialStructureAdjusted, emergencyMonthsExact],
  );

  const financialIndependence = useMemo(
    () =>
      calculateFinancialIndependenceSummary({
        investments: snapshotInvestments,
        monthlyExpense: summary.monthlyExpense,
        monthlyInvestment: financialStructureAdjusted.investmentAmount,
      }),
    [
      snapshotInvestments,
      summary.monthlyExpense,
      financialStructureAdjusted.investmentAmount,
    ],
  );

  const aiCfoInsight = useMemo(
    () =>
      calculateAiCfoInsightSummary({
        financialStructure: financialStructureAdjusted,
        financialStability,
        financialIndependence,
        emergencyMonths: emergencyMonthsExact,
      }),
    [
      financialStructureAdjusted,
      financialStability,
      financialIndependence,
      emergencyMonthsExact,
    ],
  );

  // ── Investment rows ───────────────────────────────────────────────────────
  const investmentRows = useMemo(
    () =>
      snapshotInvestments.map((inv) => {
        const pl = inv.currentValue - inv.investedAmount;
        return {
          ...inv,
          pl,
          plPct:
            inv.investedAmount > 0
              ? Math.round((pl / inv.investedAmount) * 1000) / 10
              : 0,
        };
      }),
    [snapshotInvestments],
  );
  const investPieData = useMemo(
    () =>
      snapshotInvestments.map((inv, i) => ({
        name: inv.name,
        value: inv.currentValue,
        color:
          INV_TYPE_COLORS[inv.type] ?? ASSET_COLORS[i % ASSET_COLORS.length],
      })),
    [snapshotInvestments],
  );

  // ── Goal rows: use the same source-of-truth logic as GoalsPage ───────────
  const goalRows = useMemo(() => goalMeta, [goalMeta]);

  // ── Recent activity ───────────────────────────────────────────────────────
  const recentTxns = useMemo<RecentActivityItem[]>(() => {
    const financeTxns = filteredTransactions
      .filter((transaction) => !isInternalTransferTransaction(transaction))
      .map((transaction) => {
        const categoryName =
          categories.find((category) => category.id === transaction.categoryId)
            ?.name ?? "Khác";
        const walletName =
          wallets.find((wallet) => wallet.id === transaction.walletId)?.name ??
          "Ví";
        const kind: RecentActivityKind =
          transaction.type === "income" ? "income" : "expense";
        const displayDateTime = pickRecentDateTime(
          transaction.date,
          transaction as unknown as Record<string, unknown>,
        );

        return {
          id: `finance-${transaction.id}`,
          title: transaction.note?.trim() || categoryName,
          subtitle: `${categoryName} · ${walletName}`,
          amount: Math.abs(Number(transaction.amount ?? 0)),
          date: displayDateTime,
          dayLabel: getRecentDayLabel(displayDateTime),
          timeLabel: getRecentTimeLabel(displayDateTime),
          kind,
        };
      });

    const savingTxns = savingTransactions
      // Deposit/withdraw/settlement are internal money movement between cash and savings.
      // Keep only interest because it is a real financial gain and should appear in Recent Activity.
      .filter((transaction) => transaction.type === "interest")
      .map((transaction) => {
        const savingName =
          savings.find((saving) => saving.id === transaction.savingId)?.name ??
          "Tiết kiệm";
        const title =
          transaction.note?.trim() || getSavingActivityTitle(transaction.type);

        const displayDateTime = pickRecentDateTime(transaction.date, {
          transactionDate: transaction.date,
          createdAt: transaction.createdAt,
        });

        return {
          id: `saving-${transaction.id}`,
          title,
          subtitle: `${getSavingActivityTitle(transaction.type)} · ${savingName}`,
          amount: Math.abs(transaction.amount),
          date: displayDateTime,
          dayLabel: getRecentDayLabel(displayDateTime),
          timeLabel: getRecentTimeLabel(displayDateTime),
          kind: "income" as const,
        };
      });

    return [...financeTxns, ...savingTxns]
      .filter((transaction) => transaction.amount > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [filteredTransactions, categories, wallets, savingTransactions, savings]);

  const recentTxnGroups = useMemo(() => {
    return recentTxns.reduce<
      Array<{ dayLabel: string; items: RecentActivityItem[] }>
    >((groups, transaction) => {
      const lastGroup = groups[groups.length - 1];

      if (lastGroup?.dayLabel === transaction.dayLabel) {
        lastGroup.items.push(transaction);
        return groups;
      }

      groups.push({ dayLabel: transaction.dayLabel, items: [transaction] });
      return groups;
    }, []);
  }, [recentTxns]);

  // ── Financial health score v2 ─────────────────────────────────────────────
  const healthMetrics = useMemo(() => {
    const savingScore = Math.max(
      0,
      Math.min(Math.round(summary.savingRate * 2.5), 100),
    );
    const debtSafetyScore = Math.max(
      0,
      Math.min(100 - Math.round(summary.debtRatio), 100),
    );
    const goalScore = Math.max(0, Math.min(Math.round(summary.goalScore), 100));
    const emergencyScore = Math.max(
      0,
      Math.min(Math.round((emergencyMonthsExact / 6) * 100), 100),
    );

    const totalScore = Math.round(
      savingScore * 0.3 +
        debtSafetyScore * 0.3 +
        emergencyScore * 0.25 +
        goalScore * 0.15,
    );

    return {
      savingScore,
      debtSafetyScore,
      goalScore,
      emergencyScore,
      totalScore,
    };
  }, [
    summary.savingRate,
    summary.debtRatio,
    summary.goalScore,
    emergencyMonthsExact,
  ]);

  const healthScore = healthMetrics.totalScore;
  const financialGrade = getFinancialGrade(healthScore);
  const healthBreakdown = useMemo(
    () => [
      {
        label: "Tiết kiệm",
        score: healthMetrics.savingScore,
        weight: 30,
        points: Math.round(healthMetrics.savingScore * 0.3),
        note: `Tỷ lệ tiết kiệm hiện tại ${summary.savingRate}%`,
      },
      {
        label: "An toàn nợ",
        score: healthMetrics.debtSafetyScore,
        weight: 30,
        points: Math.round(healthMetrics.debtSafetyScore * 0.3),
        note:
          summary.debtRatio <= 0
            ? "Không có nợ, rủi ro thấp"
            : `Tỷ lệ nợ ${summary.debtRatio}%`,
      },
      {
        label: "Quỹ khẩn cấp",
        score: healthMetrics.emergencyScore,
        weight: 25,
        points: Math.round(healthMetrics.emergencyScore * 0.25),
        note: `${formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu`,
      },
      {
        label: "Mục tiêu",
        score: healthMetrics.goalScore,
        weight: 15,
        points: Math.round(healthMetrics.goalScore * 0.15),
        note: `${goalSnapshot.trackedCount} mục tiêu · tiến độ trung bình ${summary.goalScore}%`,
      },
    ],
    [
      healthMetrics,
      summary.savingRate,
      summary.debtRatio,
      summary.goalScore,
      emergencyMonthsExact,
      goalSnapshot.trackedCount,
    ],
  );

  const healthStrengths = useMemo(() => {
    const items: string[] = [];
    if (healthMetrics.debtSafetyScore >= 90)
      items.push("Không có nợ hoặc tỷ lệ nợ rất an toàn.");
    if (healthMetrics.savingScore >= 70)
      items.push(`Tỷ lệ tiết kiệm tốt (${summary.savingRate}%).`);
    if (healthMetrics.emergencyScore >= 50)
      items.push(
        `Quỹ khẩn cấp đạt ${formatOneDecimal(emergencyMonthsExact)} tháng.`,
      );
    if (healthMetrics.goalScore >= 50)
      items.push("Mục tiêu tài chính có tiến độ tốt.");
    return items.length > 0
      ? items
      : ["Bạn đã có dữ liệu tài chính để bắt đầu tối ưu."];
  }, [healthMetrics, summary.savingRate, emergencyMonthsExact]);

  const healthImprovements = useMemo(() => {
    const items: string[] = [];
    if (emergencyMonthsExact < 3)
      items.push(`Tăng quỹ khẩn cấp lên tối thiểu 3 tháng chi tiêu.`);
    if (healthMetrics.goalScore < 30 && goals.length > 0)
      items.push(
        `Đẩy nhanh tiến độ mục tiêu tài chính, hiện mới đạt ${summary.goalScore}%.`,
      );
    if (summary.savingRate < 20)
      items.push("Nâng tỷ lệ tiết kiệm lên ít nhất 20% thu nhập.");
    if (summary.debtRatio > 40)
      items.push("Giảm tỷ lệ nợ xuống dưới 40% tổng tài sản.");
    return items.length > 0
      ? items
      : ["Duy trì nhịp hiện tại và cân nhắc tăng đầu tư dài hạn."];
  }, [
    healthMetrics.goalScore,
    emergencyMonthsExact,
    goals.length,
    summary.goalScore,
    summary.savingRate,
    summary.debtRatio,
  ]);

  const riskScore = Math.max(0, 100 - healthScore);

  const riskLevel =
    riskScore <= 25
      ? "Thấp"
      : riskScore <= 50
        ? "Trung bình"
        : riskScore <= 75
          ? "Cao"
          : "Nguy hiểm";
  const riskColor =
    riskScore <= 25
      ? "text-emerald-600"
      : riskScore <= 50
        ? "text-amber-500"
        : riskScore <= 75
          ? "text-orange-500"
          : "text-rose-600";
  const riskBg =
    riskScore <= 25
      ? "from-emerald-500 to-teal-400"
      : riskScore <= 50
        ? "from-amber-400 to-orange-400"
        : riskScore <= 75
          ? "from-orange-500 to-rose-400"
          : "from-rose-500 to-rose-700";
  const healthLabel =
    healthScore >= 90
      ? "Xuất sắc"
      : healthScore >= 75
        ? "Tốt"
        : healthScore >= 60
          ? "Khá"
          : healthScore >= 40
            ? "Trung bình"
            : "Cần cải thiện";

  // ── AI actions ────────────────────────────────────────────────────────────
  const aiActions = useMemo(
    () =>
      generateDashboardActions({
        transactions: filteredTransactions,
        wallets: snapshotWallets,
        budgets: filteredBudgets,
        goals: snapshotGoals,
        debts: snapshotDebts,
        investments: snapshotInvestments,
        categories,
        summary,
      }),
    [
      filteredTransactions,
      snapshotWallets,
      filteredBudgets,
      snapshotGoals,
      snapshotDebts,
      snapshotInvestments,
      categories,
      summary,
    ],
  );
  const actionIcons: Record<DashboardActionIcon, React.ReactNode> = {
    alert: <AlertTriangle size={18} />,
    savings: <PiggyBank size={18} />,
    shield: <ShieldCheck size={18} />,
    debt: <CreditCard size={18} />,
    bank: <Landmark size={18} />,
    emergency: <Zap size={18} />,
    investment: <TrendingDown size={18} />,
    goal: <Target size={18} />,
    budget: <AlertTriangle size={18} />,
  };

  const v3AdvisorActions = useMemo(() => {
    const actions: {
      icon: React.ReactNode;
      title: string;
      body: string;
      tone: "danger" | "warning" | "good";
      ctaLabel?: string;
      ctaRoute?: string;
    }[] = [];

    const emergencyTarget = (summary.monthlyExpense || summary.expense) * 3;
    const emergencyGap = Math.max(
      emergencyTarget - savingsSnapshot.emergencyFund,
      0,
    );

    if (emergencyMonthsExact < 3) {
      actions.push({
        icon: <Zap size={18} />,
        title: "Ưu tiên tạo quỹ khẩn cấp",
        body: `Hiện tại bạn có khoảng ${formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu. Mục tiêu tối thiểu là 3 tháng, cần bổ sung khoảng ${formatVND(emergencyGap)}.`,
        tone: emergencyMonthsExact < 1 ? "danger" : "warning",
        ctaLabel: "Tạo mục tiêu",
        ctaRoute: "/goals",
      });
    }

    if (goals.length > 0 && healthMetrics.goalScore < 30) {
      actions.push({
        icon: <Target size={18} />,
        title: "Mục tiêu tài chính đang chậm",
        body: `${goals.length} mục tiêu hiện đạt trung bình ${summary.goalScore}%. Hãy chọn 1 mục tiêu ưu tiên và đặt khoản góp cố định hàng tháng.`,
        tone: "warning",
        ctaLabel: "Xem mục tiêu",
        ctaRoute: "/goals",
      });
    }

    if (summary.savingRate >= 30) {
      actions.push({
        icon: <PiggyBank size={18} />,
        title: "Tỷ lệ tiết kiệm rất tốt",
        body: `Bạn đang tiết kiệm ${summary.savingRate}% thu nhập, cao hơn mốc 20%. Có thể phân bổ phần dư vào quỹ khẩn cấp hoặc đầu tư dài hạn.`,
        tone: "good",
        ctaLabel: "Phân bổ mục tiêu",
        ctaRoute: "/goals",
      });
    }

    if (summary.debtRatio <= 0) {
      actions.push({
        icon: <ShieldCheck size={18} />,
        title: "Không có nợ",
        body: "Đây là điểm mạnh lớn của hồ sơ tài chính. Hãy tận dụng dòng tiền dương để tăng tài sản thanh khoản và mục tiêu dài hạn.",
        tone: "good",
        ctaLabel: "Xem báo cáo",
        ctaRoute: "/reports",
      });
    }

    return actions.slice(0, 4);
  }, [
    emergencyMonthsExact,
    goals.length,
    healthMetrics.goalScore,
    summary.monthlyExpense,
    summary.expense,
    savingsSnapshot.emergencyFund,
    summary.goalScore,
    summary.savingRate,
    summary.debtRatio,
  ]);

  // ── KPI bar ───────────────────────────────────────────────────────────────
  const kpiCards = [
    {
      title: "Dòng tiền ròng",
      value: formatVND(netCashFlow),
      valueClass: netCashFlow >= 0 ? "text-emerald-600" : "text-rose-500",
      note: `Thu ${formatVND(summary.income)} − Chi ${formatVND(summary.expense)}`,
      icon: TrendingUp,
      iconClass: "from-blue-600 to-sky-500",
      barClass: "from-blue-500 to-sky-400",
    },
    {
      title: "Tỷ lệ tiết kiệm",
      value: `${summary.savingRate}%`,
      valueClass:
        summary.savingRate >= 20 ? "text-emerald-600" : "text-rose-500",
      note: `${formatVND(savingsSnapshot.totalSavings)} / ${formatVND(summary.income)}`,
      icon: PiggyBank,
      iconClass: "from-emerald-500 to-teal-400",
      barClass: "from-emerald-500 to-teal-400",
    },
    {
      title: "Tỷ lệ nợ",
      value: `${summary.debtRatio}%`,
      valueClass: summary.debtRatio <= 40 ? "text-violet-600" : "text-rose-500",
      note: summary.debtRatio <= 40 ? "An toàn" : "Cần giảm",
      icon: Landmark,
      iconClass: "from-violet-500 to-indigo-500",
      barClass: "from-violet-500 to-indigo-400",
    },
    {
      title: "Đầu tư",
      value: `${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}%`,
      valueClass:
        summary.investmentReturn >= 0 ? "text-emerald-600" : "text-rose-500",
      note: `${investments.length} tài sản`,
      icon: Briefcase,
      iconClass: "from-emerald-500 to-teal-400",
      barClass: "from-emerald-500 to-teal-400",
    },
    {
      title: "Mục tiêu",
      value: `${summary.goalScore}%`,
      valueClass: "text-blue-600",
      note: `${goalSnapshot.trackedCount} mục tiêu đang theo dõi`,
      icon: Target,
      iconClass: "from-blue-500 to-cyan-400",
      barClass: "from-blue-500 to-sky-400",
    },
  ];

  return (
    <div className="space-y-5 overflow-x-hidden pb-24 md:space-y-6 md:pb-0">
      <div className="sticky top-0 z-30 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigateDashboardMonth(-1)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-xs active:scale-95"
            aria-label="Tháng trước"
          >
            <ChevronLeft size={19} />
          </button>
          <button
            type="button"
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-base font-black text-slate-900 shadow-xs"
            aria-label="Bộ lọc tháng hiện tại"
          >
            <Calendar size={17} className="shrink-0 text-blue-600" />
            <span className="truncate">{selectedMonthLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => navigateDashboardMonth(1)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-xs active:scale-95"
            aria-label="Tháng sau"
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>

      {/* ── 1. Executive Strip ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="bg-linear-to-br from-blue-50 via-white to-sky-50 p-5 sm:p-8">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Personal CFO Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Tài sản ròng
              </h1>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <p className="text-3xl font-black tracking-tight text-blue-600 sm:text-5xl">
                {formatVND(summary.netWorth)}
              </p>
              <span className="mb-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-600 ring-1 ring-emerald-100">
                Thanh khoản + Tiết kiệm + Đầu tư − Nợ
              </span>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <HeroMini
                icon={<Wallet size={16} />}
                label="Thanh khoản"
                value={formatVND(summary.liquidBalance)}
                valueClass="text-blue-600"
              />
              <HeroMini
                icon={<PiggyBank size={16} />}
                label="Tiết kiệm"
                value={formatVND(savingsSnapshot.totalSavings)}
                valueClass="text-cyan-600"
              />
              <HeroMini
                icon={<Briefcase size={16} />}
                label="Đầu tư"
                value={formatVND(summary.investmentAssets)}
                valueClass="text-emerald-600"
              />
              <HeroMini
                icon={<CreditCard size={16} />}
                label="Nợ phải trả"
                value={formatVND(summary.totalDebt)}
                valueClass="text-rose-500"
              />
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                    Net Worth Timeline
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Chỉ hiển thị snapshot thật hiện tại. Chưa có dữ liệu lịch sử
                    thì không tự tạo số liệu cho các tháng khác.
                  </p>
                </div>
              </div>

              <div className="h-56">
                <ResponsiveContainer width="100%" height={224} minWidth={0}>
                  <AreaChart
                    data={netWorthTrend}
                    margin={{ top: 28, right: 20, bottom: 10, left: 18 }}
                  >
                    <defs>
                      <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#2563eb"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor="#2563eb"
                          stopOpacity={0.04}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="4 4"
                      vertical
                      stroke="#e2e8f0"
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                      fontSize={12}
                      tickMargin={10}
                    />
                    <YAxis
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                      width={58}
                      fontSize={11}
                      tickFormatter={(value) => formatCompactVND(Number(value))}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "1rem",
                        border: "1px solid #dbeafe",
                        boxShadow: "0 10px 25px -12px rgb(37 99 235 / 0.35)",
                        padding: "10px 14px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ fontWeight: 800, color: "#1e293b" }}
                      itemStyle={{ color: "#1d4ed8", fontWeight: 800 }}
                      formatter={(v) => [
                        v == null ? "Không có dữ liệu" : formatVND(Number(v)),
                        "Tài sản ròng",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      connectNulls={false}
                      stroke="#2563eb"
                      strokeWidth={3}
                      fill="url(#nwGrad)"
                      dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
                      activeDot={{ r: 6, strokeWidth: 3 }}
                    >
                      <LabelList
                        dataKey="value"
                        position="top"
                        offset={10}
                        className="fill-slate-900 text-[11px] font-black"
                        formatter={(value: unknown) =>
                          typeof value === "number"
                            ? formatCompactVND(value)
                            : ""
                        }
                      />
                    </Area>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-400">Hiện tại</p>
                  <p className="mt-1 font-black text-slate-900">
                    {formatVND(netWorthChartStats.currentValue)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-400">Cao nhất</p>
                  <p className="mt-1 font-black text-emerald-600">
                    {formatVND(netWorthChartStats.highestValue)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-400">Thấp nhất</p>
                  <p className="mt-1 font-black text-blue-600">
                    {formatVND(netWorthChartStats.lowestValue)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-400">
                    So với snapshot trước
                  </p>
                  <p
                    className={`mt-1 font-black ${
                      netWorthChartStats.changeFromPrevious >= 0
                        ? "text-emerald-600"
                        : "text-rose-500"
                    }`}
                  >
                    {netWorthChartStats.changeFromPrevious >= 0 ? "+" : ""}
                    {formatVND(netWorthChartStats.changeFromPrevious)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-slate-200 bg-linear-to-br from-emerald-50 via-sky-50 to-blue-50 p-5 sm:p-8 xl:border-l xl:border-t-0">
            <div>
              <p className="text-sm font-bold text-slate-600">
                Sức khoẻ tài chính
              </p>
              <div className="mt-5 flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => setIsHealthDrawerOpen(true)}
                  className={`flex size-28 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${financialGrade.gradient} p-2 shadow-lg transition hover:scale-[1.03] focus:outline-none focus:ring-4 ${financialGrade.ring}`}
                  title="Xem giải thích điểm sức khỏe tài chính"
                >
                  <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                    <span
                      className={`text-3xl font-black ${financialGrade.color}`}
                    >
                      {healthScore}
                    </span>
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                </button>
                <div>
                  <div
                    className={`mb-2 inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${financialGrade.bg} ${financialGrade.border} ${financialGrade.color}`}
                  >
                    Grade {financialGrade.grade}
                  </div>
                  <p className={`text-xl font-black ${financialGrade.color}`}>
                    {financialGrade.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {healthLabel} · Rủi ro: {riskLevel}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsHealthDrawerOpen(true)}
                    className="mt-3 text-xs font-black text-blue-600 hover:text-blue-700"
                  >
                    Xem giải thích điểm →
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <ScoreLine label="Tiết kiệm" value={healthMetrics.savingScore} />
              <ScoreLine
                label="An toàn nợ"
                value={healthMetrics.debtSafetyScore}
              />
              <ScoreLine label="Mục tiêu" value={healthMetrics.goalScore} />
              <ScoreLine
                label="Quỹ khẩn cấp"
                value={healthMetrics.emergencyScore}
              />
            </div>
            <div className="mt-6 rounded-2xl bg-white/70 p-4 text-sm text-slate-600 backdrop-blur">
              <span className="font-bold text-slate-900">Quỹ khẩn cấp: </span>
              {formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu
              {emergencyMonthsExact < 3 ? (
                <span className="ml-2 font-bold text-rose-500">⚠ Thiếu</span>
              ) : (
                <span className="ml-2 font-bold text-emerald-600">
                  ✓ An toàn
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <FormulaCard
          title="Dòng tiền ròng theo kỳ báo cáo"
          formula="Dòng tiền ròng = Thu nhập − Chi tiêu"
          resultLabel="Dòng tiền ròng"
          resultValue={netCashFlow}
          rows={cashFlowFormulaRows}
        />
        <div className="rounded-3xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-600">
          <p className="font-black text-blue-700">Cách đọc số liệu</p>
          <p className="mt-2">
            <span className="font-bold text-slate-900">Tài sản ròng</span> là
            tổng số dư ví hiện tại, tiết kiệm, đầu tư trừ nợ. Date Timeline chỉ
            ảnh hưởng phần dòng tiền.
          </p>
          <p className="mt-2">
            <span className="font-bold text-slate-900">Dòng tiền ròng</span> là
            thu nhập trừ chi tiêu trong kỳ đang chọn. Giao dịch chuyển ví chỉ
            đổi nơi giữ tiền nên không tính là thu hoặc chi.
          </p>
        </div>
      </section>

      {/* ── 2. KPI Strip ───────────────────────────────────────────────── */}
      <section className="-mx-4 sm:mx-0">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scroll-smooth no-scrollbar md:hidden">
          {kpiCards.map((item) => (
            <div key={item.title} className="shrink-0 w-50 snap-start">
              <KpiCard {...item} />
            </div>
          ))}
        </div>
        <div className="hidden md:grid md:grid-cols-3 xl:grid-cols-5 gap-4">
          {kpiCards.map((item) => (
            <KpiCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      {/* ── 3. Financial Structure V11.1 ───────────────────────────────── */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Financial Structure
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Cấu trúc tài chính
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Phân tách dòng tiền theo chi phí cố định, biến đổi, tiết kiệm và
              đầu tư.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-bold text-slate-500">Dòng tiền ròng</p>
            <p
              className={`text-xl font-black ${
                financialStructure.cashFlow >= 0
                  ? "text-emerald-600"
                  : "text-rose-500"
              }`}
            >
              {financialStructure.cashFlow >= 0 ? "+" : ""}
              {formatVND(financialStructure.cashFlow)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {financialStructureCards.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-500">
                    {item.title}
                  </p>
                  <p
                    className={`mt-2 text-3xl font-black ${
                      item.tone === "good"
                        ? "text-emerald-600"
                        : item.tone === "warning"
                          ? "text-amber-500"
                          : "text-rose-500"
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                    item.tone === "good"
                      ? "bg-emerald-50 text-emerald-600"
                      : item.tone === "warning"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {item.tone === "good"
                    ? "Tốt"
                    : item.tone === "warning"
                      ? "Theo dõi"
                      : "Rủi ro"}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {item.amount}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full ${
                    item.tone === "good"
                      ? "bg-emerald-500"
                      : item.tone === "warning"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(4, Math.min(item.bar, 100))}%` }}
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-600">
                {item.note}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div
            className={`rounded-3xl border p-5 ${
              financialStability.tone === "good"
                ? "border-emerald-100 bg-emerald-50/70"
                : financialStability.tone === "warning"
                  ? "border-amber-100 bg-amber-50/70"
                  : "border-rose-100 bg-rose-50/70"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
              Financial Stability
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p
                  className={`text-5xl font-black ${
                    financialStability.tone === "good"
                      ? "text-emerald-600"
                      : financialStability.tone === "warning"
                        ? "text-amber-600"
                        : "text-rose-600"
                  }`}
                >
                  {financialStability.score}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-500">/ 100</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-slate-900">
                  {financialStability.label}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Dựa trên chi phí cố định, tiết kiệm, đầu tư, dòng tiền và quỹ
                  khẩn cấp.
                </p>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
              <div
                className={`h-full rounded-full ${
                  financialStability.tone === "good"
                    ? "bg-emerald-500"
                    : financialStability.tone === "warning"
                      ? "bg-amber-400"
                      : "bg-rose-500"
                }`}
                style={{ width: `${Math.max(6, financialStability.score)}%` }}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {financialStability.breakdown.map((item) => (
                <div key={item.key} className="rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item.detail}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-black ${
                        item.status === "good"
                          ? "bg-emerald-50 text-emerald-600"
                          : item.status === "warning"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      +{item.weightedScore}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full ${
                        item.status === "good"
                          ? "bg-emerald-500"
                          : item.status === "warning"
                            ? "bg-amber-400"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.max(4, item.score)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`mt-5 rounded-3xl border p-5 ${
            financialIndependence.tone === "good"
              ? "border-emerald-100 bg-emerald-50/70"
              : financialIndependence.tone === "warning"
                ? "border-amber-100 bg-amber-50/70"
                : "border-rose-100 bg-rose-50/70"
          }`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Financial Independence Tracker
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                Tự do tài chính
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Dựa trên quy tắc 4%: mục tiêu tài sản đầu tư ≈ 25 lần chi tiêu
                năm.
              </p>
              <p className="mt-3 text-sm font-bold text-slate-700">
                {financialIndependence.insight}
              </p>
            </div>

            <div className="rounded-3xl bg-white/80 p-5 text-right shadow-sm lg:min-w-65">
              <p
                className={`text-5xl font-black ${
                  financialIndependence.tone === "good"
                    ? "text-emerald-600"
                    : financialIndependence.tone === "warning"
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              >
                {financialIndependence.progressPercent}%
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {financialIndependence.label}
              </p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    financialIndependence.tone === "good"
                      ? "bg-emerald-500"
                      : financialIndependence.tone === "warning"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                  }`}
                  style={{
                    width: `${Math.max(4, financialIndependence.progressPercent)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniStat
              label="Tài sản đầu tư"
              value={formatVND(financialIndependence.investmentAssets)}
              color="text-blue-600"
            />
            <MiniStat
              label="Mục tiêu FI"
              value={formatVND(financialIndependence.targetAssets)}
              color="text-slate-900"
            />
            <MiniStat
              label="Còn thiếu"
              value={formatVND(financialIndependence.remainingAmount)}
              color="text-amber-600"
            />
            <MiniStat
              label="Thời gian ước tính"
              value={
                financialIndependence.yearsToFI === null
                  ? "Chưa đủ dữ liệu"
                  : financialIndependence.yearsToFI === 0
                    ? "Đã đạt"
                    : `${financialIndependence.yearsToFI} năm`
              }
              color="text-emerald-600"
            />
          </div>
        </div>

        <div
          className={`mt-5 rounded-3xl border p-5 ${
            aiCfoInsight.tone === "good"
              ? "border-emerald-100 bg-emerald-50/70"
              : aiCfoInsight.tone === "warning"
                ? "border-amber-100 bg-amber-50/70"
                : "border-rose-100 bg-rose-50/70"
          }`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                AI CFO Insight
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                {aiCfoInsight.headline}
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {aiCfoInsight.summary}
              </p>
              {aiCfoInsight.warning && (
                <div className="mt-4 rounded-2xl border border-rose-100 bg-white/70 p-3 text-sm font-bold text-rose-600">
                  ⚠ {aiCfoInsight.warning}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white/80 p-5 text-right shadow-sm lg:min-w-55">
              <p
                className={`text-5xl font-black ${
                  aiCfoInsight.tone === "good"
                    ? "text-emerald-600"
                    : aiCfoInsight.tone === "warning"
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              >
                {aiCfoInsight.score}
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {aiCfoInsight.label}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                CFO Score
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-900">
                Ưu tiên hành động
              </p>
              <div className="mt-3 space-y-3">
                {aiCfoInsight.priorityActions.map((action, index) => (
                  <div
                    key={`${action.title}-${index}`}
                    className="rounded-2xl bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                          Ưu tiên #{index + 1}
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {action.title}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-black ${
                          action.tone === "good"
                            ? "bg-emerald-50 text-emerald-600"
                            : action.tone === "warning"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {action.tone === "good"
                          ? "Tốt"
                          : action.tone === "warning"
                            ? "Theo dõi"
                            : "Cần xử lý"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      {action.body}
                    </p>
                    {action.ctaLabel && action.ctaRoute && (
                      <button
                        type="button"
                        onClick={() => router.push(action.ctaRoute!)}
                        className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700"
                      >
                        {action.ctaLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <Zap size={18} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">
                    FI Acceleration
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    Mô phỏng tăng tốc tự do tài chính
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-slate-700">
                {aiCfoInsight.accelerationInsight}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MiniStat
                  label="Stability"
                  value={`${financialStability.score}/100`}
                  color="text-emerald-600"
                />
                <MiniStat
                  label="FI Progress"
                  value={`${financialIndependence.progressPercent}%`}
                  color="text-blue-600"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Wealth Growth + Cash Flow ───────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Lịch sử tài sản ròng"
          subtitle={`Theo dõi từ tháng có dữ liệu thật trong năm ${selectedYear}`}
        >
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniStat
              label="Tổng tài sản"
              value={formatVND(summary.totalAssets)}
              color="text-blue-600"
            />
            <MiniStat
              label="Lợi nhuận ĐT"
              value={`${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}%`}
              color={
                summary.investmentReturn >= 0
                  ? "text-emerald-600"
                  : "text-rose-500"
              }
            />
            <MiniStat
              label="Tăng trưởng TB/tháng"
              value={`${averageMonthlyNetWorthGrowth >= 0 ? "+" : ""}${formatVND(averageMonthlyNetWorthGrowth)}`}
              color={
                averageMonthlyNetWorthGrowth >= 0
                  ? "text-emerald-600"
                  : "text-rose-500"
              }
            />
          </div>
          <div className="mt-5 h-55">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <AreaChart
                data={netWorthTrend}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="wealthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: 700, color: "#475569" }}
                  itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                  formatter={(v) => [
                    v == null ? "Không có dữ liệu" : formatVND(Number(v)),
                    "Tài sản ròng",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  connectNulls={false}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#wealthGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-blue-700">
                  Dự báo tài sản ròng
                </p>
                <p className="text-xs text-blue-600/80">
                  Ước tính theo tăng trưởng tài sản ròng trung bình các tháng có
                  dữ liệu
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${averageMonthlyNetWorthGrowth >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
              >
                {averageMonthlyNetWorthGrowth >= 0 ? "+" : ""}
                {formatVND(averageMonthlyNetWorthGrowth)}/tháng
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {netWorthForecast.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl bg-white p-3 ring-1 ring-blue-100"
                >
                  <p className="text-[11px] font-bold text-slate-500">
                    {item.label}
                  </p>
                  <p
                    className={`mt-1 text-sm font-black ${item.value >= summary.netWorth ? "text-emerald-600" : "text-rose-500"}`}
                  >
                    {formatVND(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
            <div className="relative mx-auto h-36 w-36">
              <PieChart width={144} height={144}>
                <Pie
                  data={assetPieData}
                  dataKey="value"
                  innerRadius={42}
                  outerRadius={64}
                  paddingAngle={3}
                >
                  {assetPieData.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: 700, color: "#475569" }}
                  itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                  formatter={(v, name) => [
                    formatVND(Number(v ?? 0)),
                    String(name),
                  ]}
                />
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-blue-600">
                  {Math.round(summary.totalAssets / 1_000_000)}M
                </span>
                <span className="text-[10px] text-slate-500">Tổng</span>
              </div>
            </div>
            <div className="space-y-3">
              {assetPieData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="flex-1 text-sm text-slate-600 truncate">
                    {item.name}
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {summary.totalAssets > 0
                      ? Math.round((item.value / summary.totalAssets) * 100)
                      : 0}
                    %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Dòng tiền & Chi tiêu" subtitle={cashFlowSubtitle}>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MiniStat
              label="Thu nhập"
              value={formatVND(cashFlowYearTotals.income)}
              color="text-emerald-600"
            />
            <MiniStat
              label="Chi tiêu thật"
              value={formatVND(cashFlowYearTotals.expense)}
              color="text-rose-500"
            />
            <MiniStat
              label="Dòng tiền ròng"
              value={`${yearlyNetCashFlow >= 0 ? "+" : ""}${formatVND(yearlyNetCashFlow)}`}
              color={
                yearlyNetCashFlow >= 0 ? "text-emerald-600" : "text-rose-500"
              }
            />
            <MiniStat
              label="Tỷ lệ tích lũy"
              value={`${yearlySavingRate}%`}
              color={
                yearlySavingRate >= 20 ? "text-emerald-600" : "text-rose-500"
              }
            />
          </div>
          <div className="mt-5 h-55">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <ComposedChart
                data={cashFlowData}
                barGap={2}
                barCategoryGap={10}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: 700, color: "#475569" }}
                  itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                  formatter={(v, name) => [
                    formatVND(Number(v ?? 0)),
                    String(name),
                  ]}
                />
                <Bar
                  dataKey="thu"
                  name="Thu nhập"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="chi"
                  name="Chi tiêu thật"
                  fill="#f43f5e"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="tietKiem"
                  name="Tiết kiệm"
                  fill="#2563eb"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="dauTu"
                  name="Đầu tư"
                  fill="#7c3aed"
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="dongTienRong"
                  name="Dòng tiền ròng"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              Thu nhập
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500" />
              Chi tiêu thật
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-600" />
              Tiết kiệm
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-violet-600" />
              Đầu tư
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" />
              Dòng tiền ròng
            </span>
          </div>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-700">
              Quy tắc 50/30/20
            </p>
            <AllocationRow
              label="Thiết yếu"
              actual={allocation5030.needs}
              target={50}
              amount={allocation5030.needsAmount}
              color="bg-blue-500"
            />
            <AllocationRow
              label="Muốn"
              actual={allocation5030.wants}
              target={30}
              amount={allocation5030.wantsAmount}
              color="bg-violet-500"
            />
            <AllocationRow
              label="Tiết kiệm"
              actual={allocation5030.savings}
              target={20}
              amount={allocation5030.savingsAmount}
              color="bg-emerald-500"
            />
            {allocation5030.unclassifiedAmount > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Có {formatVND(allocation5030.unclassifiedAmount)} chi tiêu chưa
                map rõ danh mục, tạm tính vào nhóm “Muốn”.
              </p>
            )}
          </div>
        </Panel>
      </section>

      {/* ── 4. Goals + Investments + Risk ──────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* Goals */}
        <Panel
          title="Mục tiêu tài chính"
          subtitle="Tiến độ và thời gian dự kiến"
        >
          <div className="mt-5 space-y-4">
            {goalRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Chưa có mục tiêu nào.
              </p>
            ) : (
              goalRows.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-slate-900 text-sm">
                      {g.name}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${g.percent >= 100 ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
                    >
                      {g.percent}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatVND(g.effectiveCurrentAmount)} /{" "}
                    {formatVND(g.targetAmount)}
                  </p>
                  <div className="mt-3 h-2.5 rounded-full bg-white">
                    <div
                      className="h-2.5 rounded-full bg-linear-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                      style={{ width: `${g.percent}%` }}
                    />
                  </div>
                  {g.percent < 100 && (
                    <p className="mt-2 text-xs text-slate-400">
                      {g.monthsLeft <= 0
                        ? "Cần đặt số tiền góp hàng tháng"
                        : `~${g.monthsLeft} tháng nữa · cần ${formatVND(g.suggestedMonthly)}/tháng`}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
          {/* Spending breakdown */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-4 text-sm font-black text-slate-700">
              Chi tiêu theo danh mục
            </p>
            {spendingByCategory.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                Chưa có chi tiêu nào.
              </p>
            ) : (
              <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                {/* Donut */}
                <div className="relative mx-auto h-45 w-45 shrink-0 md:mx-0">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={spendingPieData}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={3}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {spendingPieData.map((e) => (
                        <Cell key={e.id} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CategorySpendingTooltip />} />
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                    <span className="max-w-22.5 truncate text-xl font-black text-rose-500">
                      {formatCompactVND(summary.expense)}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium text-slate-400">
                      Tổng chi
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="min-w-0 space-y-2">
                  {spendingPieData.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className="grid min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"
                      style={{ gridTemplateColumns: "10px minmax(0,1fr) 44px" }}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ background: item.color }}
                      />
                      <span
                        className="min-w-0 truncate text-xs font-medium text-slate-600"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <span className="text-right text-xs font-bold text-slate-800 tabular-nums">
                        {item.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Investments */}
        <Panel
          title="Danh mục đầu tư"
          subtitle={`${investments.length} tài sản · ${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}% tổng lợi nhuận`}
        >
          {investments.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                <Briefcase size={22} />
              </div>
              <p className="mt-3 text-base font-black text-slate-800">
                Bắt đầu danh mục đầu tư
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Thêm cổ phiếu, vàng, crypto hoặc quỹ ETF để theo dõi lợi nhuận,
                tỷ trọng và rủi ro đầu tư.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-bold text-emerald-700">
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Cổ phiếu
                </span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Vàng
                </span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Crypto
                </span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Quỹ ETF
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/investments")}
                className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
              >
                Thêm tài sản đầu tư
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-5">
                <div className="relative shrink-0 h-36 w-36">
                  <PieChart width={144} height={144}>
                    <Pie
                      data={investPieData}
                      dataKey="value"
                      innerRadius={42}
                      outerRadius={64}
                      paddingAngle={3}
                    >
                      {investPieData.map((e) => (
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                        padding: "8px 12px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ fontWeight: 700, color: "#475569" }}
                      itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                      formatter={(v, name) => [
                        formatVND(Number(v ?? 0)),
                        String(name),
                      ]}
                    />
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span
                      className={`text-base font-black ${summary.investmentReturn >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                    >
                      {summary.investmentReturn >= 0 ? "+" : ""}
                      {summary.investmentReturn}%
                    </span>
                    <span className="text-[10px] text-slate-500">ROI</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-500">Hiệu suất</p>
                  <p
                    className={`text-xl font-black ${summary.investmentPL >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                  >
                    {summary.investmentPL >= 0 ? "+" : ""}
                    {formatVND(summary.investmentPL)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Vốn: {formatVND(summary.investedAmount)}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {investmentRows.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="shrink-0 rounded-xl px-2 py-0.5 text-[10px] font-black text-white"
                        style={{
                          background: INV_TYPE_COLORS[inv.type] ?? "#6366f1",
                        }}
                      >
                        {INV_TYPE_LABELS[inv.type] ?? inv.type}
                      </span>
                      <span className="flex-1 truncate text-sm font-bold text-slate-800">
                        {inv.name}
                      </span>
                      <span
                        className={`text-sm font-black ${inv.plPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                      >
                        {inv.plPct >= 0 ? "+" : ""}
                        {inv.plPct}%
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate-400">
                      <span>Hiện tại: {formatVND(inv.currentValue)}</span>
                      <span>Vốn: {formatVND(inv.investedAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* Risk Analysis */}
        <Panel
          title="Phân tích rủi ro"
          subtitle="Đánh giá 4 chiều: Nợ · Tiết kiệm · Quỹ khẩn cấp · Mục tiêu"
        >
          <div className="mt-5 flex items-center gap-5">
            <div
              className={`flex size-28 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${riskBg} p-2 shadow-lg`}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                <span className={`text-3xl font-black ${riskColor}`}>
                  {riskScore}
                </span>
                <span className="text-[10px] text-slate-500">rủi ro</span>
              </div>
            </div>
            <div>
              <p className={`text-xl font-black ${riskColor}`}>{riskLevel}</p>
              <p className="mt-1 text-sm text-slate-500">
                {riskScore <= 25
                  ? "Tài chính rất lành mạnh"
                  : riskScore <= 50
                    ? "Có thể cải thiện"
                    : riskScore <= 75
                      ? "Cần chú ý sớm"
                      : "Cần hành động ngay"}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <RiskDimension
              label="Rủi ro nợ"
              score={100 - healthMetrics.debtSafetyScore}
              description={`Tỷ lệ nợ: ${summary.debtRatio}%`}
            />
            <RiskDimension
              label="Rủi ro tiết kiệm"
              score={100 - healthMetrics.savingScore}
              description={`Tiết kiệm: ${summary.savingRate}%`}
            />
            <RiskDimension
              label="Rủi ro quỹ khẩn cấp"
              score={100 - healthMetrics.emergencyScore}
              description={`Dự phòng: ${summary.emergencyMonths} tháng`}
            />
            <RiskDimension
              label="Rủi ro mục tiêu"
              score={100 - healthMetrics.goalScore}
              description={`Tiến độ: ${summary.goalScore}%`}
            />
          </div>
          {debts.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="mb-3 text-sm font-black text-slate-700">
                Chi tiết khoản nợ
              </p>
              <div className="space-y-3">
                {debts.map((d) => {
                  const paidPct = Math.round(
                    ((d.totalAmount - d.remainingAmount) / d.totalAmount) * 100,
                  );
                  return (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-bold text-slate-800 truncate">
                          {d.name}
                        </span>
                        <span className="shrink-0 font-black text-rose-500">
                          {formatVND(d.remainingAmount)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white">
                        <div
                          className="h-2 rounded-full bg-linear-to-r from-emerald-500 to-teal-400"
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Đã trả {paidPct}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </section>

      {/* ── 5. AI Action Center + Recent Transactions ───────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">
                AI Action Center
              </h3>
              <p className="text-sm text-slate-500">
                Hành động ưu tiên từ phân tích dữ liệu của bạn
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {v3AdvisorActions.map((action, i) => (
              <ActionCard
                key={`v3-${action.title}-${i}`}
                rank={i + 1}
                icon={action.icon}
                title={action.title}
                body={action.body}
                tone={action.tone}
                ctaLabel={action.ctaLabel}
                ctaRoute={action.ctaRoute}
                onNavigate={router.push}
              />
            ))}
            {aiActions
              .slice(0, Math.max(0, 3 - v3AdvisorActions.length))
              .map((action, i) => (
                <ActionCard
                  key={`${action.title}-${i}`}
                  rank={v3AdvisorActions.length + i + 1}
                  icon={actionIcons[action.icon]}
                  title={action.title}
                  body={action.body}
                  tone={action.tone}
                  ctaLabel={action.ctaLabel}
                  ctaRoute={action.ctaRoute}
                  onNavigate={router.push}
                />
              ))}
            {v3AdvisorActions.length === 0 && aiActions.length === 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center">
                <p className="text-2xl">🎉</p>
                <p className="mt-2 font-black text-emerald-700">
                  Tình hình tài chính rất tốt!
                </p>
                <p className="mt-1 text-sm text-emerald-600">
                  Không có điểm cảnh báo nào.
                </p>
              </div>
            )}
          </div>
        </div>

        <Panel
          title="Giao dịch gần đây"
          subtitle="5 hoạt động mới nhất, đã ẩn chuyển nội bộ"
        >
          <div className="mt-4 space-y-4">
            {recentTxnGroups.map((group) => (
              <div key={group.dayLabel}>
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {group.dayLabel}
                </p>
                <div className="divide-y divide-slate-100">
                  {group.items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${getRecentIconClass(t.kind)}`}
                        >
                          {t.kind === "income" ? (
                            <ArrowUpRight size={16} />
                          ) : t.kind === "expense" ? (
                            <ArrowDownRight size={16} />
                          ) : t.kind === "saving" ? (
                            <PiggyBank size={16} />
                          ) : t.kind === "investment" ? (
                            <Briefcase size={16} />
                          ) : (
                            <Wallet size={16} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {t.title}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {t.subtitle}
                            {t.timeLabel ? ` · ${t.timeLabel}` : ""}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`ml-3 shrink-0 text-sm font-black ${getRecentAmountClass(t.kind)}`}
                      >
                        {getRecentAmountPrefix(t.kind)}
                        {formatVND(t.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {recentTxns.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <p className="text-sm font-bold text-slate-700">
                  Chưa có giao dịch trong kỳ này.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Thêm thu nhập hoặc chi tiêu để Dashboard cập nhật hoạt động
                  gần đây.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => router.push("/transactions")}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 transition hover:border-blue-200 hover:bg-blue-50"
            >
              Xem tất cả giao dịch →
            </button>
          </div>
        </Panel>
      </section>

      <FinancialHealthDrawer
        open={isHealthDrawerOpen}
        onClose={() => setIsHealthDrawerOpen(false)}
        score={healthScore}
        grade={financialGrade.grade}
        healthLabel={healthLabel}
        riskLevel={riskLevel}
        breakdown={healthBreakdown}
        strengths={healthStrengths}
        improvements={healthImprovements}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FinancialHealthDrawer({
  open,
  onClose,
  score,
  grade,
  healthLabel,
  riskLevel,
  breakdown,
  strengths,
  improvements,
}: {
  open: boolean;
  onClose: () => void;
  score: number;
  grade: string;
  healthLabel: string;
  riskLevel: string;
  breakdown: {
    label: string;
    score: number;
    weight: number;
    points: number;
    note: string;
  }[];
  strengths: string[];
  improvements: string[];
}) {
  if (!open) return null;

  const totalPoints = breakdown.reduce((sum, item) => sum + item.points, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">
              AI Explain Score
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Giải thích sức khỏe tài chính
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Cách hệ thống chấm điểm hồ sơ tài chính hiện tại của bạn.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl font-black text-slate-500 hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        <div className="mt-6 rounded-4xl border border-slate-200 bg-linear-to-br from-blue-50 via-white to-emerald-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Tổng điểm</p>
              <p className="mt-1 text-5xl font-black text-blue-600">
                {score}
                <span className="text-base text-slate-400">/100</span>
              </p>
            </div>
            <div className="rounded-2xl border border-white bg-white/80 px-5 py-4 text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400">Grade</p>
              <p className="text-3xl font-black text-slate-900">{grade}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {healthLabel} · Rủi ro {riskLevel}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {breakdown.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.note}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-blue-600">
                    +{item.points} điểm
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Trọng số {item.weight}%
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-white">
                <div
                  className="h-2.5 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"
                  style={{ width: `${clampScore(item.score)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                <span>Score {clampScore(item.score)}/100</span>
                <span>Đóng góp tối đa {item.weight} điểm</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="font-black text-emerald-700">Điểm mạnh</p>
            <ul className="mt-3 space-y-2 text-sm text-emerald-700">
              {strengths.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="font-black text-amber-700">Cần cải thiện</p>
            <ul className="mt-3 space-y-2 text-sm text-amber-700">
              {improvements.map((item) => (
                <li key={item}>⚠ {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          Tổng điểm hiện tại được tính từ các phần trên:{" "}
          <span className="font-black">{totalPoints}/100</span>. Khi quỹ khẩn
          cấp và mục tiêu tăng lên, điểm sức khỏe tài chính sẽ tự cải thiện.
        </div>
      </aside>
    </div>
  );
}

function formatCompactVND(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  if (Math.abs(rounded) >= 1_000_000) {
    return `${Math.round(rounded / 1_000_000)}M`;
  }
  if (Math.abs(rounded) >= 1_000) {
    return `${Math.round(rounded / 1_000)}K`;
  }
  return `${rounded}`;
}

function CategorySpendingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: CategorySpending & { color?: string };
    value?: number;
  }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full"
          style={{ background: item.color }}
        />
        <span className="max-w-45 truncate font-bold text-slate-700">
          {item.name}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="font-black text-slate-900">
          {formatVND(Number(item.value ?? 0))}
        </span>
        <span className="font-bold text-rose-500">{item.percent}%</span>
      </div>
    </div>
  );
}

type FormulaRow = {
  label: string;
  value: number;
  tone: string;
  note?: string;
};

function FormulaCard({
  title,
  formula,
  rows,
  resultLabel,
  resultValue,
}: {
  title: string;
  formula: string;
  rows: FormulaRow[];
  resultLabel: string;
  resultValue: number;
}) {
  return (
    <div className="mt-5 rounded-3xl border border-slate-200 bg-white/75 p-4 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
            Breakdown
          </p>
          <p className="mt-1 text-sm font-black text-slate-900">{title}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{formula}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            {resultLabel}
          </p>
          <p
            className={`text-sm font-black ${
              resultValue >= 0 ? "text-emerald-600" : "text-rose-500"
            }`}
          >
            {formatVND(resultValue)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-2xl bg-slate-50 px-3 py-2">
            <p className="truncate text-[11px] font-bold text-slate-500">
              {row.label}
            </p>
            <p className={`mt-1 text-sm font-black ${row.tone}`}>
              {row.value < 0 ? "−" : row.label === "Chuyển ví" ? "" : "+"}
              {formatVND(Math.abs(row.value))}
            </p>
            {row.note ? (
              <p className="mt-1 text-[10px] font-semibold text-slate-400">
                {row.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroMini({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium text-slate-500">
            {label}
          </p>
          <p className={`truncate text-sm font-black ${valueClass}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  note,
  icon: Icon,
  valueClass,
  iconClass,
  barClass,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
  valueClass: string;
  iconClass: string;
  barClass: string;
}) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${iconClass} text-white shadow-lg`}
        >
          <Icon size={20} />
        </div>
      </div>
      <p className={`mt-5 text-2xl font-black ${valueClass}`}>{value}</p>
      <div className="mt-4 flex h-8 items-end gap-1">
        {SPARK.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-lg bg-linear-to-t ${barClass}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-black text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-black ${color}`}>{value}</p>
    </div>
  );
}

function ScoreLine({ label, value }: { label: string; value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-bold text-slate-900">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/80">
        <div
          className="h-2 rounded-full bg-linear-to-r from-emerald-400 to-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function AllocationRow({
  label,
  actual,
  target,
  amount,
  color,
}: {
  label: string;
  actual: number;
  target: number;
  amount: number;
  color: string;
}) {
  const over = actual > target;
  const diff = actual - target;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between gap-3 text-xs">
        <span className="font-medium text-slate-600">
          {label}: {actual}% / {target}%
          <span className="ml-1 text-slate-400">({formatVND(amount)})</span>
        </span>
        <span
          className={`shrink-0 font-bold ${over ? "text-rose-500" : "text-emerald-600"}`}
        >
          {over ? `Vượt ${diff}%` : `Còn ${Math.max(target - actual, 0)}%`}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white">
        <div
          className="absolute left-0 top-0 h-full border-l border-slate-400/60"
          style={{ left: `${Math.min(target, 100)}%` }}
        />
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{
            width: `${Math.min(actual, 100)}%`,
            opacity: over ? 0.7 : 1,
          }}
        />
      </div>
    </div>
  );
}

function RiskDimension({
  label,
  score,
  description,
}: {
  label: string;
  score: number;
  description: string;
}) {
  const pct = Math.min(Math.max(Math.round(score), 0), 100);
  const barColor =
    pct <= 25
      ? "from-emerald-400 to-teal-400"
      : pct <= 50
        ? "from-amber-400 to-orange-400"
        : "from-rose-400 to-rose-600";
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="font-bold text-slate-700">{label}</span>
        <span className="text-slate-500">{description}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100">
        <div
          className={`h-2.5 rounded-full bg-linear-to-r ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ActionCard({
  rank,
  icon,
  title,
  body,
  tone,
  ctaLabel,
  ctaRoute,
  onNavigate,
}: {
  rank: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "danger" | "warning" | "good";
  ctaLabel?: string;
  ctaRoute?: string;
  onNavigate?: (href: string) => void;
}) {
  const styles = {
    danger: "border-rose-100 bg-rose-50 text-rose-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    good: "border-emerald-100 bg-emerald-50 text-emerald-700",
  };
  const rankStyles = {
    danger: "bg-rose-600",
    warning: "bg-amber-500",
    good: "bg-emerald-600",
  };
  return (
    <div className={`rounded-2xl border p-4 ${styles[tone]}`}>
      <div className="flex gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white ${rankStyles[tone]}`}
        >
          {rank}
        </span>
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0">
          <p className="font-black">{title}</p>
          <p className="mt-1 text-sm leading-6 opacity-80">{body}</p>
          {ctaLabel && ctaRoute && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(ctaRoute)}
              className="mt-3 inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
