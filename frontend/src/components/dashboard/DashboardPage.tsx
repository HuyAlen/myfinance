"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useDateFilter } from "@/src/components/layout/DateFilterProvider";
import { formatCompactVND } from "./dashboardFormat";
import { markInstant, measureAndReport } from "@/src/lib/performance/performanceMarks";
import { reportPerformanceMetric } from "@/src/lib/performance/performanceReporter";
import {
  dashboardPerfNow,
  emitDashboardMilestone,
  logDashboardOperationStart,
  measureDashboardQuery,
  nextDashboardOperationId,
  supabaseResultStatus,
  type DashboardOperationContext,
  type DashboardOperationTrigger,
} from "@/src/lib/performance/dashboardPerfDebug";
import {
  beginPeriodGeneration,
  isBudgetAttentionReady,
  isMonthlyProgressReady,
  isNewPeriodContext,
  isStalePeriodGeneration,
  shouldMarkReady,
} from "@/src/lib/dashboard/dashboardReadiness";
import { buildDashboardBudgetAttention } from "@/src/lib/dashboard/dashboardBudgetAttention";
import {
  buildCanonicalNetWorthTrend,
  summarizeCanonicalNetWorthHistory,
} from "@/src/lib/dashboard/netWorthHistory";
import {
  buildBudgetsHref,
  buildGoalsHref,
  buildSavingsHref,
  buildTransactionsHref,
} from "@/src/lib/navigation/financeNavigation";

import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CreditCard,
  Info,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  ReceiptText,
} from "lucide-react";

import {
  getBudgets,
  getCategories,
  getDebts,
  getGoals,
  getInvestments,
  getNetWorthSnapshotsInRange,
  getForexAccounts,
  getForexCashTransactions,
  getTransactionsInRange,
  getWallets,
} from "@/src/services/finance/financeStorage";

import {
  buildMonthlyCashFlowData,
  calculateDashboardSummary,
  calculateFinancialStructureSummary,
  calculateRule503020,
  filterTransactionsByDateRange,
  formatVND,
  getForexAssetValue,
  getForexNetCapital,
  getGoalEffectiveCurrentAmount,
  getGoalLinkedSavingAmount,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  NetWorthSnapshot,
  ForexAccount,
  ForexCashTransaction,
  Transaction,
  Wallet as WalletType,
  SavingAccount,
} from "@/src/types/finance";

const LOCAL_UI_MODE =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LOCAL_UI_MODE === "true";

// Net Worth / Cash Flow charts are below-the-fold, so recharts is code-split
// into its own chunk instead of shipping with the initial Dashboard bundle.
const NetWorthTrendChart = dynamic(() => import("./NetWorthTrendChart"), {
  ssr: false,
  loading: () => (
    <div className="mt-3 h-44 animate-pulse rounded-2xl bg-slate-100" />
  ),
});
const CashFlowChart = dynamic(() => import("./CashFlowChart"), {
  ssr: false,
  loading: () => (
    <div className="mt-5 h-52 animate-pulse rounded-2xl bg-slate-100" />
  ),
});

