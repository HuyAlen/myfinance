"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useDateFilter } from "@/src/components/layout/DateFilterProvider";

import {
  Area,
  AreaChart,
  Bar,
  Line,
  CartesianGrid,
  ComposedChart,
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
  getForexAccounts,
  getForexCashTransactions,
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

import type { DashboardActionIcon } from "@/src/services/finance/financeCalculations";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  ForexAccount,
  ForexCashTransaction,
  Transaction,
  Wallet as WalletType,
  SavingAccount,
} from "@/src/types/finance";

const DASHBOARD_RUNTIME_COMPONENTS = {
  Area,
  AreaChart,
  Bar,
  Line,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Briefcase,
  CreditCard,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
};

const invalidDashboardComponents = Object.entries(DASHBOARD_RUNTIME_COMPONENTS)
  .filter(([, component]) => component == null)
  .map(([name]) => name);

if (invalidDashboardComponents.length > 0) {
  throw new Error(
    `[DashboardPage] Undefined React components: ${invalidDashboardComponents.join(
      ", ",
    )}`,
  );
}

const ASSET_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#38bdf8", "#6366f1"];
const SPEND_COLORS = [
  "#fb7185",
  "#f97316",
  "#0ea5e9",
  "#6366f1",
  "#10b981",
  "#94a3b8",
];

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
  | "forex"
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
  if (kind === "forex") return "bg-cyan-50 text-cyan-600";
  return "bg-slate-100 text-slate-500";
}