const DASHBOARD_RUNTIME_COMPONENTS = {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CreditCard,
  Info,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  ReceiptText,
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

type DashboardSupabaseResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type ForexEquityRow = {
  id: string;
  current_equity: number | string | null;
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
  return "bg-slate-100 text-slate-600";
}

function getRecentAmountClass(kind: RecentActivityKind) {
  if (kind === "income") return "text-emerald-600";
  if (kind === "expense") return "text-rose-500";
  if (kind === "saving") return "text-blue-600";
  if (kind === "investment") return "text-violet-600";
  if (kind === "forex") return "text-cyan-600";
  return "text-slate-600";
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

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isDateWithinRange(
  value: string | Date | null | undefined,
  startDate: string,
  endDate: string,
) {
  if (!value) return false;

  const dateKey = toLocalDateKey(value);
  if (!dateKey) return false;

  return dateKey >= startDate.slice(0, 10) && dateKey <= endDate.slice(0, 10);
}

function getNetSavingAllocation(
  transactions: DashboardSavingTransaction[],
  startDate: string,
  endDate: string,
) {
  return transactions.reduce((sum, transaction) => {
    if (!isDateWithinRange(transaction.date, startDate, endDate)) return sum;

    if (transaction.type === "deposit") return sum + transaction.amount;
    if (transaction.type === "withdraw" || transaction.type === "settlement") {
      return sum - transaction.amount;
    }

    return sum;
  }, 0);
}

function getNetInvestmentAllocation(
  transactions: ForexCashTransaction[],
  startDate: string,
  endDate: string,
) {
  return transactions.reduce((sum, transaction) => {
    if (!isDateWithinRange(transaction.transactionDate, startDate, endDate)) {
      return sum;
    }

    const fee = Math.max(0, transaction.fee ?? 0);

    if (transaction.type === "deposit") {
      return sum + Math.max(0, transaction.amount + fee);
    }

    return sum - Math.max(0, transaction.amount - fee);
  }, 0);
}

/**
 * Every Dashboard figure that reads from raw transactions only ever needs
 * two windows: the selected year (monthly pulse, net worth trend, cash flow
 * trend all walk month-by-month through `selectedYear`) and the real
 * current year (the "today" snapshot always reflects the actual current
 * date, regardless of which month/year is selected). This covers both in
 * one contiguous range instead of fetching the user's entire history.
 */
function getDashboardFetchRange(selectedYear: number) {
  const currentYear = new Date().getFullYear();
  const minYear = Math.min(selectedYear, currentYear);
  const maxYear = Math.max(selectedYear, currentYear);
  return {
    startDate: `${minYear}-01-01`,
    endDate: `${maxYear}-12-31`,
  };
}

/**
 * A single logical write (e.g. a Forex deposit) can touch several tables in
 * one Postgres transaction (wallets + forex_cash_transactions, possibly
 * forex_accounts). Supabase Realtime delivers one postgres_changes event per
 * table, independently, so that one user action can fire this many separate
 * realtime callbacks in quick succession. This window only coalesces events
 * that land close together from the same underlying write — it is not a
 * general-purpose delay, and it never applies to the initial/month-driven
 * load (see runReload vs requestDashboardRefresh below).
 */
const REALTIME_REFRESH_DEBOUNCE_MS = 100;

export default function DashboardPage() {
  const router = useRouter();
  const mountedAtRef = useRef<number | null>(null);
  const hasReportedCriticalReadyRef = useRef(false);
  useEffect(() => {
    mountedAtRef.current = performance.now();
  }, []);
  // PERF-4B: warm the recharts chunk concurrently with the finance queries
  // below, instead of only starting the JS fetch once a chart's own
  // readiness gate first renders it. `dynamic()`'s own internal `import()`
  // call (fired the first time <NetWorthTrendChart>/<CashFlowChart> is
  // actually rendered) resolves against the SAME module-cache entry this
  // starts — ES module dynamic imports for an identical specifier are
  // cached, not re-fetched, so this cannot create a second chart instance
  // or double-request the chunk. Fire-and-forget: no state is set, no
  // finance/network data call is made, and nothing here is awaited before
  // the query-firing effect further down runs — the two proceed in
  // parallel, not as a waterfall.
  useEffect(() => {
    void import("./NetWorthTrendChart");
    void import("./CashFlowChart");
  }, []);
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
  const [netWorthSnapshots, setNetWorthSnapshots] = useState<
    NetWorthSnapshot[]
  >([]);
  // Each readiness flag below covers exactly the dependencies its own
  // consumer(s) mathematically need — audited field-by-field, not assumed
  // from which fetch group a value happens to be spread from:
  //
  //   cashFlowReady        transactions + categories
  //                        → periodFlowSummary (income/expense), "Dòng tiền ròng"
  //   goalsReady           goals + transactions + savings
  //                        → goalMeta/goalSnapshot, "Mục tiêu"
  //   emergencyFundReady   savings + transactions + categories
  //                        → savingsSnapshot.emergencyFund / summary.monthlyExpense
  //                          (monthlyExpense is baseSummary's own field, but it is
  //                          mathematically getMonthlyExpenseEstimate(transactions,
  //                          categories) — it does NOT depend on wallets/
  //                          investments/debts/Forex, so gating this card on the
  //                          full asset bundle would be an over-broad, not just
  //                          over-narrow, dependency), "Quỹ khẩn cấp"
  //   savingInvestmentReady transactions + categories + savings + Forex ledger
  //                        + the SECONDARY saving_transactions ledger
  //                        → savingsRateFromSavings/periodFutureAllocation +
  //                          savingsSnapshot.totalSavings, "Tiết kiệm & Đầu tư".
  //                          This one genuinely depends on secondary data, so it
  //                          is allowed to become ready only once that resolves
  //                          too — never before, per the mandatory first-paint
  //                          invariant (no incomplete allocation%).
  //   forexReady           forex accounts + current_equity + Forex ledger
  //                        → forexSnapshot, "Forex" card
  //   isDashboardReady      wallets + investments + debts + savings + complete
  //                        Forex asset value — the canonical Net Worth asset/
  //                        liability bundle (`calculateDashboardSummary`'s
  //                        netWorth/totalAssets/totalDebt/liquidBalance/
  //                        debtRatio fields). Gates the Net Worth Hero values
  //                        and the `dashboard_critical_ready` metric. Does NOT
  //                        need transactions/categories/goals —
  //                        none of the fields it gates read them.
  const [isDashboardReady, setIsDashboardReady] = useState(false);
  const [cashFlowReady, setCashFlowReady] = useState(false);
  const [goalsReady, setGoalsReady] = useState(false);
  const [emergencyFundReady, setEmergencyFundReady] = useState(false);
  const [savingInvestmentReady, setSavingInvestmentReady] = useState(false);
  const [forexReady, setForexReady] = useState(false);
  const [netWorthHistoryReady, setNetWorthHistoryReady] = useState(false);
  // UI-DASH-2: has the budgets dataset itself (snapshot-like — global,
  // never refetched on a year switch) ever completed a successful load
  // this session? `budgets.length === 0` cannot answer this — it's also
  // true before the first fetch resolves. Consulted ONLY by
  // isBudgetAttentionReady below; never part of isHeroReady/
  // isDashboardReady/cashFlowReady — budgets stay secondary/non-blocking
  // per PERF-1.
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);

  // Tracks whether each readiness domain has EVER completed a successful
  // load. A rejected fetch on the very first load must NOT flip its ready
  // flag — that would let an initial empty/zero state render as if it were
  // a real, loaded value (see the PERF-2 correctness patch). Once a domain
  // has loaded successfully at least once, a later failure keeps showing
  // the last-known-good snapshot and readiness stays true, matching the
  // existing "never flash 0 on a transient refresh failure" policy.
  const hasLoadedCashFlowRef = useRef(false);
  const hasLoadedGoalsRef = useRef(false);
  const hasLoadedEmergencyFundRef = useRef(false);
  const hasLoadedSavingInvestmentRef = useRef(false);
  const hasLoadedForexRef = useRef(false);
  const hasLoadedBudgetsRef = useRef(false);
  const hasLoadedNetWorthRef = useRef(false);
  const hasLoadedNetWorthHistoryRef = useRef(false);

  // PERF-3: which year's transactions and Net Worth snapshots are currently
  // sitting in state, plus a monotonic id used to reject stale period reads.
  // Current-state datasets (wallets/investments/Forex/debts/goals/savings/
  // budgets) remain year-independent and are not refetched on a year switch.
  const loadedPeriodYearRef = useRef<number | null>(null);
  const loadedNetWorthHistoryYearRef = useRef<number | null>(null);
  const periodRequestIdRef = useRef(0);
  const { dateRange, selectedYear } = useDateFilter();

  // PERF-4 Hero Milestone Operation Semantics patch: dashboard_hero_ready
  // is emitted operation-locally (inside reloadData/reloadPeriod, right
  // next to the other milestones — see below), not from a
  // useEffect([isDashboardReady, cashFlowReady]). The previous effect-based
  // version missed Realtime reloads whenever both flags were ALREADY true
  // (React bails out of re-rendering — and therefore never reruns the
  // effect — when a state setter is called with a value equal to the
  // current one), so a same-context Realtime operation that genuinely
  // re-validated Hero's dependencies could complete without ever emitting
  // the milestone for its own operation id.
  //
  // reloadPeriod never refetches CURRENT Net Worth (the live asset/liability
  // bundle is year-independent); it only refetches historical monthly
  // snapshots. It therefore needs to know whether current Net Worth is valid
  // without depending on which operation last set it.
  // Reading `isDashboardReady` directly inside reloadPeriod's closure
  // would be stale forever (reloadPeriod's identity never changes after
  // first render), so this ref mirrors the live value instead — the
  // mirroring effect below causes no additional render of its own; it
  // only records a value that already changed for other reasons.
  const isDashboardReadyRef = useRef(isDashboardReady);
  useEffect(() => {
    isDashboardReadyRef.current = isDashboardReady;
  }, [isDashboardReady]);

  // A genuine year switch means the `transactions` currently in state (and
  // thus the period-dependent readiness flags built on top of them) belong
  // to a different context than what the user now wants to see. The
  // "last-known-good snapshot" semantics of shouldMarkReady are correct for
  // a same-year retry failure, but MUST NOT apply across a year change —
  // otherwise a failed 2024 fetch would keep displaying 2023's numbers
  // labeled as if they were 2024's. Resetting these refs/flags forces the
  // next successful fetch to be the one that re-establishes readiness.
  const invalidatePeriodReadinessForNewContext = useCallback(() => {
    hasLoadedCashFlowRef.current = false;
    hasLoadedGoalsRef.current = false;
    hasLoadedEmergencyFundRef.current = false;
    hasLoadedSavingInvestmentRef.current = false;
    hasLoadedNetWorthHistoryRef.current = false;
    loadedNetWorthHistoryYearRef.current = null;
    setCashFlowReady(false);
    setGoalsReady(false);
    setEmergencyFundReady(false);
    setSavingInvestmentReady(false);
    setNetWorthHistoryReady(false);
  }, []);

  const filteredTransactions = useMemo(
    () => filterTransactionsByDateRange(transactions, dateRange),
    [transactions, dateRange],
  );

  // DASH-POLISH-1: the ONE accepted period transaction subset for the
  // selected range — the Dashboard-specific transfer-note heuristic
  // (`isInternalTransferTransaction`) runs here, once, since it also
  // catches mislabeled transfer notes that canonical type-based filtering
  // does not. Every consumer that needs "this period's real income-moving
  // transactions" (periodFlowSummary, Financial Structure) reads from
  // this SAME derived collection, so they can never disagree about which
  // transactions are internal transfers — previously
  // `calculateFinancialStructureSummary` was called with the raw
  // `filteredTransactions` instead, so a transaction this heuristic
  // caught could still inflate Financial Structure's income/expense (and
  // every ratio derived from them) while being correctly excluded from
  // the Cash Flow/Saving Rate KPIs one section above it.
  const nonTransferFilteredTransactions = useMemo(
    () =>
      filteredTransactions.filter(
        (transaction) => !isInternalTransferTransaction(transaction),
      ),
    [filteredTransactions],
  );

  /**
   * Canonical period flow.
   *
   * This is the only source used by visible income, expense and net cash-flow
   * KPIs. Internal transfers are excluded because they only move money between
   * owned accounts.
   */
  const periodFlowSummary = useMemo(() => {
    // Canonical income/expense (financeCalculations.ts) — `getTotalExpense`
    // excludes saving/investment-planning-group categories, matching
    // Reports/AI.
    return {
      income: getTotalIncome(nonTransferFilteredTransactions),
      expense: getTotalExpense(nonTransferFilteredTransactions, categories),
    };
  }, [nonTransferFilteredTransactions, categories]);

  const periodFutureAllocation = useMemo(() => {
    const savingAmount = Math.max(
      0,
      getNetSavingAllocation(
        savingTransactions,
        dateRange.startDate,
        dateRange.endDate,
      ),
    );
    const investmentAmount = Math.max(
      0,
      getNetInvestmentAllocation(
        forexCashTransactions,
        dateRange.startDate,
        dateRange.endDate,
      ),
    );

    return {
      savingAmount,
      investmentAmount,
      totalAmount: savingAmount + investmentAmount,
    };
  }, [
    dateRange.endDate,
    dateRange.startDate,
    forexCashTransactions,
    savingTransactions,
  ]);

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

  const reloadData = useCallback(async (trigger: DashboardOperationTrigger) => {
    markInstant("dashboard:reload:start");
    const fetchRange = getDashboardFetchRange(selectedYear);

    // PERF-4: this logical operation's id/trigger, shared via closure by
    // every query wrapper and milestone emission below — one operation id
    // per reloadData call, never per query/group (see dashboardPerfDebug's
    // module docs). Purely observational: does not affect fetch count,
    // ordering, or any PERF-2/PERF-3 readiness/race behavior.
    const operationId = nextDashboardOperationId("full");
    const ctx: DashboardOperationContext = { operationId, trigger };
    const operationStartedAt = dashboardPerfNow();
    logDashboardOperationStart(ctx, selectedYear);
    // Local, per-call dedup state for the milestones that can be reached
    // from more than one of this call's independent async branches
    // (period-ready from any of the four period groups below;
    // snapshot-ready/hero-ready from the Net Worth, Forex, and Cash Flow
    // groups settling independently) — plain closures, not refs, since a
    // fresh instance is exactly what "once per logical operation" requires
    // and each reloadData call gets its own via normal JS scoping.
    let periodReadyEmitted = false;
    let cashFlowReadyEmitted = false;
    let networthReadyEmitted = false;
    let networthSettled = false;
    let forexSettled = false;
    let snapshotReadyEmitted = false;
    // Hero eligibility for THIS operation requires a FRESH success this
    // cycle for BOTH of its dependencies, and that success must belong to
    // THIS operation specifically — not merely "the flag stayed true via
    // last-known-good", and not a different concurrent operation's
    // success. Both `networthFreshlyValidated` and `cashFlowFreshlyValidated`
    // are plain locals, freshly initialized to `false` on every reloadData
    // call by ordinary JS scoping — no other operation (a concurrent
    // reloadData, or a concurrent reloadPeriod triggered by a year switch)
    // can read or write them. A concurrent reloadPeriod validating Cash
    // Flow for the current year does NOT count as THIS full operation
    // having validated its own Cash Flow — if this operation's own period
    // work is stale (superseded — see the isStalePeriodGeneration guard in
    // the Cash Flow group below) or fails, `cashFlowFreshlyValidated` stays
    // false for THIS operation regardless of what any other operation did.
    let networthFreshlyValidated = false;
    let cashFlowFreshlyValidated = false;
    let heroReadyEmitted = false;
    function maybeMarkHeroReady() {
      if (
        heroReadyEmitted ||
        !networthFreshlyValidated ||
        !cashFlowFreshlyValidated
      ) {
        return;
      }
      heroReadyEmitted = true;
      emitDashboardMilestone(
        ctx,
        "dashboard_hero_ready",
        dashboardPerfNow() - operationStartedAt,
      );
    }
    function markPeriodReadyOnce() {
      if (periodReadyEmitted) return;
      periodReadyEmitted = true;
      emitDashboardMilestone(
        ctx,
        "dashboard_period_ready",
        dashboardPerfNow() - operationStartedAt,
      );
    }
    function markCashFlowReadyOnce() {
      if (cashFlowReadyEmitted) return;
      cashFlowReadyEmitted = true;
      emitDashboardMilestone(
        ctx,
        "dashboard_cashflow_ready",
        dashboardPerfNow() - operationStartedAt,
      );
    }
    function markNetWorthReadyOnce() {
      if (networthReadyEmitted) return;
      networthReadyEmitted = true;
      emitDashboardMilestone(
        ctx,
        "dashboard_networth_ready",
        dashboardPerfNow() - operationStartedAt,
      );
    }
    function maybeMarkSnapshotReady() {
      if (snapshotReadyEmitted || !networthSettled || !forexSettled) return;
      snapshotReadyEmitted = true;
      emitDashboardMilestone(
        ctx,
        "dashboard_snapshot_ready",
        dashboardPerfNow() - operationStartedAt,
      );
    }

    // This full reload (mount / Realtime / manual refresh) always fetches
    // transactions for whatever year is currently selected, so it is itself
    // a period fetch — it must participate in the same context/race
    // protection as a pure year-switch (reloadPeriod below), otherwise a
    // full reload in flight during a rapid year switch could overwrite
    // newer period data with stale results, or an old year's "last known
    // good" flag could survive into a new year's failure.
    const periodGeneration = beginPeriodGeneration(periodRequestIdRef);
    if (isNewPeriodContext(loadedPeriodYearRef.current, selectedYear)) {
      invalidatePeriodReadinessForNewContext();
    }

    // Every dataset is fetched exactly ONCE per reload cycle via these named
    // promises, all started concurrently below. Each readiness group further
    // down awaits only the subset it actually needs — a shared dataset
    // (e.g. `transactions`, `savings`) is awaited by more than one group,
    // but never fetched twice. measureDashboardQuery only measures timing
    // (a no-op passthrough when diagnostics are disabled) — it calls the
    // underlying query function exactly once, synchronously, so fetch
    // count/ordering/concurrency are unchanged.
    const walletsPromise = measureDashboardQuery("wallets", ctx, () =>
      getWallets(),
    );
    const investmentsPromise = measureDashboardQuery("investments", ctx, () =>
      getInvestments(),
    );
    const forexAccountsPromise = measureDashboardQuery(
      "forex_accounts",
      ctx,
      () => getForexAccounts(),
    );
    const forexEquityPromise = measureDashboardQuery<
      DashboardSupabaseResult<ForexEquityRow>
    >(
      "forex_equity",
      ctx,
      async () => {
        if (LOCAL_UI_MODE) return { data: [], error: null };

        const { data, error } = await supabase
          .from("forex_accounts")
          .select("id,current_equity");

        return {
          data: (data ?? []) as ForexEquityRow[],
          error,
        };
      },
      // This direct Supabase call resolves { data, error } on failure
      // rather than rejecting — classify a fulfilled error result as
      // "error" telemetry instead of "success" (PERF-4 correctness patch).
      { getStatus: supabaseResultStatus },
    );
    // Forex cash transactions feed both the canonical Net Worth fallback
    // (getForexAssetValue falls back to this ledger's net deposits-
    // withdrawals-fees for any account without a manually-entered
    // currentEquity — see the PERF-1 Forex correctness patch, unchanged
    // here) and the narrower Forex-card-only readiness group below.
    const forexLedgerPromise = measureDashboardQuery(
      "forex_ledger",
      ctx,
      () => getForexCashTransactions(),
    );
    const categoriesPromise = measureDashboardQuery("categories", ctx, () =>
      getCategories(),
    );
    const transactionsPromise = measureDashboardQuery(
      "transactions",
      ctx,
      () => getTransactionsInRange(fetchRange.startDate, fetchRange.endDate),
      {
        isStale: () => isStalePeriodGeneration(periodRequestIdRef, periodGeneration),
      },
    );
    const netWorthHistoryPromise = measureDashboardQuery(
      "net_worth_history",
      ctx,
      () =>
        getNetWorthSnapshotsInRange(
          `${selectedYear}-01-01`,
          `${selectedYear}-12-01`,
        ),
      {
        isStale: () =>
          isStalePeriodGeneration(periodRequestIdRef, periodGeneration),
      },
    );
    const debtsPromise = measureDashboardQuery("debts", ctx, () => getDebts());
    const goalsPromise = measureDashboardQuery("goals", ctx, () => getGoals());
    const savingsPromise = measureDashboardQuery<
      DashboardSupabaseResult<SavingRow>
    >(
      "savings",
      ctx,
      async () => {
        if (LOCAL_UI_MODE) return { data: [], error: null };

        const { data, error } = await supabase
          .from("savings")
          .select("*")
          .order("created_at", { ascending: false });

        return {
          data: (data ?? []) as SavingRow[],
          error,
        };
      },
      // Same fulfilled-{data,error} shape as forex_equity above.
      { getStatus: supabaseResultStatus },
    );
    // SECONDARY in startup priority (never blocks Net Worth/Cash Flow/
    // Goals/Emergency Fund/Forex), but "Tiết kiệm & Đầu tư" genuinely needs
    // this ledger for a correct allocation % — see savingInvestmentGroup.
    const savingTransactionsPromise = measureDashboardQuery<
      DashboardSupabaseResult<SavingTransactionRow>
    >(
      "saving_transactions",
      ctx,
      async () => {
        if (LOCAL_UI_MODE) return { data: [], error: null };

        const { data, error } = await supabase
          .from("saving_transactions")
          .select(
            "id,saving_id,type,amount,transaction_date,created_at,note",
          )
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false });

        return {
          data: (data ?? []) as SavingTransactionRow[],
          error,
        };
      },
      // Same fulfilled-{data,error} shape as forex_equity above.
      { getStatus: supabaseResultStatus },
    );
    const budgetsPromise = measureDashboardQuery("budgets", ctx, () =>
      getBudgets(),
    );

    // Returns true on success. On a Supabase-level error (not a thrown
    // exception — the query resolved, just with `.error` set), the
    // previous `savings` state is left untouched rather than cleared to
    // `[]`, so a later reload failure can never overwrite a prior
    // successful snapshot with a fake empty one. Callers use the returned
    // boolean to decide whether their own readiness flag may flip.
    function applySavingsResult(savingRows: {
      data: unknown;
      error: { message: string } | null;
    }): boolean {
      if (!savingRows.error) {
        setSavings(
          ((savingRows.data ?? []) as SavingRow[]).map(
            mapSavingRowToSavingAccount,
          ),
        );
        return true;
      } else {
        console.error(
          "[DashboardPage] Failed to load savings",
          savingRows.error,
        );
        return false;
      }
    }

    // NET WORTH HISTORY group — persisted monthly snapshots are the only
    // historical source. Missing months remain unknown/null; no transaction
    // reversal or current-balance backfill is allowed.
    const netWorthHistoryGroupPromise = (async () => {
      try {
        const history = await netWorthHistoryPromise;
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;

        setNetWorthSnapshots(history ?? []);
        loadedNetWorthHistoryYearRef.current = selectedYear;
        hasLoadedNetWorthHistoryRef.current = true;
        setNetWorthHistoryReady(true);
      } catch (error) {
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        console.error("[DashboardPage] net-worth-history reload failed", error);

        if (
          hasLoadedNetWorthHistoryRef.current &&
          loadedNetWorthHistoryYearRef.current === selectedYear
        ) {
          setNetWorthHistoryReady(true);
        }
      }
    })();

    // CASH FLOW group — `periodFlowSummary` (income/expense, "Dòng tiền
    // ròng") is computed purely from transactions+categories.
    const cashFlowGroupPromise = (async () => {
      try {
        const [txn, cat] = await Promise.all([
          transactionsPromise,
          categoriesPromise,
        ]);
        // A newer period fetch (a subsequent year switch) may have already
        // superseded this one — never let a slower, older response
        // overwrite a newer year's state.
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        setTransactions(txn ?? []);
        setCategories(cat ?? []);
        loadedPeriodYearRef.current = selectedYear;
        markPeriodReadyOnce();
        setCashFlowReady(true);
        hasLoadedCashFlowRef.current = true;
        markCashFlowReadyOnce();
        // A FRESH success this cycle, for THIS operation's own Cash Flow
        // work specifically — eligible to contribute to this operation's
        // own dashboard_hero_ready (see maybeMarkHeroReady). This local
        // flag can never be set by a concurrent reloadPeriod.
        cashFlowFreshlyValidated = true;
        maybeMarkHeroReady();
      } catch (error) {
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        console.error("[DashboardPage] cash-flow reload failed", error);
        // A first-load failure with no prior successful snapshot must NOT
        // flip readiness — that would let the initial empty state render
        // as if it were a real, loaded income/expense of 0. A later
        // (post-success) failure keeps the last-known-good snapshot and
        // readiness stays true, matching the app's existing "never flash
        // 0 on a transient refresh failure" policy. It is last-known-good,
        // NOT a fresh revalidation — this operation must NOT claim
        // dashboard_hero_ready on the strength of it, even though the UI
        // stays usable (see PERF-4 Hero Milestone Operation Semantics).
        if (hasLoadedCashFlowRef.current) {
          setCashFlowReady(true);
          markCashFlowReadyOnce();
        }
      }
    })();

    // GOALS group — goal progress (`goalMeta`/`goalSnapshot`, "Mục tiêu")
    // needs goals + transactions + savings, never investments/debts/Forex.
    const goalsGroupPromise = (async () => {
      try {
        const [gls, txn, savingRows] = await Promise.all([
          goalsPromise,
          transactionsPromise,
          savingsPromise,
        ]);
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        setGoals(gls ?? []);
        setTransactions(txn ?? []);
        loadedPeriodYearRef.current = selectedYear;
        markPeriodReadyOnce();
        const savingsOk = applySavingsResult(
          savingRows as { data: unknown; error: { message: string } | null },
        );
        if (shouldMarkReady(savingsOk, hasLoadedGoalsRef.current)) {
          setGoalsReady(true);
          hasLoadedGoalsRef.current = true;
        }
      } catch (error) {
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        console.error("[DashboardPage] goals reload failed", error);
        if (hasLoadedGoalsRef.current) setGoalsReady(true);
      }
    })();

    // EMERGENCY FUND group — `savingsSnapshot.emergencyFund` (savings) and
    // `summary.monthlyExpense` (mathematically `getMonthlyExpenseEstimate`
    // over transactions+categories, even though it's read off the bundled
    // `baseSummary` object) are this card's ONLY real inputs — no
    // wallets/investments/debts/Forex are read anywhere in its formula.
    const emergencyFundGroupPromise = (async () => {
      try {
        const [savingRows, txn, cat] = await Promise.all([
          savingsPromise,
          transactionsPromise,
          categoriesPromise,
        ]);
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        const savingsOk = applySavingsResult(
          savingRows as { data: unknown; error: { message: string } | null },
        );
        setTransactions(txn ?? []);
        setCategories(cat ?? []);
        loadedPeriodYearRef.current = selectedYear;
        markPeriodReadyOnce();
        if (shouldMarkReady(savingsOk, hasLoadedEmergencyFundRef.current)) {
          setEmergencyFundReady(true);
          hasLoadedEmergencyFundRef.current = true;
        }
      } catch (error) {
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        console.error("[DashboardPage] emergency-fund reload failed", error);
        if (hasLoadedEmergencyFundRef.current) setEmergencyFundReady(true);
      }
    })();

    // SAVING/INVESTMENT group — `savingsRateFromSavings`/`periodFutureAllocation`
    // ("Tiết kiệm & Đầu tư") needs income (transactions+categories), the
    // Forex ledger, `savings.totalSavings`, AND the SECONDARY
    // saving_transactions ledger. This card is intentionally allowed to
    // become ready only once every one of those — including the secondary
    // dataset — resolves, per the mandatory first-paint invariant: it must
    // never show an allocation % computed with a missing ledger.
    const savingInvestmentGroupPromise = (async () => {
      try {
        const [txn, cat, forexTxn, savingRows, savingTxnRows] =
          await Promise.all([
            transactionsPromise,
            categoriesPromise,
            forexLedgerPromise,
            savingsPromise,
            savingTransactionsPromise,
          ]);
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        setTransactions(txn ?? []);
        setCategories(cat ?? []);
        setForexCashTransactions(forexTxn ?? []);
        loadedPeriodYearRef.current = selectedYear;
        markPeriodReadyOnce();
        const savingsOk = applySavingsResult(
          savingRows as { data: unknown; error: { message: string } | null },
        );
        let ledgerOk = true;
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
          ledgerOk = false;
          // Leave the previous `savingTransactions` snapshot untouched —
          // never overwrite a prior successful load with a fake empty one.
        }
        if (
          shouldMarkReady(
            savingsOk && ledgerOk,
            hasLoadedSavingInvestmentRef.current,
          )
        ) {
          setSavingInvestmentReady(true);
          hasLoadedSavingInvestmentRef.current = true;
        }
      } catch (error) {
        if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;
        console.error(
          "[DashboardPage] saving/investment reload failed",
          error,
        );
        if (hasLoadedSavingInvestmentRef.current) {
          setSavingInvestmentReady(true);
        }
      }
    })();

    // FOREX group — `forexSnapshot` ("Forex" card) needs Forex accounts +
    // current_equity + the Forex ledger only, never wallets/investments/
    // debts/savings.
    const forexGroupPromise = (async () => {
      try {
        const [forexAcc, forexEquityRows, forexTxn] = await Promise.all([
          forexAccountsPromise,
          forexEquityPromise,
          forexLedgerPromise,
        ]);

        const equityByAccountId = new Map<string, number | null>();
        let equityOk = true;
        if (!forexEquityRows.error) {
          (forexEquityRows.data ?? []).forEach((row) => {
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
          // A fetch failure is not the same as "no account has equity" —
          // treating it as such would silently push every account onto the
          // net-capital fallback path even for ones with real equity on
          // file. Don't apply the (empty) equity map on a genuine failure.
          equityOk = false;
        }

        if (shouldMarkReady(equityOk, hasLoadedForexRef.current)) {
          setForexAccounts(
            (forexAcc ?? []).map((account) => ({
              ...account,
              currentEquity: equityByAccountId.get(account.id) ?? null,
            })),
          );
          setForexCashTransactions(forexTxn ?? []);
          setForexReady(true);
          hasLoadedForexRef.current = true;
          forexSettled = true;
          maybeMarkSnapshotReady();
        }
      } catch (error) {
        console.error("[DashboardPage] forex reload failed", error);
        if (hasLoadedForexRef.current) {
          setForexReady(true);
          forexSettled = true;
          maybeMarkSnapshotReady();
        }
      }
    })();

    // NET WORTH group — the full canonical asset/liability bundle behind
    // `calculateDashboardSummary`'s netWorth/totalAssets/totalDebt/
    // liquidBalance/debtRatio fields used by the Net Worth Hero. Waits for
    // literally everything those fields read: wallets, investments, debts,
    // savings, and the complete Forex asset value (accounts+equity+ledger).
    // Never render an incomplete Net Worth — unchanged invariant from
    // PERF-1.
    try {
      const [w, inv, forexAcc, forexEquityRows, forexTxn, dbt, savingRows] =
        await Promise.all([
          walletsPromise,
          investmentsPromise,
          forexAccountsPromise,
          forexEquityPromise,
          forexLedgerPromise,
          debtsPromise,
          savingsPromise,
        ]);

      setWallets(w ?? []);
      setInvestments(inv ?? []);
      setForexCashTransactions(forexTxn ?? []);

      const equityByAccountId = new Map<string, number | null>();
      let equityOk = true;
      if (!forexEquityRows.error) {
        (forexEquityRows.data ?? []).forEach((row) => {
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
        // A fetch failure is not the same as "no account has equity" — see
        // the identical guard in the FOREX group above. Net Worth's Forex
        // contribution must not silently fall back to net capital for an
        // account whose equity genuinely failed to load.
        equityOk = false;
      }

      setDebts(dbt ?? []);
      const savingsOk = applySavingsResult(
        savingRows as { data: unknown; error: { message: string } | null },
      );

      if (
        shouldMarkReady(equityOk && savingsOk, hasLoadedNetWorthRef.current)
      ) {
        setForexAccounts(
          (forexAcc ?? []).map((account) => ({
            ...account,
            currentEquity: equityByAccountId.get(account.id) ?? null,
          })),
        );
        setIsDashboardReady(true);
        hasLoadedNetWorthRef.current = true;
        networthSettled = true;
        markNetWorthReadyOnce();
        maybeMarkSnapshotReady();
        if (equityOk && savingsOk) {
          // A FRESH success this cycle (not a last-known-good preserve) —
          // eligible to contribute to this operation's own
          // dashboard_hero_ready. `shouldMarkReady` above can also be true
          // via hasLoadedNetWorthRef alone when equityOk/savingsOk are
          // false (this cycle's fetch actually failed) — that path must
          // NOT count as revalidation, hence the extra check here.
          networthFreshlyValidated = true;
          maybeMarkHeroReady();
        }
        measureAndReport(
          "dashboard_snapshot",
          "dashboard:reload:start",
          "dashboard:reload:end",
          { status: "success" },
        );
      }
    } catch (error) {
      console.error("[DashboardPage] reloadData failed", error);

      // A first-load failure with no prior successful Net Worth snapshot
      // must NOT flip isDashboardReady — that would let the Hero section's
      // already-unconditional render show a fabricated 0 Net Worth as if
      // it were real. A later failure (after at least one success) keeps
      // the last-known-good snapshot and readiness stays true — clearing
      // every array here caused the net-cash-flow KPI to flash 0 before
      // the slower transaction request finished again (pre-existing fix,
      // preserved). This is last-known-good, NOT a fresh revalidation —
      // networthFreshlyValidated intentionally stays false here (see PERF-4
      // Hero Milestone Operation Semantics).
      if (hasLoadedNetWorthRef.current) {
        setIsDashboardReady(true);
        networthSettled = true;
        markNetWorthReadyOnce();
        maybeMarkSnapshotReady();
      }
      measureAndReport(
        "dashboard_snapshot",
        "dashboard:reload:start",
        "dashboard:reload:end",
        { status: "error" },
      );
    }

    await Promise.all([
      cashFlowGroupPromise,
      goalsGroupPromise,
      emergencyFundGroupPromise,
      savingInvestmentGroupPromise,
      forexGroupPromise,
      netWorthHistoryGroupPromise,
    ]);

    // Secondary content (Budget recommendation) resolves and paints
    // independently — a slow or failed secondary fetch never blocks or
    // fails any primary KPI, including the saving/investment group above
    // (which awaits `savingTransactionsPromise` directly, not this budgets
    // fetch).
    try {
      const bdg = await budgetsPromise;
      setBudgets(bdg ?? []);
      // UI-DASH-2: a genuine successful resolve — including a legitimate
      // empty array — is what "loaded" means. Never inferred from
      // `budgets.length`, which is indistinguishable from "not fetched
      // yet" while this promise is still pending.
      hasLoadedBudgetsRef.current = true;
      setBudgetsLoaded(true);
    } catch (error) {
      console.error("[DashboardPage] secondary reloadData failed", error);
      // Keep the last-known secondary snapshot on transient failure, same
      // policy as every other group above. A first-load failure with no
      // prior success must NOT flip budgetsLoaded — see the identical
      // invariant for every other PERF-2 readiness flag above.
      if (hasLoadedBudgetsRef.current) setBudgetsLoaded(true);
    }
  }, [selectedYear, invalidatePeriodReadinessForNewContext]);

  // PERF-3 + NETWORTH-HISTORY-1: a year switch reloads exactly the two
  // year-dependent datasets: transactions and persisted Net Worth snapshots.
  // Current asset/liability datasets remain snapshot-like and are not refetched.
  const reloadPeriod = useCallback(async (year: number) => {
    const operationId = nextDashboardOperationId("period");
    const ctx: DashboardOperationContext = {
      operationId,
      trigger: "year_change",
    };
    const operationStartedAt = dashboardPerfNow();
    logDashboardOperationStart(ctx, year);

    const periodGeneration = beginPeriodGeneration(periodRequestIdRef);
    if (isNewPeriodContext(loadedPeriodYearRef.current, year)) {
      invalidatePeriodReadinessForNewContext();
    }

    const fetchRange = getDashboardFetchRange(year);
    const transactionsRequest = measureDashboardQuery(
      "transactions",
      ctx,
      () => getTransactionsInRange(fetchRange.startDate, fetchRange.endDate),
      {
        isStale: () =>
          isStalePeriodGeneration(periodRequestIdRef, periodGeneration),
      },
    );
    const historyRequest = measureDashboardQuery(
      "net_worth_history",
      ctx,
      () =>
        getNetWorthSnapshotsInRange(`${year}-01-01`, `${year}-12-01`),
      {
        isStale: () =>
          isStalePeriodGeneration(periodRequestIdRef, periodGeneration),
      },
    );

    // Both year-dependent reads start before either is awaited. A failure in
    // one domain must not suppress a successful result from the other.
    const [transactionsResult, historyResult] = await Promise.allSettled([
      transactionsRequest,
      historyRequest,
    ]);

    if (isStalePeriodGeneration(periodRequestIdRef, periodGeneration)) return;

    if (transactionsResult.status === "fulfilled") {
      setTransactions(transactionsResult.value ?? []);
      loadedPeriodYearRef.current = year;
      emitDashboardMilestone(
        ctx,
        "dashboard_period_ready",
        dashboardPerfNow() - operationStartedAt,
      );

      if (shouldMarkReady(true, hasLoadedCashFlowRef.current)) {
        setCashFlowReady(true);
        hasLoadedCashFlowRef.current = true;
        emitDashboardMilestone(
          ctx,
          "dashboard_cashflow_ready",
          dashboardPerfNow() - operationStartedAt,
        );
      }

      if (isDashboardReadyRef.current) {
        emitDashboardMilestone(
          ctx,
          "dashboard_hero_ready",
          dashboardPerfNow() - operationStartedAt,
        );
      }
      if (shouldMarkReady(true, hasLoadedGoalsRef.current)) {
        setGoalsReady(true);
        hasLoadedGoalsRef.current = true;
      }
      if (shouldMarkReady(true, hasLoadedEmergencyFundRef.current)) {
        setEmergencyFundReady(true);
        hasLoadedEmergencyFundRef.current = true;
      }
      if (shouldMarkReady(true, hasLoadedSavingInvestmentRef.current)) {
        setSavingInvestmentReady(true);
        hasLoadedSavingInvestmentRef.current = true;
      }
    } else {
      console.error(
        "[DashboardPage] period reload failed",
        transactionsResult.reason,
      );
      if (hasLoadedCashFlowRef.current) {
        setCashFlowReady(true);
        emitDashboardMilestone(
          ctx,
          "dashboard_cashflow_ready",
          dashboardPerfNow() - operationStartedAt,
        );
      }
      if (hasLoadedGoalsRef.current) setGoalsReady(true);
      if (hasLoadedEmergencyFundRef.current) setEmergencyFundReady(true);
      if (hasLoadedSavingInvestmentRef.current) setSavingInvestmentReady(true);
    }

    if (historyResult.status === "fulfilled") {
      setNetWorthSnapshots(historyResult.value ?? []);
      loadedNetWorthHistoryYearRef.current = year;
      hasLoadedNetWorthHistoryRef.current = true;
      setNetWorthHistoryReady(true);
    } else {
      console.error(
        "[DashboardPage] net-worth-history period reload failed",
        historyResult.reason,
      );
      if (
        hasLoadedNetWorthHistoryRef.current &&
        loadedNetWorthHistoryYearRef.current === year
      ) {
        setNetWorthHistoryReady(true);
      }
    }
  }, [invalidatePeriodReadinessForNewContext]);

  // Guards against overlapping Dashboard reloads: if a caller asks for a
  // refresh while one is already running (e.g. a realtime event arriving
  // mid-fetch), it marks `pending` instead of starting a second concurrent
  // Promise.all group, then runs exactly one trailing reload once the
  // in-flight one finishes — so the final state always reflects the latest
  // writes without ever running two overlapping query sets.
  const isReloadingRef = useRef(false);
  const hasPendingReloadRef = useRef(false);
  // PERF-4: which trigger caused the currently-pending trailing reload, if
  // any — purely for observability labeling; the do-while overlap guard
  // itself is unchanged from PERF-2.
  const pendingReloadTriggerRef = useRef<DashboardOperationTrigger>("realtime");
  const runReload = useCallback(
    async (trigger: DashboardOperationTrigger) => {
      if (isReloadingRef.current) {
        hasPendingReloadRef.current = true;
        pendingReloadTriggerRef.current = trigger;
        return;
      }
      isReloadingRef.current = true;
      try {
        let currentTrigger = trigger;
        do {
          hasPendingReloadRef.current = false;
          await reloadData(currentTrigger);
          currentTrigger = pendingReloadTriggerRef.current;
        } while (hasPendingReloadRef.current);
      } finally {
        isReloadingRef.current = false;
      }
    },
    [reloadData],
  );

  // Realtime-only entry point: coalesces bursts of postgres_changes events
  // that land within a short window (one multi-table write can fire several
  // independent table events — see REALTIME_REFRESH_DEBOUNCE_MS above) into
  // a single runReload() call. Initial/month-driven loads intentionally
  // bypass this and call runReload() directly so they stay immediate.
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const requestDashboardRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current !== null) {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void runReload("realtime");
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [runReload]);

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
    };
  }, []);

  // Mount-only full reload (snapshot + the initial year's period data).
  // Deliberately NOT keyed on `runReload`'s identity — runReload changes
  // identity whenever selectedYear changes (it wraps reloadData, which
  // depends on selectedYear), and re-running the FULL reload on every year
  // change is exactly the PERF-3 regression being fixed. A ref holds the
  // latest runReload so this effect can still call the current version
  // without re-firing when selectedYear changes.
  const runReloadRef = useRef(runReload);
  useEffect(() => {
    runReloadRef.current = runReload;
  }, [runReload]);
  useEffect(() => {
    void (async () => {
      await runReloadRef.current("initial");
    })();
  }, []);

  // PERF-3: a pure year switch reloads only year-dependent data (transactions
  // + canonical Net Worth snapshots) via reloadPeriod, reusing the already-valid current snapshot rather than
  // repeating the mount effect's full reload. Skips the very first render
  // — the mount effect above already covers the initial selectedYear.
  const hasHandledInitialYearRef = useRef(false);
  useEffect(() => {
    if (!hasHandledInitialYearRef.current) {
      hasHandledInitialYearRef.current = true;
      return;
    }
    void reloadPeriod(selectedYear);
  }, [selectedYear, reloadPeriod]);

  // Fires once, the first time isDashboardReady flips true: an rAF after the
  // commit approximates when the above-the-fold KPI values actually painted,
  // not just when the network/state update resolved (that's dashboard_snapshot).
  useEffect(() => {
    if (!isDashboardReady) return;
    if (hasReportedCriticalReadyRef.current) return;
    if (mountedAtRef.current === null) return;
    hasReportedCriticalReadyRef.current = true;

    const startedAt = mountedAtRef.current;
    const frame = requestAnimationFrame(() => {
      reportPerformanceMetric(
        "dashboard_critical_ready",
        performance.now() - startedAt,
        { status: "success" },
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [isDashboardReady]);

  useRealtimeTable(
    [
      "wallets",
      "transactions",
      "investments",
      "net_worth_snapshots",
      "forex_accounts",
      "forex_cash_transactions",
      "debts",
      "goals",
      "budgets",
    ],
    requestDashboardRefresh,
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
    // Net capital contributed — a cost-basis figure used for the P&L/ROI
    // metrics below, and as the canonical fallback asset value for any
    // account without a manually-entered equity (see getForexAssetValue).
    const netCapital = getForexNetCapital(forexCashTransactions);
    // Net worth's actual Forex asset value: each account's current equity
    // (its real broker-reported value) where entered, falling back to net
    // capital otherwise — the figure `calculateNetWorth` expects as
    // `forexAssetValue`. Trading profit/loss (below) is a separate,
    // presentation-only metric derived FROM this, not part of net worth
    // itself.
    const assetValue = getForexAssetValue(forexAccounts, forexCashTransactions);
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
      assetValue,
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
        forexAssetValue: forexSnapshot.assetValue,
      }),
    [
      snapshotWallets,
      savings,
      snapshotInvestments,
      snapshotDebts,
      filteredTransactions,
      categories,
      snapshotGoals,
      forexSnapshot.assetValue,
    ],
  );

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

  const savingsRateFromSavings = useMemo(() => {
    if (periodFlowSummary.income <= 0) return 0;

    return clampScore(
      (periodFutureAllocation.totalAmount / periodFlowSummary.income) * 100,
    );
  }, [periodFlowSummary.income, periodFutureAllocation.totalAmount]);

  // `baseSummary.netWorth` already includes Forex (passed in as
  // `forexAssetValue` above) via the canonical `calculateNetWorth` — no
  // local net-worth arithmetic needed here anymore.
  const summary = useMemo(
    () => ({
      ...baseSummary,
      income: periodFlowSummary.income,
      expense: periodFlowSummary.expense,
      forexCashBalance: forexSnapshot.balance,
      forexCashFees: forexSnapshot.totalFees,
      saving: periodFutureAllocation.totalAmount,
      savingRate: savingsRateFromSavings,
      goalScore: goalSnapshot.averageProgress,
    }),
    [
      baseSummary,
      periodFlowSummary.income,
      periodFlowSummary.expense,
      forexSnapshot.balance,
      forexSnapshot.totalFees,
      periodFutureAllocation.totalAmount,
      savingsRateFromSavings,
      goalSnapshot.averageProgress,
    ],
  );

  // ── Net-worth timeline ────────────────────────────────────────────────────
  // NETWORTH-HISTORY-1: persisted monthly snapshots are the historical SSOT.
  // Missing months remain unknown/null; current balances and transaction deltas
  // are never used to fabricate a past value.
  const selectedMonth = useMemo(() => {
    const monthFromRange = getMonthIndexFromDate(dateRange.startDate);
    const yearFromRange = getYearFromDate(dateRange.startDate);

    if (monthFromRange && yearFromRange === selectedYear) return monthFromRange;

    const now = new Date();
    return now.getFullYear() === selectedYear ? now.getMonth() + 1 : 12;
  }, [dateRange.startDate, selectedYear]);

  const netWorthTrend = useMemo(
    () =>
      buildCanonicalNetWorthTrend({
        snapshots: netWorthSnapshots,
        selectedYear,
        selectedMonth,
      }),
    [netWorthSnapshots, selectedMonth, selectedYear],
  );

  const netWorthHistorySummary = useMemo(
    () => summarizeCanonicalNetWorthHistory(netWorthTrend),
    [netWorthTrend],
  );

  // ── Cash-flow trend (real monthly transaction data) ───────────────────────
  const selectedYearTransactions = useMemo(
    () =>
      filterTransactionsByDateRange(transactions, {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
      }).filter((transaction) => !isInternalTransferTransaction(transaction)),
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

  // ── Spending ──────────────────────────────────────────────────────────────

  // ── 50/30/20 ─────────────────────────────────────────────────────────────
  const allocation5030 = useMemo(() => {
    // DASH-POLISH-1: reuses the shared nonTransferFilteredTransactions
    // collection instead of re-applying the same isInternalTransferTransaction
    // filter independently — same result, one source of truth.
    const allocation = calculateRule503020({
      transactions: nonTransferFilteredTransactions,
      categories,
      income: summary.income,
    });

    const savingsAmount = periodFutureAllocation.totalAmount;
    const savings =
      summary.income > 0
        ? Math.round((savingsAmount / summary.income) * 100)
        : 0;

    return {
      needs: allocation.needsPercentOfIncome,
      wants: allocation.wantsPercentOfIncome,
      savings,
      needsAmount: allocation.needsAmount,
      wantsAmount: allocation.wantsAmount,
      savingsAmount,
      unclassifiedAmount: allocation.unclassifiedAmount,
    };
  }, [
    nonTransferFilteredTransactions,
    categories,
    periodFutureAllocation.totalAmount,
    summary.income,
  ]);

  const cashFlowData = useMemo(() => {
    const now = new Date();
    const latestActualMonth =
      selectedYear < now.getFullYear()
        ? 12
        : selectedYear === now.getFullYear()
          ? now.getMonth() + 1
          : 0;

    return cashFlowTrend.map((item, index) => {
      const month = index + 1;
      const isFutureMonth = month > latestActualMonth;

      if (isFutureMonth) {
        return {
          ...item,
          thu: null,
          chi: null,
          tietKiem: null,
          dauTu: null,
          dongTienRong: null,
          hasData: false,
        };
      }

      const monthStart = `${selectedYear}-${String(month).padStart(2, "0")}-01`;
      const monthEndDate = new Date(selectedYear, month, 0);
      const monthEnd = toLocalDateKey(monthEndDate);
      const tietKiem = Math.max(
        0,
        getNetSavingAllocation(savingTransactions, monthStart, monthEnd),
      );
      const dauTu = Math.max(
        0,
        getNetInvestmentAllocation(forexCashTransactions, monthStart, monthEnd),
      );
      const thu = Number(item.thu ?? 0);
      const chi = Number(item.chi ?? 0);

      return {
        ...item,
        thu,
        chi,
        tietKiem,
        dauTu,
        dongTienRong: thu - chi,
        hasData: thu > 0 || chi > 0 || tietKiem > 0 || dauTu > 0,
      };
    });
  }, [cashFlowTrend, forexCashTransactions, savingTransactions, selectedYear]);

  const netCashFlow = summary.income - summary.expense;

  const emergencyMonthsExact = useMemo(() => {
    if (summary.monthlyExpense <= 0) return 0;
    return savingsSnapshot.emergencyFund / summary.monthlyExpense;
  }, [savingsSnapshot.emergencyFund, summary.monthlyExpense]);

  // ── V11.1 Financial Structure ───────────────────────────────────────────
  // DASH-POLISH-1: reuses `nonTransferFilteredTransactions` — the SAME
  // accepted transaction set periodFlowSummary uses — instead of the raw
  // `filteredTransactions`, so income/expense/fixedCost/variableCost (and
  // every ratio calculateFinancialStructureSummary derives from them)
  // can no longer disagree with the Cash Flow/Saving Rate KPIs over
  // whether a given transaction is an internal transfer. No formula
  // inside calculateFinancialStructureSummary changed — only which
  // already-filtered transaction collection it receives.
  const financialStructure = useMemo(
    () =>
      calculateFinancialStructureSummary({
        transactions: nonTransferFilteredTransactions,
        categories,
      }),
    [nonTransferFilteredTransactions, categories],
  );

  const financialStructureAdjusted = useMemo(() => {
    const income = financialStructure.income || summary.income;
    const savingAmount = periodFutureAllocation.savingAmount;
    const investmentAmount = periodFutureAllocation.investmentAmount;
    const futureAllocationAmount = savingAmount + investmentAmount;

    const savingRate =
      income > 0 ? clampScore((savingAmount / income) * 100) : 0;
    const investmentRate =
      income > 0 ? clampScore((investmentAmount / income) * 100) : 0;
    const futureAllocationRate =
      income > 0 ? clampScore((futureAllocationAmount / income) * 100) : 0;

    return {
      ...financialStructure,
      income,
      savingAmount,
      investmentAmount,
      futureAllocationAmount,
      savingRate,
      investmentRate,
      futureAllocationRate,
    };
  }, [
    financialStructure,
    periodFutureAllocation.investmentAmount,
    periodFutureAllocation.savingAmount,
    summary.income,
  ]);

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
        title: "Tiết kiệm & Đầu tư",
        value: `${financialStructureAdjusted.futureAllocationRate}%`,
        amount: `${formatVND(financialStructureAdjusted.futureAllocationAmount)} / ${formatVND(financialStructureAdjusted.income)}`,
        note: `Tiết kiệm ${financialStructureAdjusted.savingRate}% · Đầu tư ${financialStructureAdjusted.investmentRate}%`,
        tone:
          financialStructureAdjusted.futureAllocationRate >= 20
            ? "good"
            : financialStructureAdjusted.futureAllocationRate >= 10
              ? "warning"
              : "danger",
        bar: Math.min(financialStructureAdjusted.futureAllocationRate, 100),
      },
      {
        title: "Tỷ trọng đầu tư",
        value: `${financialStructureAdjusted.investmentRate}%`,
        amount: `${formatVND(financialStructureAdjusted.investmentAmount)} / ${formatVND(financialStructureAdjusted.income)}`,
        note:
          financialStructureAdjusted.investmentRate >= 15
            ? "Tích cực xây tài sản"
            : financialStructureAdjusted.investmentRate >= 5
              ? "Đang bắt đầu"
              : financialStructureAdjusted.futureAllocationRate >= 20
                ? "20% hiện đang phân bổ vào tiết kiệm"
                : "Chưa ghi nhận phân bổ đầu tư",
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

  // DASH-POLISH-1: Financial Structure's 4 cards have two different real
  // dependency subsets — "Chi phí cố định"/"Chi phí biến đổi" only need
  // transactions+categories (financialStructure, post-fix now on the same
  // accepted transaction set as cashFlowReady's own dependency), while
  // "Tiết kiệm & Đầu tư"/"Tỷ trọng đầu tư" additionally read
  // periodFutureAllocation's savingAmount/investmentAmount, which is
  // gated by savingInvestmentReady. Rather than splitting the panel into
  // 2 ready + 2 loading cards simultaneously, this gates the whole panel
  // on the union of both — savingInvestmentReady never becomes true
  // before cashFlowReady's own dependencies resolve, so this is a safe,
  // no-premature-render superset, not a new independent readiness state.
  const financialStructureReady = cashFlowReady && savingInvestmentReady;

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

  // UI-DASH-2: shared selected-month key for the remaining period-aware
  // Dashboard surfaces so KPI navigation, Budget Attention, Monthly Progress,
  // and Recent Transactions cannot drift onto different months.
  const dashboardMonthKey = useMemo(
    () => `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`,
    [selectedYear, selectedMonth],
  );

  // PERF-4B: the Hero is no longer one all-or-nothing gate. Each visible
  // field now uses exactly the readiness flag(s) its own data actually
  // depends on, instead of the union of every Hero field's dependencies:
  //   - the Net Worth headline + the 5 HeroMinis — `isDashboardReady`
  //     alone. `calculateNetWorth` takes no transactions/categories
  //     argument, so these never needed cashFlowReady; gating them on it
  //     anyway held the page's single largest, first-seen element in
  //     skeleton for no data reason whenever the transactions/categories
  //     fetch happened to be slower than the Net Worth bundle.
  //   - the "Dòng tiền dương/âm" badge — `cashFlowReady` alone (unchanged
  //     dependency: `netCashFlow` is periodFlowSummary's income/expense).
  //   - the comparison delta + NetWorthTrendChart — `netWorthHistoryReady`
  //     alone. The chart now reads the year-scoped persisted snapshot table and
  //     no longer waits on cash-flow or saving-transaction ledgers.
  const netWorthTrendReady = netWorthHistoryReady;
  const hasNetWorthHistoryData = netWorthHistorySummary.snapshotCount > 0;
  const hasNetWorthHistoryComparison =
    netWorthHistorySummary.hasComparison &&
    netWorthHistorySummary.changeFromPrevious !== null;

  // ── Compact operating KPIs ───────────────────────────────────────────────
  // `ready` is per-card: only "Dòng tiền ròng" (periodFlowSummary — pure
  // transactions+categories) and "Mục tiêu" (goalMeta — goals+transactions+
  // savings) have a real dependency set narrower than the full canonical
  // Net Worth bundle, so only those two get an earlier readiness flag. The
  // other three read bundled `baseSummary`/Forex-ledger fields and must
  // still wait for `isDashboardReady`, unchanged from before PERF-2.
  const kpiCards = [
    {
      title: "Dòng tiền ròng",
      value: formatVND(netCashFlow),
      note: `Thu ${formatCompactVND(summary.income)} · Chi ${formatCompactVND(summary.expense)}`,
      tone: netCashFlow >= 0 ? "good" : "danger",
      icon: TrendingUp,
      ready: cashFlowReady,
      // Period metric (periodFlowSummary) — carries the selected Dashboard
      // period, not today's date, to Transactions.
      href: buildTransactionsHref({ month: dashboardMonthKey }),
    },
    {
      title: "Tiết kiệm & Đầu tư",
      value: `${summary.savingRate}%`,
      note: `${formatCompactVND(savingsSnapshot.totalSavings)} đã tích lũy`,
      tone: summary.savingRate >= 20 ? "good" : "warning",
      icon: PiggyBank,
      ready: savingInvestmentReady,
      // UI-DASH-3: deliberately left non-clickable — this rate spans two
      // domains (Savings + Investments) with no single owning page and no
      // combined Transactions filter (`type` only accepts one value), so
      // there is no unambiguous destination to send the user to.
      href: undefined as string | undefined,
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
      ready: emergencyFundReady,
      // Snapshot metric (savingsSnapshot.emergencyFund aggregates
      // `type === "emergency_fund"` savings accounts) — Savings is the
      // page that actually owns these accounts, not Goals. No single
      // account to focus (this is a sum across accounts), so this goes to
      // the collection-level Savings page, and never carries the selected
      // period (a snapshot balance isn't a period-scoped value).
      href: buildSavingsHref(),
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
      ready: forexReady,
      // No navigation builder exists for Investments (and the destination
      // page reads no URL params at all today) — same bare route already
      // used by the Forex panel's own CTA below.
      href: "/investments",
    },
    {
      title: "Mục tiêu",
      value: `${summary.goalScore}%`,
      note: `${goalSnapshot.trackedCount} mục tiêu đang theo dõi`,
      tone: summary.goalScore >= 50 ? "good" : "warning",
      icon: Target,
      ready: goalsReady,
      // Aggregate across all goals, not one — collection-level, not
      // entity-focused.
      href: buildGoalsHref(),
    },
  ] as const;

  // ── MyFinance v2 daily command center ───────────────────────────────────
  const todaySnapshot = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const todayTransactions = transactions.filter(
      (transaction) => toLocalDateKey(transaction.date) === todayKey,
    );
    const income = todayTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const expense = todayTransactions
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          !isInternalTransferTransaction(transaction),
      )
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const saving = savingTransactions
      .filter(
        (transaction) =>
          transaction.type === "deposit" &&
          toLocalDateKey(transaction.date) === todayKey,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return { income, expense, saving, net: income - expense };
  }, [transactions, savingTransactions]);

  const monthlyPulse = useMemo(() => {
    const now = new Date();
    const year = selectedYear;
    const monthIndex = selectedMonth - 1;
    const monthKey = dashboardMonthKey;
    const daysInMonth = new Date(year, selectedMonth, 0).getDate();
    const isCurrentMonth =
      now.getFullYear() === year && now.getMonth() === monthIndex;
    const isPastMonth =
      year < now.getFullYear() ||
      (year === now.getFullYear() && monthIndex < now.getMonth());
    const elapsedDays = isCurrentMonth
      ? Math.max(now.getDate(), 1)
      : isPastMonth
        ? daysInMonth
        : 0;

    const monthTransactions = transactions.filter((transaction) => {
      if (isInternalTransferTransaction(transaction)) return false;

      const date = new Date(transaction.date);
      return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === monthIndex
      );
    });
    const income = monthTransactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const expense = monthTransactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const projectedExpense =
      isCurrentMonth && elapsedDays > 0
        ? Math.round((expense / elapsedDays) * daysInMonth)
        : expense;
    const budgetLimit = budgets
      .filter((budget) => budget.month.startsWith(monthKey))
      .reduce((sum, budget) => sum + Math.max(budget.limitAmount, 0), 0);
    const progress =
      daysInMonth > 0 ? Math.round((elapsedDays / daysInMonth) * 100) : 0;
    const budgetUsage =
      budgetLimit > 0 ? Math.round((expense / budgetLimit) * 100) : 0;
    const projectedBudgetUsage =
      budgetLimit > 0 ? Math.round((projectedExpense / budgetLimit) * 100) : 0;

    return {
      year,
      month: selectedMonth,
      elapsedDays,
      daysInMonth,
      progress,
      income,
      expense,
      projectedExpense,
      budgetLimit,
      budgetUsage,
      projectedBudgetUsage,
    };
  }, [budgets, dashboardMonthKey, selectedMonth, selectedYear, transactions]);

  // DASH-POLISH-1: gates only monthlyPulse's transaction/budget-dependent
  // fields (spend, projected spend, budget usage, projected budget usage)
  // — its calendar fields (elapsedDays/daysInMonth/progress) are pure date
  // arithmetic with no fetch dependency and remain always visible. See
  // isMonthlyProgressReady's own doc comment for the dependency reasoning.
  const monthlyProgressReady = isMonthlyProgressReady(
    cashFlowReady,
    budgetsLoaded,
  );

  // UI-DASH-2 Budget Attention: the same active-month budgets Tiến độ
  // tháng already uses (`dashboardMonthKey`, matching `monthlyPulse`'s own
  // filtering exactly) — Monthly Progress answers "how fast is total
  // spending moving", this answers "which category budgets need
  // attention". Reuses the canonical calculateBudgetSpendingCollection via
  // buildDashboardBudgetAttention; no independent spend calculation.
  const budgetAttentionMonthBudgets = useMemo(
    () => budgets.filter((budget) => budget.month.startsWith(dashboardMonthKey)),
    [budgets, dashboardMonthKey],
  );

  const budgetAttention = useMemo(
    () =>
      buildDashboardBudgetAttention({
        budgets: budgetAttentionMonthBudgets,
        categories,
        transactions,
      }),
    [budgetAttentionMonthBudgets, categories, transactions],
  );

  // UI-DASH-2 readiness correctness: ready only once the budgets dataset
  // has ever loaded AND the accepted transaction/category snapshot
  // belongs to the current period (cashFlowReady — reused as-is, not
  // duplicated; see isBudgetAttentionReady's own doc comment). Not part
  // of isHeroReady/isDashboardReady — budgets stay non-critical-path.
  const budgetAttentionReady = isBudgetAttentionReady(
    budgetsLoaded,
    cashFlowReady,
  );

  const upcomingMoneyEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);

    const categorySchedules = categories
      .filter(
        (category) =>
          category.isRecurring &&
          category.nextRunDate &&
          Number(category.defaultAmount ?? 0) > 0,
      )
      .map((category) => ({
        id: `category-${category.id}`,
        title: category.name,
        categoryName: category.name,
        amount: Math.abs(Number(category.defaultAmount ?? 0)),
        type: category.type,
        date: new Date(category.nextRunDate as string),
      }));

    // Keep backward compatibility with older transaction-level schedules.
    const transactionSchedules = transactions
      .filter(
        (transaction) => transaction.isRecurring && transaction.nextRunDate,
      )
      .map((transaction) => {
        const date = new Date(transaction.nextRunDate as string);
        const categoryName =
          categories.find((category) => category.id === transaction.categoryId)
            ?.name ?? "Chưa phân loại";
        return {
          id: `transaction-${transaction.id}`,
          title: transaction.note?.trim() || categoryName,
          categoryName,
          amount: Math.abs(transaction.amount),
          type: transaction.type,
          date,
        };
      });

    return [...categorySchedules, ...transactionSchedules]
      .filter(
        (item) =>
          !Number.isNaN(item.date.getTime()) &&
          item.date >= today &&
          item.date <= limit &&
          (item.type === "income" || item.type === "expense"),
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
  }, [categories, transactions]);

  const topSpendingCategories = useMemo(() => {
    const totals = new Map<string, number>();
    transactions.forEach((transaction) => {
      if (
        transaction.type !== "expense" ||
        isInternalTransferTransaction(transaction)
      )
        return;
      const date = new Date(transaction.date);
      if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== selectedYear ||
        date.getMonth() !== selectedMonth - 1
      )
        return;
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) +
          Math.abs(transaction.amount),
      );
    });

    return Array.from(totals.entries())
      .map(([categoryId, amount]) => ({
        categoryId,
        name:
          categories.find((category) => category.id === categoryId)?.name ??
          "Khác",
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [transactions, categories, selectedMonth, selectedYear]);

  return (
    <div className="scroll-smooth min-w-0 max-w-full space-y-4 overflow-x-hidden sm:space-y-5">
      {/* UI-DASH-1: financial position leads the page — Hero communicates
          Net Worth first, before any lower-priority informational content
          (see the audit that motivated this reorder). Content, readiness
          gating, and instrumentation below are unchanged; only its position
          in the page moved. */}
      {/* Executive overview */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_14px_36px_rgba(37,99,235,0.08)] sm:rounded-4xl">
        <div className="bg-linear-to-br from-white via-[#F8FBFF] to-[#EEF5FF] p-4 sm:p-7">
          {/* DASH-MOBILE-POLISH-1: financial hierarchy first on mobile.
              Net Worth is the focal value; Reports is a compact secondary action,
              and supporting copy no longer sits between the title and amount. */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600 sm:text-xs">
                Tài sản & nợ
              </p>
              <h1 className="mt-1.5 text-[22px] font-black tracking-tight text-[#23466F] sm:mt-2 sm:text-3xl">
                Tài sản ròng
              </h1>
            </div>
            <button
              type="button"
              onClick={() => router.push("/reports")}
              className="mt-0.5 inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white/90 px-3 text-xs font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 sm:h-10 sm:px-4 sm:text-sm"
            >
              Xem báo cáo&nbsp;›
            </button>
          </div>

          <div className="mt-4">
            {/* PERF-4B: headline remains gated only on isDashboardReady. */}
            {isDashboardReady ? (
              <p
                className="whitespace-nowrap text-[clamp(1.85rem,8.8vw,2.35rem)] font-black leading-none tracking-[-0.055em] tabular-nums text-[#173A6A] sm:text-5xl"
                title={formatVND(summary.netWorth)}
              >
                {formatVND(summary.netWorth)}
              </p>
            ) : (
              <div className="h-10 w-52 animate-pulse rounded-lg bg-slate-200/80 sm:h-12 sm:w-64" />
            )}

            <p className="mt-2 max-w-xl text-[13px] leading-5 text-slate-600 sm:text-sm">
              Tổng tài sản đang sở hữu sau khi trừ toàn bộ nợ phải trả.
            </p>

            {/* PERF-4B: badge still depends on cashFlowReady alone. */}
            <div className="mt-3">
              {cashFlowReady ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black sm:px-3 sm:text-xs ${
                    netCashFlow >= 0
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "border-rose-100 bg-rose-50 text-rose-600"
                  }`}
                >
                  {netCashFlow >= 0 ? "↑" : "↓"}{" "}
                  {netCashFlow >= 0 ? "Dòng tiền dương" : "Dòng tiền âm"} ·{" "}
                  {formatVND(netCashFlow)}
                </span>
              ) : (
                <div className="h-6 w-36 animate-pulse rounded-full bg-slate-100" />
              )}
            </div>
          </div>

          {/* Mobile uses a flatter financial breakdown instead of visually
              heavy nested cards; desktop keeps a familiar 5-column layout. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-5">
            <HeroMini
              icon={<Wallet size={16} />}
              iconClass="bg-blue-50 text-blue-600"
              label="Thanh khoản"
              value={formatVND(summary.liquidBalance)}
              valueClass="text-[#173A6A]"
              isLoading={!isDashboardReady}
            />
            <HeroMini
              icon={<PiggyBank size={16} />}
              iconClass="bg-blue-50 text-blue-600"
              label="Tiết kiệm"
              value={formatVND(savingsSnapshot.totalSavings)}
              valueClass="text-[#173A6A]"
              isLoading={!isDashboardReady}
            />
            <HeroMini
              icon={<Landmark size={16} />}
              iconClass="bg-blue-50 text-blue-600"
              label="Vốn Forex"
              value={formatVND(forexSnapshot.balance)}
              valueClass="text-[#173A6A]"
              isLoading={!isDashboardReady}
            />
            <HeroMini
              icon={<Briefcase size={16} />}
              iconClass="bg-blue-50 text-blue-600"
              label="Đầu tư khác"
              value={formatVND(summary.investmentAssets)}
              valueClass="text-[#173A6A]"
              isLoading={!isDashboardReady}
            />
            <HeroMini
              icon={<CreditCard size={16} />}
              iconClass="bg-blue-50 text-blue-600"
              label="Nợ phải trả"
              value={formatVND(summary.totalDebt)}
              valueClass={summary.totalDebt > 0 ? "text-rose-500" : "text-[#173A6A]"}
              isLoading={!isDashboardReady}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100/80 bg-[#F9FBFF] p-3.5 shadow-[0_6px_18px_rgba(37,99,235,0.05)] sm:mt-5 sm:rounded-3xl sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-[#23466F]">
                  Biến động tài sản ròng
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500 sm:text-xs">
                  Snapshot Net Worth đã ghi nhận đến kỳ đang xem trong năm {selectedYear}.
                </p>
              </div>

              {netWorthTrendReady && hasNetWorthHistoryComparison ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    So với snapshot trước
                  </p>
                  <p
                    className={`text-sm font-black ${
                      netWorthHistorySummary.changeFromPrevious! >= 0
                        ? "text-emerald-600"
                        : "text-rose-500"
                    }`}
                  >
                    {netWorthHistorySummary.changeFromPrevious! >= 0 ? "+" : ""}
                    {formatVND(netWorthHistorySummary.changeFromPrevious!)}
                  </p>
                </div>
              ) : null}
            </div>

            {!netWorthTrendReady ? (
              <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100 sm:h-32 sm:rounded-2xl" />
            ) : !hasNetWorthHistoryData ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3.5 sm:rounded-2xl sm:p-4">
                <p className="text-sm font-black text-slate-700">
                  Chưa có lịch sử tài sản ròng
                </p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500 sm:text-xs sm:leading-5">
                  Chưa có snapshot Net Worth nào được ghi nhận cho kỳ đang xem.
                  Hệ thống không tự dựng số liệu cho các tháng chưa từng được lưu.
                </p>
              </div>
            ) : netWorthHistorySummary.snapshotCount === 1 ? (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/45 p-3.5 sm:rounded-2xl sm:p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">
                      Snapshot đã ghi nhận
                    </p>
                    <p className="mt-1.5 text-lg font-black tracking-tight tabular-nums text-[#173A6A] sm:text-xl">
                      {formatVND(Number(netWorthHistorySummary.latestPoint!.value))}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500 sm:text-xs">
                      Tháng {String(netWorthHistorySummary.latestPoint!.month).padStart(2, "0")}/{selectedYear}
                    </p>
                  </div>
                  <div className="sm:max-w-56 sm:text-right">
                    <p className="text-xs font-bold text-slate-600">
                      Chưa đủ dữ liệu để so sánh
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                      Cần ít nhất 2 snapshot ở các tháng khác nhau.
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 border-t border-blue-100 pt-2.5 text-[10px] leading-4 text-slate-500 sm:text-[11px]">
                  Lịch sử bắt đầu từ tháng {String(netWorthHistorySummary.firstPoint!.month).padStart(2, "0")}/{selectedYear}; tháng chưa ghi nhận vẫn là dữ liệu chưa biết.
                </p>
              </div>
            ) : (
              <NetWorthTrendChart trend={netWorthTrend} />
            )}
          </div>
        </div>
      </section>

      {/* Operating KPIs */}
      <section>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:px-0 xl:grid-cols-5">
          {kpiCards.map((item) => (
            <KpiCard
              key={item.title}
              {...item}
              isLoading={!item.ready}
              onClick={item.href ? () => router.push(item.href!) : undefined}
            />
          ))}
        </div>
      </section>

      {/* UI-DASH-2: Budget Attention — closes the Dashboard's only P0
          information gap identified in the audit ("which budget is
          actually in trouble", not just the aggregate % Tiến độ tháng
          already shows below). Uses the SAME active-month budget subset
          (`dashboardMonthKey`) and the canonical
          calculateBudgetSpendingCollection engine via
          buildDashboardBudgetAttention — no independent spend
          calculation, no new query (budgets/categories/transactions are
          already fetched by reloadData). Secondary in the existing
          load-priority sense: budgets were never part of the critical
          path (PERF-1) and remain so.
          Gated on budgetAttentionReady (budgets ever loaded AND
          cashFlowReady — see the Readiness Correctness patch): before
          that, `budgets`/`transactions` may still be an unresolved
          initial `[]` or a still-held prior year's snapshot, and rendering
          straight off them could show a fake "no budgets" or a fake
          healthy/zero result for the wrong period. This gate is
          presentation-only for this one surface — it is never consulted
          by isHeroReady/isDashboardReady, so budgets remain
          non-critical-path. */}
      {/* Budget attention */}
      <section>
        <div className="rounded-3xl sm:rounded-4xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Ngân sách
              </p>
              <h2 className="mt-2 text-xl font-black text-[#23466F]">
                Tình trạng ngân sách
              </h2>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Wallet size={18} />
            </div>
          </div>

          {!budgetAttentionReady ? (
            <div className="mt-4 space-y-3">
              <div className="h-7 w-40 animate-pulse rounded-full bg-slate-100" />
              <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ) : budgetAttention.totalBudgets === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <p className="text-sm font-black text-slate-700">
                {budgets.length === 0
                  ? "Chưa có ngân sách nào"
                  : `Chưa có ngân sách cho tháng ${selectedMonth}/${selectedYear}`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Thiết lập ngân sách theo danh mục để Dashboard theo dõi hạn
                mức chi tiêu.
              </p>
              <button
                type="button"
                onClick={() => router.push(buildBudgetsHref())}
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-center text-sm font-black text-blue-700 transition-all duration-200 hover:border-blue-300 hover:bg-blue-100"
              >
                Thiết lập ngân sách
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    budgetAttention.overBudgetCount > 0
                      ? "bg-rose-50 text-rose-700"
                      : budgetAttention.warningCount > 0
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {budgetAttention.overBudgetCount > 0
                    ? `${budgetAttention.overBudgetCount}/${budgetAttention.totalBudgets} ngân sách vượt hạn mức`
                    : budgetAttention.warningCount > 0
                      ? `${budgetAttention.warningCount}/${budgetAttention.totalBudgets} ngân sách sắp chạm giới hạn`
                      : `${budgetAttention.totalBudgets}/${budgetAttention.totalBudgets} ngân sách đang trong hạn mức`}
                </span>
              </div>

              {budgetAttention.overBudgetItems.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {budgetAttention.overBudgetItems.map((item) => (
                    <button
                      key={item.budgetId}
                      type="button"
                      onClick={() =>
                        router.push(
                          buildBudgetsHref({ budgetId: item.budgetId }),
                        )
                      }
                      className="w-full rounded-2xl bg-slate-50/80 p-3 text-left transition-all duration-200 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-bold text-slate-700">
                          {item.categoryName}
                        </span>
                        <span className="shrink-0 text-xs font-black text-rose-500">
                          Vượt ngân sách
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Đã chi {formatVND(item.spent)} /{" "}
                        {formatVND(item.limit)} · vượt{" "}
                        {formatVND(item.overAmount)}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                budgetAttention.topWarning && (
                  <div className="mt-3 rounded-2xl bg-slate-50/80 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-bold text-slate-700">
                        {budgetAttention.topWarning.categoryName}
                      </span>
                      <span className="shrink-0 text-xs font-black text-amber-600">
                        Sắp đạt giới hạn
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Đã chi {formatVND(budgetAttention.topWarning.spent)} /{" "}
                      {formatVND(budgetAttention.topWarning.limit)} ·{" "}
                      {budgetAttention.topWarning.usagePercent}%
                    </p>
                  </div>
                )
              )}

              <button
                type="button"
                onClick={() =>
                  router.push(
                    budgetAttention.overBudgetItems.length > 1
                      ? buildBudgetsHref()
                      : budgetAttention.worstOffender
                        ? buildBudgetsHref({
                            budgetId: budgetAttention.worstOffender.budgetId,
                          })
                        : buildBudgetsHref(),
                  )
                }
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-center text-sm font-black text-blue-700 transition-all duration-200 hover:border-blue-300 hover:bg-blue-100"
              >
                Xem ngân sách
              </button>
            </>
          )}
        </div>
      </section>

      {/* UI-DASH-1: monthly progress is HIGH priority per the audit (it
          already connects calendar progress to budget usage, not just a
          calendar widget) — moved up from the bottom half of the page.
          Content and calculation (`monthlyPulse`) unchanged. */}
      {/* Monthly progress */}
      <section>
        <div className="rounded-3xl sm:rounded-4xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Tiến độ tháng
              </p>
              <h2 className="mt-2 text-xl font-black text-[#23466F]">
                Tiến độ tháng {monthlyPulse.month}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Ngày {monthlyPulse.elapsedDays}/{monthlyPulse.daysInMonth}
              </p>
            </div>
            <CalendarClock className="text-blue-600" size={24} />
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-linear-to-r from-blue-500 to-cyan-400"
              style={{ width: `${Math.min(monthlyPulse.progress, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs font-bold text-slate-500">
            <span>{monthlyPulse.progress}% thời gian</span>
            <span>
              {monthlyPulse.daysInMonth - monthlyPulse.elapsedDays} ngày còn lại
            </span>
          </div>

          {/* DASH-POLISH-1: monthlyPulse's expense/budget fields depend on
              transactions + budgets for the selected period — gated on
              monthlyProgressReady so a pre-fetch/mid-year-switch render
              cannot show "0đ"/"0%" indistinguishable from a legitimate
              zero. The calendar fields above (elapsed days/progress %)
              have no such dependency and stay always visible. */}
          {monthlyProgressReady ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniStat
                label="Đã chi"
                value={formatVND(monthlyPulse.expense)}
                color="text-rose-500"
              />
              <MiniStat
                label="Dự báo cuối tháng"
                value={formatVND(monthlyPulse.projectedExpense)}
                color="text-blue-600"
              />
              <MiniStat
                label="Dùng ngân sách"
                value={
                  monthlyPulse.budgetLimit > 0
                    ? `${monthlyPulse.budgetUsage}%`
                    : "Chưa lập"
                }
                color={
                  monthlyPulse.budgetUsage > 100
                    ? "text-rose-500"
                    : "text-emerald-600"
                }
              />
              <MiniStat
                label="Dự báo ngân sách"
                value={
                  monthlyPulse.budgetLimit > 0
                    ? `${monthlyPulse.projectedBudgetUsage}%`
                    : "—"
                }
                color={
                  monthlyPulse.projectedBudgetUsage > 100
                    ? "text-rose-500"
                    : "text-emerald-600"
                }
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          )}
        </div>
      </section>

      {/* Cash flow and structure */}
      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Dòng tiền trong kỳ"
          subtitle="Thu nhập, chi tiêu và phần tiền còn lại theo bộ lọc thời gian"
        >
          {/* summary.income/expense, cashFlowData, and allocation5030 are all
              derived from `transactions`, a period (year-scoped) dataset —
              gate on cashFlowReady (the existing "transactions belong to the
              currently selected year" signal) so a still-held prior year's
              transactions cannot render as this year's cash flow while a
              year switch's period fetch is still pending. */}
          {cashFlowReady ? (
            <>
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

              <CashFlowChart data={cashFlowData} />
            </>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
              </div>
              <div className="mt-3 h-44 animate-pulse rounded-2xl bg-slate-100" />
            </>
          )}

          <div className="mt-5 rounded-2xl bg-slate-50/80 p-4">
            <p className="text-sm font-black text-[#23466F]">
              Quy tắc 50/30/20
            </p>
            <p className="mt-1 text-xs text-slate-600">
              So sánh phân bổ thu nhập theo quy tắc 50% Thiết yếu · 30% Mong
              muốn · 20% Tiết kiệm & Đầu tư.
            </p>
            {cashFlowReady ? (
              <div className="mt-4">
                <AllocationRow
                  kind="needs"
                  label="Thiết yếu"
                  actual={allocation5030.needs}
                  target={50}
                  amount={allocation5030.needsAmount}
                  color="bg-blue-500"
                />
                <AllocationRow
                  kind="wants"
                  label="Mong muốn"
                  actual={allocation5030.wants}
                  target={30}
                  amount={allocation5030.wantsAmount}
                  color="bg-violet-500"
                />
                <AllocationRow
                  kind="savings"
                  label="Tiết kiệm & Đầu tư"
                  actual={allocation5030.savings}
                  target={20}
                  amount={allocation5030.savingsAmount}
                  color="bg-emerald-500"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="h-8 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-8 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-8 animate-pulse rounded-xl bg-slate-100" />
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Cấu trúc tài chính"
          subtitle="4 chỉ số cốt lõi giúp kiểm soát chất lượng dòng tiền"
        >
          {/* DASH-POLISH-1: gated on financialStructureReady (union of
              cashFlowReady + savingInvestmentReady — see that memo's own
              comment) so a pre-fetch/mid-year-switch render cannot show
              validated-looking percentages derived from a still-default
              or stale-period transaction/allocation set. */}
          {financialStructureReady ? (
            <div className="mt-4 min-w-0 space-y-3">
              {financialStructureCards.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#23466F]">
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {item.amount}
                      </p>
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
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/95">
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
          ) : (
            <div className="mt-4 space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          )}
        </Panel>
      </section>

      {/* UI-DASH-1: moved down from leading the page — upcoming recurring
          items and top spending categories are useful context (MEDIUM
          priority) but not the primary Dashboard job. Content, readiness
          gating (cashFlowReady on top spending), and empty states
          unchanged. */}
      <section className="grid items-start gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="Sắp đến hạn trong 30 ngày"
          subtitle="Thu nhập và chi phí định kỳ dựa trên ngày chạy tiếp theo"
        >
          <div className="mt-4 space-y-2">
            {upcomingMoneyEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 sm:p-5 text-center">
                <ReceiptText className="mx-auto text-slate-300" size={24} />
                <p className="mt-2 text-sm font-black text-slate-700">
                  Chưa có khoản định kỳ sắp tới
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Bật giao dịch định kỳ và đặt ngày chạy tiếp theo để theo dõi
                  tại đây.
                </p>
              </div>
            ) : (
              upcomingMoneyEvents.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#23466F]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.date.toLocaleDateString("vi-VN")} ·{" "}
                      {item.categoryName}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-black ${item.type === "income" ? "text-emerald-600" : "text-rose-500"}`}
                  >
                    {item.type === "income" ? "+" : "−"}
                    {formatVND(item.amount)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title="Danh mục chi tiêu lớn nhất"
          subtitle="Top danh mục trong tháng hiện tại để nhận diện nơi cần tối ưu"
        >
          <div className="mt-4 space-y-3">
            {!cashFlowReady ? (
              <>
                <div className="h-9 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-9 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-9 animate-pulse rounded-xl bg-slate-100" />
              </>
            ) : topSpendingCategories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 sm:p-5 text-center text-sm text-slate-500">
                Chưa có chi tiêu trong tháng này.
              </div>
            ) : (
              topSpendingCategories.map((item, index) => {
                const maxAmount = topSpendingCategories[0]?.amount || 1;
                const width = Math.max(
                  8,
                  Math.round((item.amount / maxAmount) * 100),
                );
                return (
                  <div key={item.categoryId}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-bold text-slate-700">
                        {index + 1}. {item.name}
                      </span>
                      <span className="shrink-0 font-black text-[#23466F]">
                        {formatVND(item.amount)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-violet-500 to-blue-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>
      </section>

      {/* Forex + goals + recent activity */}
      <section className="grid min-w-0 max-w-full gap-4 sm:gap-5 xl:grid-cols-3 *:min-w-0">
        <Panel
          title="Tài khoản Forex"
          subtitle="Vốn đã nạp, Equity hiện tại và hiệu suất giao dịch"
        >
          <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2">
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
                    ? "text-slate-600"
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
                    ? "text-slate-600"
                    : forexSnapshot.roi >= 0
                      ? "text-emerald-600"
                      : "text-rose-500"
                }
              />
            </div>
            <div className="flex max-w-full items-start gap-1.5 rounded-xl bg-violet-50/70 px-3 py-2 text-[11px] leading-4 text-violet-700">
              <Info size={12} className="mt-0.5 shrink-0" />
              <p>
                <span className="font-bold">Lời/lỗ</span> = Equity hiện tại −
                Vốn ròng. Phí giao dịch đã trừ khỏi vốn ròng.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/investments")}
            className="mt-5 flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl bg-linear-to-r from-violet-600 to-blue-600 px-3 py-3 text-center text-sm font-black leading-5 text-white shadow-lg shadow-violet-100 transition-all duration-200 hover:from-violet-700 hover:to-blue-700 sm:px-4"
          >
            <span className="max-w-full wrap-break-word">
              Quản lý tài khoản Forex
            </span>
          </button>
        </Panel>

        <Panel
          title="Mục tiêu tài chính"
          subtitle={`${goalSnapshot.trackedCount} mục tiêu · tiến độ trung bình ${summary.goalScore}%`}
        >
          <div className="mt-5 min-h-0 min-w-0 flex-1 space-y-3">
            {goalRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 sm:p-5 text-center">
                <p className="text-sm font-black text-slate-700">
                  Chưa có mục tiêu
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Tạo mục tiêu để theo dõi tiến độ và số tiền cần góp mỗi tháng.
                </p>
              </div>
            ) : (
              goalRows.slice(0, 3).map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() =>
                    router.push(buildGoalsHref({ goalId: goal.id }))
                  }
                  className="w-full min-w-0 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-left transition-all duration-200 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:p-4"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-black text-[#23466F]">
                      {goal.name}
                    </p>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-600">
                      {goal.percent}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {formatVND(goal.effectiveCurrentAmount)} /{" "}
                    {formatVND(goal.targetAmount)}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/95">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-blue-500 to-cyan-400"
                      style={{ width: `${goal.percent}%` }}
                    />
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push(buildGoalsHref())}
            className="mt-5 flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-center text-sm font-black leading-5 text-blue-700 transition-all duration-200 hover:border-blue-300 hover:bg-blue-100 sm:px-4"
          >
            <span className="max-w-full wrap-break-word">
              Xem tất cả mục tiêu
            </span>
          </button>
        </Panel>

        <Panel
          title="Giao dịch gần đây"
          subtitle="5 hoạt động mới nhất, đã loại chuyển nội bộ"
        >
          <div className="mt-5 min-h-0 flex-1 space-y-3">
            {recentTxnGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 sm:p-5 text-center">
                <p className="text-sm font-black text-slate-700">
                  Chưa có giao dịch trong kỳ
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Thêm thu nhập hoặc chi tiêu để Dashboard cập nhật.
                </p>
              </div>
            ) : (
              recentTxnGroups.map((group) => (
                <div key={group.dayLabel}>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    {group.dayLabel}
                  </p>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                      >
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
                          <p className="truncate text-sm font-bold text-[#23466F]">
                            {transaction.title}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {transaction.subtitle}
                            {transaction.timeLabel
                              ? ` · ${transaction.timeLabel}`
                              : ""}
                          </p>
                        </div>
                        <p
                          className={`col-start-2 min-w-0 whitespace-nowrap text-[clamp(11px,3.1vw,14px)] font-black tracking-[-0.035em] tabular-nums sm:col-start-auto sm:shrink-0 ${getRecentAmountClass(transaction.kind)}`}
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
            onClick={() =>
              router.push(buildTransactionsHref({ month: dashboardMonthKey }))
            }
            className="mt-5 flex min-h-11 w-full min-w-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-center text-sm font-black leading-5 text-blue-700 transition-all duration-200 hover:border-blue-300 hover:bg-blue-100 sm:px-4"
          >
            <span className="max-w-full wrap-break-word">
              Xem tất cả giao dịch
            </span>
          </button>
        </Panel>
      </section>

      {/* UI-DASH-1: today's daily pulse is LOW/supporting priority per the
          audit (a single day's numbers rarely change a decision) — moved
          from leading the page to the end. Content/semantics unchanged. */}
      {/* Today's summary */}
      <section>
        <div className="relative overflow-hidden rounded-3xl sm:rounded-4xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:p-6">
          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-blue-600 via-sky-500 to-cyan-400" />
          <div className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-blue-50 blur-3xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                Tổng quan tài chính
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-[#173A6A] sm:text-3xl">
                Tổng quan hôm nay
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Snapshot vận hành, dự báo cuối tháng và việc cần ưu tiên.
              </p>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DailyMetric
              label="Thu hôm nay"
              value={formatVND(todaySnapshot.income)}
              tone="good"
            />
            <DailyMetric
              label="Chi hôm nay"
              value={formatVND(todaySnapshot.expense)}
              tone="danger"
            />
            <DailyMetric
              label="Đã tiết kiệm"
              value={formatVND(todaySnapshot.saving)}
              tone="saving"
            />
            <DailyMetric
              label="Ròng hôm nay"
              value={`${todaySnapshot.net >= 0 ? "+" : ""}${formatVND(todaySnapshot.net)}`}
              tone={todaySnapshot.net >= 0 ? "good" : "danger"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DailyMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "danger" | "saving";
}) {
  const styles =
    tone === "good"
      ? {
          card: "border-emerald-100 bg-emerald-50/70",
          label: "text-emerald-700",
          value: "text-emerald-600",
          dot: "bg-emerald-500",
        }
      : tone === "danger"
        ? {
            card: "border-rose-100 bg-rose-50/70",
            label: "text-rose-700",
            value: "text-rose-500",
            dot: "bg-rose-500",
          }
        : {
            card: "border-cyan-100 bg-cyan-50/70",
            label: "text-cyan-700",
            value: "text-cyan-600",
            dot: "bg-cyan-500",
          };

  return (
    <div
      className={`min-w-0 rounded-2xl border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${styles.card}`}
    >
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${styles.dot}`} />
        <p className={`truncate text-[11px] font-bold ${styles.label}`}>
          {label}
        </p>
      </div>
      <p
        className={`mt-2 whitespace-nowrap text-[clamp(10px,3.15vw,16px)] font-black leading-none tracking-[-0.04em] tabular-nums ${styles.value}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function HeroMini({
  icon,
  iconClass = "bg-blue-50 text-blue-600",
  label,
  value,
  valueClass,
  isLoading = false,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  label: string;
  value: string;
  valueClass: string;
  isLoading?: boolean;
}) {
  return (
    <div className="min-h-[78px] min-w-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white p-3 shadow-[0_6px_18px_rgba(37,99,235,0.06)] sm:min-h-0 sm:overflow-visible sm:rounded-2xl sm:px-2.5 sm:py-3 sm:transition-all sm:duration-200 sm:hover:-translate-y-0.5 sm:hover:shadow-md">
      <div className="flex h-full min-w-0 items-center gap-2.5 sm:h-auto sm:gap-2">
        <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-7 ${iconClass}`}>
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-[11.5px] font-semibold leading-tight tracking-[-0.01em] text-slate-500 sm:line-clamp-1 sm:text-[9px] sm:leading-3.5 sm:tracking-normal xl:text-[8px] 2xl:text-[10px]">
            {label}
          </p>
          {isLoading ? (
            <div className="mt-1.5 h-4 w-16 animate-pulse rounded-md bg-slate-200/80 sm:mt-1 sm:h-3.5" />
          ) : (
            <p
              className={`mt-1 whitespace-nowrap text-[clamp(12px,3.3vw,15px)] font-black leading-5 tracking-[-0.035em] tabular-nums sm:mt-0.5 sm:text-[clamp(8px,2.35vw,13px)] sm:leading-4 sm:tracking-[-0.045em] ${valueClass}`}
              title={value}
            >
              {value}
            </p>
          )}
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
  isLoading = false,
  onClick,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
  tone: "good" | "warning" | "danger" | "neutral";
  isLoading?: boolean;
  /** UI-DASH-3: when present, the whole card becomes a single semantic
   * interactive element. Omit (or pass undefined) to keep the card
   * non-interactive — some KPIs legitimately have no unambiguous
   * destination (see kpiCards' own per-card comments). */
  onClick?: () => void;
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
      icon: "bg-slate-100 text-slate-600",
      border: "border-slate-200",
    },
  } as const;
  const styles = toneStyles[tone];

  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-600">{title}</p>
        {isLoading ? (
          <>
            <div className="mt-2 h-5 w-20 animate-pulse rounded-lg bg-slate-200/80" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded-md bg-slate-100" />
          </>
        ) : (
          <>
            <p
              className={`mt-2 whitespace-nowrap text-[clamp(15px,4vw,20px)] font-black leading-none tracking-[-0.04em] tabular-nums ${styles.value}`}
              title={value}
            >
              {value}
            </p>
            <p className="mt-1 truncate text-xs text-slate-500">{note}</p>
          </>
        )}
      </div>
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
      >
        <Icon size={18} />
      </div>
    </div>
  );

  if (onClick && !isLoading) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Xem chi tiết: ${title}`}
        className={`min-w-52 cursor-pointer overflow-hidden rounded-2xl border bg-white/95 p-3.5 text-left shadow-sm transition-all duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:p-4 md:min-w-0 ${styles.border}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`min-w-52 overflow-hidden rounded-2xl border bg-white/95 p-3.5 shadow-sm transition-all duration-200 hover:shadow-md sm:p-4 md:min-w-0 ${styles.border}`}
    >
      {content}
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
    <div className="flex h-full min-w-0 max-w-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm transition-all duration-200 hover:shadow-md sm:rounded-4xl sm:p-6">
      <div>
        <h3 className="wrap-break-word text-lg font-black leading-tight text-[#23466F]">
          {title}
        </h3>
        <p className="mt-1 min-h-10 max-w-full wrap-break-word text-sm leading-5 text-slate-600">
          {subtitle}
        </p>
      </div>
      <div className="flex min-w-0 max-w-full flex-1 flex-col">{children}</div>
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
    <div className="min-w-0 max-w-full overflow-hidden rounded-2xl bg-slate-50/80 px-2.5 py-3 sm:px-3">
      <p className="truncate text-xs text-slate-600">{label}</p>
      <p
        className={`mt-1 whitespace-nowrap text-[clamp(10px,2.9vw,14px)] font-black leading-5 tracking-[-0.04em] tabular-nums ${color}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

type AllocationKind = "needs" | "wants" | "savings";

function AllocationRow({
  kind,
  label,
  actual,
  target,
  amount,
  color,
}: {
  kind: AllocationKind;
  label: string;
  actual: number;
  target: number;
  amount: number;
  color: string;
}) {
  const roundedActual = Math.max(0, Math.round(actual));
  const roundedTarget = Math.max(0, Math.round(target));
  const difference = Math.abs(roundedActual - roundedTarget);
  const isSavings = kind === "savings";
  const isPositive = isSavings
    ? roundedActual >= roundedTarget
    : roundedActual <= roundedTarget;

  const statusText = (() => {
    if (roundedActual === roundedTarget) return "Đạt mục tiêu";

    if (isSavings) {
      return roundedActual > roundedTarget
        ? `Vượt mục tiêu ${difference}%`
        : `Thiếu ${difference}%`;
    }

    return roundedActual > roundedTarget
      ? `Cần giảm ${difference}%`
      : `Còn dư ${difference}%`;
  })();

  const statusClass = isPositive ? "text-emerald-600" : "text-rose-500";
  const barClass = isPositive ? color : "bg-rose-500";

  return (
    <div className="mb-3">
      <div className="mb-1 flex flex-col gap-1.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="font-medium text-slate-600">
          {label}: {roundedActual}% / {roundedTarget}%
          <span className="ml-1 text-slate-500">({formatVND(amount)})</span>
        </span>
        <span className={`shrink-0 font-bold ${statusClass}`}>
          {statusText}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white/95">
        <div
          className="absolute top-0 z-10 h-full border-l border-slate-400/60"
          style={{ left: `${Math.min(roundedTarget, 100)}%` }}
        />
        <div
          className={`h-full rounded-full ${barClass} transition-all duration-300`}
          style={{ width: `${Math.min(roundedActual, 100)}%` }}
        />
      </div>
    </div>
  );
}