function getRecentAmountClass(kind: RecentActivityKind) {
  if (kind === "income") return "text-emerald-600";
  if (kind === "expense") return "text-rose-500";
  if (kind === "saving") return "text-blue-600";
  if (kind === "investment") return "text-violet-600";
  if (kind === "forex") return "text-cyan-600";
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

function clampScore(value: number) {
  return Math.max(0, Math.min(Math.round(value), 100));
}

function buildConicGradient(items: Array<{ value: number; color: string }>) {
  const validItems = items.filter(
    (item) => Number.isFinite(item.value) && item.value > 0,
  );
  const total = validItems.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return "conic-gradient(#e2e8f0 0deg 360deg)";
  }

  let cursor = 0;
  const stops = validItems.map((item) => {
    const start = cursor;
    const sweep = (item.value / total) * 360;
    cursor += sweep;
    return `${item.color} ${start}deg ${cursor}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [forexAccounts, setForexAccounts] = useState<ForexAccount[]>([]);
  const [forexCashTransactions, setForexCashTransactions] = useState<
    ForexCashTransaction[]
  >([]);
  const [savings, setSavings] = useState<DashboardSavingAccount[]>([]);
  const [savingTransactions, setSavingTransactions] = useState<
    DashboardSavingTransaction[]
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
    try {
      const [
        w,
        inv,
        forexAcc,
        forexEquityRows,
        forexTxn,
        cat,
        txn,
        dbt,
        gls,
        bdg,
        savingRows,
        savingTxnRows,
      ] = await Promise.all([
        getWallets(),
        getInvestments(),
        getForexAccounts(),
        supabase
          ? supabase.from("forex_accounts").select("id,current_equity")
          : Promise.resolve({ data: [], error: null }),
        getForexCashTransactions(),
        getCategories(),
        getTransactions(),
        getDebts(),
        getGoals(),
        getBudgets(),
        supabase
          ? supabase
              .from("savings")
              .select("*")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          ? supabase
              .from("saving_transactions")
              .select(
                "id,saving_id,type,amount,transaction_date,created_at,note",
              )
              .order("transaction_date", { ascending: false })
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      setWallets(w ?? []);
      setInvestments(inv ?? []);

      const equityByAccountId = new Map<string, number | null>();
      if (!forexEquityRows.error) {
        (
          (forexEquityRows.data ?? []) as Array<{
            id: string;
            current_equity: number | string | null;
          }>
        ).forEach((row) => {
          const parsed =
            row.current_equity === null || row.current_equity === undefined
              ? null
              : Number(row.current_equity);

          equityByAccountId.set(
            row.id,
            parsed !== null && Number.isFinite(parsed) ? parsed : null,
          );
        });
      } else {
        console.error(
          "[DashboardPage] Failed to load Forex Equity",
          forexEquityRows.error,
        );
      }

      setForexAccounts(
        (forexAcc ?? []).map((account) => ({
          ...account,
          currentEquity: equityByAccountId.get(account.id) ?? null,
        })),
      );
      setForexCashTransactions(forexTxn ?? []);
      setCategories(cat ?? []);
      setTransactions(txn ?? []);
      setDebts(dbt ?? []);
      setGoals(gls ?? []);
      setBudgets(bdg ?? []);

      if (!savingRows.error) {
        setSavings(
          ((savingRows.data ?? []) as SavingRow[]).map(
            mapSavingRowToSavingAccount,
          ),
        );
      } else {
        console.error(
          "[DashboardPage] Failed to load savings",
          savingRows.error,
        );
        setSavings([]);
      }

      if (!savingTxnRows.error) {
        setSavingTransactions(
          ((savingTxnRows.data ?? []) as SavingTransactionRow[]).map(
            mapSavingTransactionRow,
          ),
        );
      } else {
        console.error(
          "[DashboardPage] Failed to load saving transactions",
          savingTxnRows.error,
        );
        setSavingTransactions([]);
      }
    } catch (error) {
      console.error("[DashboardPage] reloadData failed", error);

      setWallets([]);
      setInvestments([]);
      setForexAccounts([]);
      setForexCashTransactions([]);
      setCategories([]);
      setTransactions([]);
      setDebts([]);
      setGoals([]);
      setBudgets([]);
      setSavings([]);
      setSavingTransactions([]);
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
    [
      "wallets",
      "transactions",
      "investments",
      "forex_accounts",
      "forex_cash_transactions",
      "debts",
      "goals",
      "budgets",
    ],
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

  const forexSnapshot = useMemo(() => {
    const totalDeposited = forexCashTransactions
      .filter((transaction) => transaction.type === "deposit")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalWithdrawn = forexCashTransactions
      .filter((transaction) => transaction.type === "withdrawal")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const totalFees = forexCashTransactions.reduce(
      (sum, transaction) => sum + Math.max(0, transaction.fee ?? 0),
      0,
    );
    const netCapital = totalDeposited - totalWithdrawn - totalFees;
    const currentEquity = forexAccounts.reduce((sum, account) => {
      const record = account as unknown as Record<string, unknown>;
      const raw =
        record.currentEquity ?? record.current_equity ?? record.equity ?? null;
      const value = raw === null || raw === undefined ? null : Number(raw);
      return sum + (value !== null && Number.isFinite(value) ? value : 0);
    }, 0);
    const accountsWithEquity = forexAccounts.filter((account) => {
      const record = account as unknown as Record<string, unknown>;
      const raw =
        record.currentEquity ?? record.current_equity ?? record.equity ?? null;
      return raw !== null && raw !== undefined && Number.isFinite(Number(raw));
    }).length;
    const profitLoss =
      accountsWithEquity > 0 ? currentEquity - netCapital : null;
    const roi =
      profitLoss !== null && netCapital > 0
        ? Math.round((profitLoss / netCapital) * 1000) / 10
        : null;

    return {
      balance: netCapital,
      totalDeposited,
      totalWithdrawn,
      totalFees,
      accountCount: forexAccounts.length,
      currentEquity,
      accountsWithEquity,
      profitLoss,
      roi,
    };
  }, [forexAccounts, forexCashTransactions]);

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
      forexSnapshot.balance +
      baseSummary.investmentAssets -
      baseSummary.totalDebt,
    [
      walletLiquidity,
      savingsSnapshot.totalSavings,
      forexSnapshot.balance,
      baseSummary.investmentAssets,
      baseSummary.totalDebt,
    ],
  );

  const summary = useMemo(
    () => ({
      ...baseSummary,
      liquidBalance: walletLiquidity,
      forexCashBalance: forexSnapshot.balance,
      forexCashFees: forexSnapshot.totalFees,
      netWorth: netWorthWithSavings,
      saving: savingsSnapshot.totalSavings,
      savingRate: savingsRateFromSavings,
      goalScore: goalSnapshot.averageProgress,
    }),
    [
      baseSummary,
      walletLiquidity,
      forexSnapshot.balance,
      forexSnapshot.totalFees,
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
    if (forexSnapshot.balance > 0)
      items.push({
        name: "Forex Cash",
        value: forexSnapshot.balance,
        color: "#06b6d4",
      });
    if (summary.investmentAssets > 0)
      items.push({
        name: "Đầu tư",
        value: summary.investmentAssets,
        color: "#10b981",
      });
    return items;
  }, [
    snapshotWallets,
    savingsSnapshot.totalSavings,
    forexSnapshot.balance,
    summary.investmentAssets,
  ]);
  const assetDonutGradient = useMemo(
    () => buildConicGradient(assetPieData),
    [assetPieData],
  );

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
  const spendingDonutGradient = useMemo(
    () => buildConicGradient(spendingPieData),
    [spendingPieData],
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

  const transferAmount = useMemo(
    () =>
      filteredTransactions
        .filter((transaction) => transaction.type === "transfer")
        .reduce(
          (sum, transaction) => sum + Math.abs(Number(transaction.amount ?? 0)),
          0,
        ),
    [filteredTransactions],
  );

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

    const forexTxns = forexCashTransactions.map((transaction) => {
      const accountName =
        forexAccounts.find(
          (account) => account.id === transaction.forexAccountId,
        )?.name ?? "Forex";
      const walletName =
        wallets.find((wallet) => wallet.id === transaction.walletId)?.name ??
        "Ví";
      const displayDateTime = pickRecentDateTime(transaction.transactionDate, {
        transactionDate: transaction.transactionDate,
      });
      const isDeposit = transaction.type === "deposit";

      return {
        id: `forex-${transaction.id}`,
        title:
          transaction.notes?.trim() ||
          (isDeposit ? "Nạp tiền Forex" : "Rút tiền Forex"),
        subtitle: isDeposit
          ? `${walletName} → ${accountName}`
          : `${accountName} → ${walletName}`,
        amount: Math.abs(transaction.amount),
        date: displayDateTime,
        dayLabel: getRecentDayLabel(displayDateTime),
        timeLabel: getRecentTimeLabel(displayDateTime),
        kind: "forex" as const,
      };
    });

    return [...financeTxns, ...savingTxns, ...forexTxns]
      .filter((transaction) => transaction.amount > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [
    filteredTransactions,
    categories,
    wallets,
    savingTransactions,
    savings,
    forexAccounts,
    forexCashTransactions,
  ]);

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

  // ── Compact operating KPIs ───────────────────────────────────────────────
  const kpiCards = [
    {
      title: "Dòng tiền ròng",
      value: formatVND(netCashFlow),
      note: `Thu ${formatCompactVND(summary.income)} · Chi ${formatCompactVND(summary.expense)}`,
      tone: netCashFlow >= 0 ? "good" : "danger",
      icon: TrendingUp,
    },
    {
      title: "Tiết kiệm",
      value: `${summary.savingRate}%`,
      note: `${formatCompactVND(savingsSnapshot.totalSavings)} đã tích lũy`,
      tone: summary.savingRate >= 20 ? "good" : "warning",
      icon: PiggyBank,
    },
    {
      title: "Quỹ khẩn cấp",
      value: `${formatOneDecimal(emergencyMonthsExact)} tháng`,
      note:
        emergencyMonthsExact >= 3
          ? "Đạt mức tối thiểu"
          : "Mục tiêu tối thiểu 3 tháng",
      tone: emergencyMonthsExact >= 3 ? "good" : "danger",
      icon: ShieldCheck,
    },
    {
      title: "Forex",
      value:
        forexSnapshot.profitLoss === null
          ? "Chưa có Equity"
          : `${forexSnapshot.profitLoss >= 0 ? "+" : ""}${formatVND(forexSnapshot.profitLoss)}`,
      note:
        forexSnapshot.roi === null
          ? `${forexSnapshot.accountCount} tài khoản`
          : `ROI ${forexSnapshot.roi >= 0 ? "+" : ""}${forexSnapshot.roi}%`,
      tone:
        forexSnapshot.profitLoss === null
          ? "neutral"
          : forexSnapshot.profitLoss >= 0
            ? "good"
            : "danger",
      icon: Landmark,
    },
    {
      title: "Mục tiêu",
      value: `${summary.goalScore}%`,
      note: `${goalSnapshot.trackedCount} mục tiêu đang theo dõi`,
      tone: summary.goalScore >= 50 ? "good" : "warning",
      icon: Target,
    },
  ] as const;

  return (
    <div className="space-y-5 overflow-x-hidden pb-24 md:pb-8">
      {/* Executive overview */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid xl:grid-cols-[1.35fr_0.65fr]">
          <div className="bg-linear-to-br from-blue-50 via-white to-sky-50 p-5 sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                  Tổng quan tài chính
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Tài sản ròng
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Tổng tài sản đang sở hữu sau khi trừ toàn bộ nợ phải trả.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/reports")}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-blue-100 bg-white px-4 text-sm font-black text-blue-600 transition hover:bg-blue-50"
              >
                Xem báo cáo
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-end gap-3">
              <p className="text-3xl font-black tracking-tight text-blue-600 sm:text-5xl">
                {formatVND(summary.netWorth)}
              </p>
              <span className="mb-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                {netCashFlow >= 0 ? "Dòng tiền dương" : "Dòng tiền âm"} ·{" "}
                {formatVND(netCashFlow)}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
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
                icon={<Landmark size={16} />}
                label="Vốn Forex"
                value={formatVND(forexSnapshot.balance)}
                valueClass="text-violet-600"
              />
              <HeroMini
                icon={<Briefcase size={16} />}
                label="Đầu tư khác"
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

            <div className="mt-5 rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Biến động tài sản ròng
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Chỉ dùng dữ liệu thật đã ghi nhận trong năm {selectedYear}.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    So với kỳ trước
                  </p>
                  <p
                    className={`text-sm font-black ${
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

              <div className="mt-3 h-52">
                <ResponsiveContainer width="100%" height={208} minWidth={0}>
                  <AreaChart
                    data={netWorthTrend}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="dashboardNetWorth"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#2563eb"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#2563eb"
                          stopOpacity={0.02}
                        />
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
                      width={46}
                      fontSize={10}
                      tickFormatter={(value) => formatCompactVND(Number(value))}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "0.9rem",
                        border: "1px solid #dbeafe",
                        boxShadow: "0 8px 24px -12px rgb(37 99 235 / 0.4)",
                        fontSize: "12px",
                      }}
                      formatter={(value) => [
                        value == null
                          ? "Không có dữ liệu"
                          : formatVND(Number(value)),
                        "Tài sản ròng",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      connectNulls={false}
                      stroke="#2563eb"
                      strokeWidth={3}
                      fill="url(#dashboardNetWorth)"
                      dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-linear-to-br from-emerald-50 via-sky-50 to-blue-50 p-5 sm:p-7 xl:border-l xl:border-t-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Sức khỏe tài chính
                </p>
                <p
                  className={`mt-2 text-2xl font-black ${financialGrade.color}`}
                >
                  {financialGrade.label}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Grade {financialGrade.grade} · Rủi ro {riskLevel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsHealthDrawerOpen(true)}
                className={`flex size-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${financialGrade.gradient} p-1.5 shadow-lg`}
              >
                <span className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                  <span
                    className={`text-2xl font-black ${financialGrade.color}`}
                  >
                    {healthScore}
                  </span>
                  <span className="text-[10px] text-slate-400">/100</span>
                </span>
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <ScoreLine label="Tiết kiệm" value={healthMetrics.savingScore} />
              <ScoreLine
                label="An toàn nợ"
                value={healthMetrics.debtSafetyScore}
              />
              <ScoreLine
                label="Quỹ khẩn cấp"
                value={healthMetrics.emergencyScore}
              />
              <ScoreLine label="Mục tiêu" value={healthMetrics.goalScore} />
            </div>

            <div className="mt-6 rounded-2xl border border-white bg-white/75 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Việc cần ưu tiên
              </p>
              <p className="mt-2 text-sm font-black text-slate-900">
                {emergencyMonthsExact < 3
                  ? "Tăng quỹ khẩn cấp"
                  : summary.goalScore < 30
                    ? "Đẩy nhanh mục tiêu tài chính"
                    : "Duy trì nhịp tài chính hiện tại"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {emergencyMonthsExact < 3
                  ? `Hiện có ${formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu, nên đạt tối thiểu 3 tháng.`
                  : summary.goalScore < 30
                    ? `Tiến độ mục tiêu trung bình hiện là ${summary.goalScore}%.`
                    : "Dòng tiền và mức tiết kiệm đang đi đúng hướng."}
              </p>
              <button
                type="button"
                onClick={() => setIsHealthDrawerOpen(true)}
                className="mt-3 text-xs font-black text-blue-600"
              >
                Xem cách tính điểm →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Operating KPIs */}
      <section>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:px-0 xl:grid-cols-5">
          {kpiCards.map((item) => (
            <KpiCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      {/* Cash flow and structure */}
      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Dòng tiền trong kỳ"
          subtitle="Thu nhập, chi tiêu và phần tiền còn lại theo bộ lọc thời gian"
        >
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MiniStat
              label="Thu nhập"
              value={formatVND(summary.income)}
              color="text-emerald-600"
            />
            <MiniStat
              label="Chi tiêu"
              value={formatVND(summary.expense)}
              color="text-rose-500"
            />
            <MiniStat
              label="Còn lại"
              value={formatVND(netCashFlow)}
              color={netCashFlow >= 0 ? "text-blue-600" : "text-rose-500"}
            />
          </div>

          <div className="mt-5 h-60">
            <ResponsiveContainer width="100%" height={240} minWidth={0}>
              <ComposedChart
                data={cashFlowData}
                barGap={3}
                barCategoryGap={12}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
                  width={46}
                  fontSize={10}
                  tickFormatter={(value) => formatCompactVND(Number(value))}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.9rem",
                    border: "1px solid #e2e8f0",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => [
                    formatVND(Number(value ?? 0)),
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
                  name="Chi tiêu"
                  fill="#f43f5e"
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="dongTienRong"
                  name="Dòng tiền ròng"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-900">
              Quy tắc 50/30/20
            </p>
            <p className="mt-1 text-xs text-slate-500">
              So sánh chi tiêu thực tế với cơ cấu tài chính cân bằng.
            </p>
            <div className="mt-4">
              <AllocationRow
                label="Thiết yếu"
                actual={allocation5030.needs}
                target={50}
                amount={allocation5030.needsAmount}
                color="bg-blue-500"
              />
              <AllocationRow
                label="Mong muốn"
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
            </div>
          </div>
        </Panel>

        <Panel
          title="Cấu trúc tài chính"
          subtitle="4 chỉ số cốt lõi giúp kiểm soát chất lượng dòng tiền"
        >
          <div className="mt-4 space-y-3">
            {financialStructureCards.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{item.amount}</p>
                  </div>
                  <p
                    className={`text-xl font-black ${
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
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full ${
                      item.tone === "good"
                        ? "bg-emerald-500"
                        : item.tone === "warning"
                          ? "bg-amber-400"
                          : "bg-rose-500"
                    }`}
                    style={{
                      width: `${Math.max(4, Math.min(item.bar, 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {/* Forex + goals + recent activity */}
      <section className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Tài khoản Forex"
          subtitle="Vốn đã nạp, Equity hiện tại và hiệu suất giao dịch"
        >
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat
              label="Vốn ròng"
              value={formatVND(forexSnapshot.balance)}
              color="text-violet-600"
            />
            <MiniStat
              label="Equity hiện tại"
              value={
                forexSnapshot.accountsWithEquity > 0
                  ? formatVND(forexSnapshot.currentEquity)
                  : "Chưa có dữ liệu"
              }
              color="text-blue-600"
            />
            <MiniStat
              label="Lời / lỗ"
              value={
                forexSnapshot.profitLoss === null
                  ? "Chưa đủ dữ liệu"
                  : `${forexSnapshot.profitLoss >= 0 ? "+" : ""}${formatVND(forexSnapshot.profitLoss)}`
              }
              color={
                forexSnapshot.profitLoss === null
                  ? "text-slate-500"
                  : forexSnapshot.profitLoss >= 0
                    ? "text-emerald-600"
                    : "text-rose-500"
              }
            />
            <MiniStat
              label="ROI"
              value={
                forexSnapshot.roi === null
                  ? "—"
                  : `${forexSnapshot.roi >= 0 ? "+" : ""}${forexSnapshot.roi}%`
              }
              color={
                forexSnapshot.roi === null
                  ? "text-slate-500"
                  : forexSnapshot.roi >= 0
                    ? "text-emerald-600"
                    : "text-rose-500"
              }
            />
          </div>
          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs leading-5 text-violet-700">
            <span className="font-black">Cách tính:</span> Lời/lỗ = Equity hiện
            tại − Vốn ròng. Phí giao dịch đã được trừ khỏi vốn ròng.
          </div>
          <button
            type="button"
            onClick={() => router.push("/investments")}
            className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-700"
          >
            Quản lý tài khoản Forex
          </button>
        </Panel>

        <Panel
          title="Mục tiêu tài chính"
          subtitle={`${goalSnapshot.trackedCount} mục tiêu · tiến độ trung bình ${summary.goalScore}%`}
        >
          <div className="mt-4 space-y-3">
            {goalRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <p className="text-sm font-black text-slate-700">
                  Chưa có mục tiêu
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Tạo mục tiêu để theo dõi tiến độ và số tiền cần góp mỗi tháng.
                </p>
              </div>
            ) : (
              goalRows.slice(0, 3).map((goal) => (
                <div
                  key={goal.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-slate-900">
                      {goal.name}
                    </p>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-600">
                      {goal.percent}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatVND(goal.effectiveCurrentAmount)} /{" "}
                    {formatVND(goal.targetAmount)}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-blue-500 to-cyan-400"
                      style={{ width: `${goal.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push("/goals")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 transition hover:bg-blue-50"
          >
            Xem tất cả mục tiêu
          </button>
        </Panel>

        <Panel
          title="Giao dịch gần đây"
          subtitle="5 hoạt động mới nhất, đã loại chuyển nội bộ"
        >
          <div className="mt-4 space-y-3">
            {recentTxnGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <p className="text-sm font-black text-slate-700">
                  Chưa có giao dịch trong kỳ
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Thêm thu nhập hoặc chi tiêu để Dashboard cập nhật.
                </p>
              </div>
            ) : (
              recentTxnGroups.map((group) => (
                <div key={group.dayLabel}>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    {group.dayLabel}
                  </p>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${getRecentIconClass(transaction.kind)}`}
                          >
                            {transaction.kind === "income" ? (
                              <ArrowUpRight size={16} />
                            ) : transaction.kind === "expense" ? (
                              <ArrowDownRight size={16} />
                            ) : (
                              <Wallet size={16} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {transaction.title}
                            </p>
                            <p className="truncate text-xs text-slate-400">
                              {transaction.subtitle}
                              {transaction.timeLabel
                                ? ` · ${transaction.timeLabel}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-black ${getRecentAmountClass(transaction.kind)}`}
                        >
                          {getRecentAmountPrefix(transaction.kind)}
                          {formatVND(transaction.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push("/transactions")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-600 transition hover:bg-blue-50"
          >
            Xem tất cả giao dịch
          </button>
        </Panel>
      </section>

      {/* Action center */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Ưu tiên tài chính
              </h2>
              <p className="text-sm text-slate-500">
                Các hành động nên làm tiếp theo dựa trên dữ liệu hiện tại.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
            Tối đa 3 việc quan trọng
          </span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {v3AdvisorActions.slice(0, 3).map((action, index) => (
            <ActionCard
              key={`${action.title}-${index}`}
              rank={index + 1}
              icon={action.icon}
              title={action.title}
              body={action.body}
              tone={action.tone}
              ctaLabel={action.ctaLabel}
              ctaRoute={action.ctaRoute}
              onNavigate={router.push}
            />
          ))}
          {v3AdvisorActions.length === 0 &&
            aiActions
              .slice(0, 3)
              .map((action, index) => (
                <ActionCard
                  key={`${action.title}-${index}`}
                  rank={index + 1}
                  icon={actionIcons[action.icon]}
                  title={action.title}
                  body={action.body}
                  tone={action.tone}
                  ctaLabel={action.ctaLabel}
                  ctaRoute={action.ctaRoute}
                  onNavigate={router.push}
                />
              ))}
        </div>
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
  tone,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
  tone: "good" | "warning" | "danger" | "neutral";
}) {
  const toneStyles = {
    good: {
      value: "text-emerald-600",
      icon: "bg-emerald-50 text-emerald-600",
      border: "border-emerald-100",
    },
    warning: {
      value: "text-amber-600",
      icon: "bg-amber-50 text-amber-600",
      border: "border-amber-100",
    },
    danger: {
      value: "text-rose-500",
      icon: "bg-rose-50 text-rose-500",
      border: "border-rose-100",
    },
    neutral: {
      value: "text-slate-700",
      icon: "bg-slate-100 text-slate-500",
      border: "border-slate-200",
    },
  } as const;
  const styles = toneStyles[tone];

  return (
    <div
      className={`min-w-52 rounded-2xl border bg-white p-4 shadow-sm md:min-w-0 ${styles.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">{title}</p>
          <p className={`mt-2 truncate text-xl font-black ${styles.value}`}>
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">{note}</p>
        </div>
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
        >
          <Icon size={18} />
        </div>
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
