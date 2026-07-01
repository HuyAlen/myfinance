"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  BriefcaseBusiness,
  Download,
  FileText,
  Landmark,
  PieChart as PieChartIcon,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
  SavingAccount,
} from "@/src/types/finance";
import {
  getBudgets,
  getCategories,
  getDebts,
  getGoals,
  getInvestments,
  getTransactions,
  getWallets,
  initFinanceDemoData,
} from "@/src/services/finance/financeStorage";
import {
  formatVND,
  getDebtRatio,
  getGoalEffectiveCurrentAmount,
  getGoalScore,
  getTotalAssets,
  getTotalDebt,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import { computeHealthScoreV2 } from "@/src/services/finance/analytics/healthScore";
import { computeRiskScore } from "@/src/services/finance/analytics/riskAnalytics";
import { computeFinancialForecast } from "@/src/services/finance/analytics/forecastEngine";
import { computeSmartBudget } from "@/src/services/finance/analytics/smartBudget";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  "#2563eb",
  "#10b981",
  "#f43f5e",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#94a3b8",
];

const INV_TYPE_COLORS: Record<string, string> = {
  stock: "#2563eb",
  crypto: "#f97316",
  fund: "#10b981",
  gold: "#f59e0b",
  other: "#94a3b8",
};
const INV_TYPE_LABEL: Record<string, string> = {
  stock: "Cổ phiếu",
  crypto: "Crypto",
  fund: "Quỹ đầu tư",
  gold: "Vàng",
  other: "Khác",
};

type SavingRow = {
  id: string;
  name: string;
  type?: SavingAccount["type"] | string | null;
  balance?: number | string | null;
  principal?: number | string | null;
  principal_amount?: number | string | null;
  initial_amount?: number | string | null;
  opening_amount?: number | string | null;
  deposit_amount?: number | string | null;
  interest_rate?: number | string | null;
  maturity_date?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type ReportSaving = SavingAccount & {
  principal?: number;
  initialAmount?: number;
  createdAt?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const financeSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getSavingPrincipal(row: SavingRow | ReportSaving): number {
  const source = row as SavingRow & ReportSaving;
  return toNumber(
    source.principal ??
      source.principal_amount ??
      source.initialAmount ??
      source.initial_amount ??
      source.opening_amount ??
      source.deposit_amount ??
      source.balance,
  );
}

function getSavingBalance(row: ReportSaving): number {
  return toNumber(row.balance);
}

function mapSavingRow(row: SavingRow): ReportSaving {
  const principal = getSavingPrincipal(row);
  return {
    id: row.id,
    name: row.name,
    type: (row.type ?? "saving") as SavingAccount["type"],
    balance: toNumber(row.balance),
    principal,
    initialAmount: principal,
    interestRate:
      row.interest_rate === null || row.interest_rate === undefined
        ? undefined
        : toNumber(row.interest_rate),
    maturityDate: row.maturity_date ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at ?? undefined,
  };
}

function formatCompactVND(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return sign + (abs / 1_000_000_000).toFixed(1).replace(".0", "") + "B đ";
  }
  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(1).replace(".0", "") + "M đ";
  }
  if (abs >= 1_000) {
    return sign + Math.round(abs / 1_000) + "K đ";
  }
  return formatVND(value);
}

function formatMillionTooltip(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0 đ";
  return formatVND(Math.round(n * 1_000_000));
}

function normalizeReportText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function getSupabaseSavingAmountForReportGoal(
  goal: Goal,
  savingRows: ReportSaving[],
) {
  const linkedSavingIds = new Set(goal.savingCategoryIds ?? []);
  const selectedSavingsAmount = savingRows.reduce((sum, saving) => {
    if (!linkedSavingIds.has(saving.id)) return sum;
    return sum + getSavingBalance(saving);
  }, 0);

  if (selectedSavingsAmount > 0) return selectedSavingsAmount;

  const goalName = normalizeReportText(goal.name);
  return savingRows.reduce((sum, saving) => {
    const savingName = normalizeReportText(saving.name);
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
      return sum + getSavingBalance(saving);
    }
    return sum;
  }, 0);
}

function isDateInPeriod(
  dateValue: string | undefined | null,
  mode: PeriodMode,
  year: string,
  month: string,
  quarter: string,
  customStart: string,
  customEnd: string,
): boolean {
  if (!dateValue) return false;
  const date = dateValue.slice(0, 10);
  switch (mode) {
    case "month":
      return date.startsWith(year + "-" + month);
    case "quarter": {
      const q = Number(quarter);
      const months = [0, 1, 2].map((offset) =>
        String((q - 1) * 3 + 1 + offset).padStart(2, "0"),
      );
      return months.some((m) => date.startsWith(year + "-" + m));
    }
    case "year":
      return date.startsWith(year);
    case "custom":
      return date >= customStart && date <= customEnd;
  }
}

// ─── Period helpers (preserved) ───────────────────────────────────────────────
type PeriodMode = "month" | "quarter" | "year" | "custom";
type ReportTab =
  | "overview"
  | "income"
  | "expense"
  | "cashflow"
  | "investment"
  | "goals"
  | "ai";

function filterByPeriod(
  txns: Transaction[],
  mode: PeriodMode,
  year: string,
  month: string,
  quarter: string,
  customStart: string,
  customEnd: string,
): Transaction[] {
  switch (mode) {
    case "month":
      return txns.filter((t) => t.date.startsWith(year + "-" + month));
    case "quarter": {
      const q = Number(quarter);
      const months = [
        String((q - 1) * 3 + 1).padStart(2, "0"),
        String((q - 1) * 3 + 2).padStart(2, "0"),
        String((q - 1) * 3 + 3).padStart(2, "0"),
      ];
      return txns.filter((t) =>
        months.some((m) => t.date.startsWith(year + "-" + m)),
      );
    }
    case "year":
      return txns.filter((t) => t.date.startsWith(year));
    case "custom":
      return txns.filter((t) => t.date >= customStart && t.date <= customEnd);
  }
}

function periodLabel(
  mode: PeriodMode,
  year: string,
  month: string,
  quarter: string,
  customStart: string,
  customEnd: string,
): string {
  switch (mode) {
    case "month":
      return "T" + Number(month) + "/" + year;
    case "quarter":
      return "Q" + quarter + "/" + year;
    case "year":
      return "Năm " + year;
    case "custom":
      return customStart + " → " + customEnd;
  }
}

function normalizeVietnamese(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function getCategoryOfTransaction(
  transaction: Transaction,
  categories: Category[],
): Category | undefined {
  return categories.find((category) => category.id === transaction.categoryId);
}

function isSavingCategory(category?: Category): boolean {
  if (!category) return false;
  const planningGroup = String(category.planningGroup ?? "");
  const name = normalizeVietnamese(category.name ?? "");

  return (
    planningGroup === "saving" ||
    name.includes("tiet kiem") ||
    name.includes("quy") ||
    name.includes("du phong") ||
    name.includes("tich luy")
  );
}

function isInvestmentCategory(category?: Category): boolean {
  if (!category) return false;
  const planningGroup = String(category.planningGroup ?? "");
  const name = normalizeVietnamese(category.name ?? "");

  return (
    planningGroup === "investment" ||
    name.includes("dau tu") ||
    name.includes("trading") ||
    name.includes("forex") ||
    name.includes("exness") ||
    name.includes("crypto") ||
    name.includes("vang") ||
    name.includes("co phieu") ||
    name.includes("chung khoan")
  );
}

function isSavingTransaction(
  transaction: Transaction,
  categories: Category[],
): boolean {
  const type = String(transaction.type);
  return (
    type === "saving" ||
    (type === "expense" &&
      isSavingCategory(getCategoryOfTransaction(transaction, categories)))
  );
}

function isInvestmentTransaction(
  transaction: Transaction,
  categories: Category[],
): boolean {
  const type = String(transaction.type);
  return (
    type === "investment" ||
    (type === "expense" &&
      isInvestmentCategory(getCategoryOfTransaction(transaction, categories)))
  );
}

function isRealExpenseTransaction(
  transaction: Transaction,
  categories: Category[],
): boolean {
  return (
    String(transaction.type) === "expense" &&
    !isSavingTransaction(transaction, categories) &&
    !isInvestmentTransaction(transaction, categories)
  );
}

function sumTransactions(transactions: Transaction[]): number {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
}

function getRealExpenseTotal(
  transactions: Transaction[],
  categories: Category[],
): number {
  return sumTransactions(
    transactions.filter((transaction) =>
      isRealExpenseTransaction(transaction, categories),
    ),
  );
}

function getSavingCapitalTotal(
  transactions: Transaction[],
  categories: Category[],
): number {
  return sumTransactions(
    transactions.filter((transaction) =>
      isSavingTransaction(transaction, categories),
    ),
  );
}

function getInvestmentCapitalTotal(
  transactions: Transaction[],
  categories: Category[],
): number {
  return sumTransactions(
    transactions.filter((transaction) =>
      isInvestmentTransaction(transaction, categories),
    ),
  );
}

function getRealSpendingByCategory(
  transactions: Transaction[],
  categories: Category[],
) {
  const realExpenses = transactions.filter((transaction) =>
    isRealExpenseTransaction(transaction, categories),
  );
  const total = sumTransactions(realExpenses);
  const map = new Map<string, number>();

  for (const transaction of realExpenses) {
    const category = getCategoryOfTransaction(transaction, categories);
    const name = category?.name ?? "Khác";
    map.set(name, (map.get(name) ?? 0) + transaction.amount);
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      value,
      percent: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [savings, setSavings] = useState<ReportSaving[]>([]);

  // Period filter state (preserved)
  const [periodMode, setPeriodMode] = useState<PeriodMode>("year");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("06");
  const [quarter, setQuarter] = useState("2");
  const [customStart, setCustomStart] = useState("2026-01-01");
  const [customEnd, setCustomEnd] = useState("2026-12-31");

  // UI state
  const [stmtTab, setStmtTab] = useState<"income" | "cashflow" | "networth">(
    "income",
  );
  const [reportTab, setReportTab] = useState<ReportTab>("overview");

  useEffect(() => {
    async function load() {
      await initFinanceDemoData();
      const [w, inv, cat, txn, dbt, gls, bdg, savingResult] = await Promise.all(
        [
          getWallets(),
          getInvestments(),
          getCategories(),
          getTransactions(),
          getDebts(),
          getGoals(),
          getBudgets(),
          financeSupabase
            ? financeSupabase
                .from("savings")
                .select("*")
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
        ],
      );
      setWallets(w);
      setInvestments(inv);
      setCategories(cat);
      setTransactions(txn);
      setDebts(dbt);
      setGoals(gls);
      setBudgets(bdg);
      if (!savingResult.error) {
        setSavings(
          ((savingResult.data ?? []) as SavingRow[]).map(mapSavingRow),
        );
      }
    }
    load();
  }, []);

  // ── Filtered transactions (preserved) ────────────────────────────────────
  const filtered = useMemo(
    () =>
      filterByPeriod(
        transactions,
        periodMode,
        year,
        month,
        quarter,
        customStart,
        customEnd,
      ),
    [transactions, periodMode, year, month, quarter, customStart, customEnd],
  );

  // ── Core summary ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const income = getTotalIncome(filtered);
    const expense = getRealExpenseTotal(filtered, categories);
    const savingAllocationFromTransactions = getSavingCapitalTotal(
      filtered,
      categories,
    );
    const savingAllocationFromSavings = savings
      .filter((saving) =>
        isDateInPeriod(
          saving.createdAt,
          periodMode,
          year,
          month,
          quarter,
          customStart,
          customEnd,
        ),
      )
      .reduce((sum, saving) => sum + getSavingPrincipal(saving), 0);
    const savingAllocation =
      savingAllocationFromSavings > 0
        ? savingAllocationFromSavings
        : savingAllocationFromTransactions;
    const investmentAllocation = getInvestmentCapitalTotal(
      filtered,
      categories,
    );
    const futureAllocation = savingAllocation + investmentAllocation;
    const saving = income - expense;
    const availableAfterFutureAllocation = saving - futureAllocation;
    const savingRate =
      income > 0 ? Math.round((futureAllocation / income) * 1000) / 10 : 0;
    const investmentAssets = investments.reduce(
      (sum, investment) => sum + investment.currentValue,
      0,
    );
    const walletAssets = getTotalAssets(wallets);
    const savingAssets = savings.reduce(
      (sum, saving) => sum + getSavingBalance(saving),
      0,
    );
    const totalAssets = walletAssets + savingAssets + investmentAssets;
    const totalDebt = getTotalDebt(debts);
    const netWorth = totalAssets - totalDebt;
    const debtRatio = getDebtRatio(totalDebt, totalAssets);
    const goalScore = getGoalScore(goals, transactions);

    return {
      income,
      expense,
      saving,
      savingAllocation,
      investmentAllocation,
      futureAllocation,
      availableAfterFutureAllocation,
      savingRate,
      totalAssets,
      totalDebt,
      netWorth,
      investmentAssets,
      savingAssets,
      debtRatio,
      goalScore,
    };
  }, [
    filtered,
    categories,
    wallets,
    investments,
    debts,
    goals,
    savings,
    periodMode,
    year,
    month,
    quarter,
    customStart,
    customEnd,
  ]);

  const incomeExpenseGap = summary.income - summary.expense;

  // ── Monthly breakdown (preserved) ────────────────────────────────────────
  const yearTxns = useMemo(
    () => transactions.filter((t) => t.date.startsWith(year)),
    [transactions, year],
  );

  const monthly = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, "0");
        const mx = yearTxns.filter((t) => t.date.startsWith(year + "-" + m));
        const inc = getTotalIncome(mx);
        const exp = getRealExpenseTotal(mx, categories);
        const savingCapitalFromTransactions = getSavingCapitalTotal(
          mx,
          categories,
        );
        const savingCapitalFromSavings = savings
          .filter((saving) =>
            (saving.createdAt ?? "").startsWith(year + "-" + m),
          )
          .reduce((sum, saving) => sum + getSavingPrincipal(saving), 0);
        const savingCapital =
          savingCapitalFromSavings > 0
            ? savingCapitalFromSavings
            : savingCapitalFromTransactions;
        const investmentCapital = getInvestmentCapitalTotal(mx, categories);
        const futureAllocation = savingCapital + investmentCapital;
        return {
          month: "T" + (i + 1),
          thu: inc / 1e6,
          chi: exp / 1e6,
          tietKiem: savingCapital / 1e6,
          dauTu: investmentCapital / 1e6,
          tichLuy: futureAllocation / 1e6,
          dongTienRong: (inc - exp) / 1e6,
          income: inc,
          expense: exp,
          savingAllocation: savingCapital,
          investmentAllocation: investmentCapital,
          futureAllocation,
          cashFlow: inc - exp,
        };
      }),
    [yearTxns, year, categories, savings],
  );

  // ── Spending breakdown (preserved) ────────────────────────────────────────
  const spendingByCategory = useMemo(
    () => getRealSpendingByCategory(filtered, categories),
    [filtered, categories],
  );
  const spendingPieData = useMemo(
    () =>
      spendingByCategory.map((item, i) => ({
        ...item,
        color: COLORS[i % COLORS.length],
      })),
    [spendingByCategory],
  );

  // ── Comparisons: MoM / QoQ / YoY (preserved) ─────────────────────────────
  const comparisons = useMemo(() => {
    const now = new Date();
    const curM = String(now.getMonth() + 1).padStart(2, "0");
    const prevM = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(
      2,
      "0",
    );
    const prevMYear =
      now.getMonth() === 0 ? String(now.getFullYear() - 1) : year;
    const curMonthTxns = transactions.filter((t) =>
      t.date.startsWith(year + "-" + curM),
    );
    const prevMonthTxns = transactions.filter((t) =>
      t.date.startsWith(prevMYear + "-" + prevM),
    );
    const curQ = Math.floor(now.getMonth() / 3) + 1;
    const prevQ = curQ === 1 ? 4 : curQ - 1;
    const curQMonths = [0, 1, 2].map((x) =>
      String((curQ - 1) * 3 + 1 + x).padStart(2, "0"),
    );
    const prevQMonths = [0, 1, 2].map((x) =>
      String((prevQ - 1) * 3 + 1 + x).padStart(2, "0"),
    );
    const curQYear = year;
    const prevQYear = curQ === 1 ? String(Number(year) - 1) : year;
    const curQTxns = transactions.filter((t) =>
      curQMonths.some((m) => t.date.startsWith(curQYear + "-" + m)),
    );
    const prevQTxns = transactions.filter((t) =>
      prevQMonths.some((m) => t.date.startsWith(prevQYear + "-" + m)),
    );
    const prevYearTxns = transactions.filter((t) =>
      t.date.startsWith(String(Number(year) - 1)),
    );

    function delta(cur: number, prev: number) {
      if (prev === 0) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    }
    return {
      mom: {
        income: delta(
          getTotalIncome(curMonthTxns),
          getTotalIncome(prevMonthTxns),
        ),
        expense: delta(
          getRealExpenseTotal(curMonthTxns, categories),
          getRealExpenseTotal(prevMonthTxns, categories),
        ),
        saving: delta(
          getTotalIncome(curMonthTxns) -
            getRealExpenseTotal(curMonthTxns, categories),
          getTotalIncome(prevMonthTxns) -
            getRealExpenseTotal(prevMonthTxns, categories),
        ),
      },
      qoq: {
        income: delta(getTotalIncome(curQTxns), getTotalIncome(prevQTxns)),
        expense: delta(
          getRealExpenseTotal(curQTxns, categories),
          getRealExpenseTotal(prevQTxns, categories),
        ),
        saving: delta(
          getTotalIncome(curQTxns) - getRealExpenseTotal(curQTxns, categories),
          getTotalIncome(prevQTxns) -
            getRealExpenseTotal(prevQTxns, categories),
        ),
      },
      yoy: {
        income: delta(getTotalIncome(yearTxns), getTotalIncome(prevYearTxns)),
        expense: delta(
          getRealExpenseTotal(yearTxns, categories),
          getRealExpenseTotal(prevYearTxns, categories),
        ),
        saving: delta(
          getTotalIncome(yearTxns) - getRealExpenseTotal(yearTxns, categories),
          getTotalIncome(prevYearTxns) -
            getRealExpenseTotal(prevYearTxns, categories),
        ),
      },
    };
  }, [transactions, year, yearTxns, categories]);

  // ── Analytics engine (preserved) ─────────────────────────────────────────
  const healthV2 = useMemo(
    () =>
      computeHealthScoreV2(
        wallets,
        debts,
        goals,
        investments,
        transactions,
        budgets,
        categories,
      ),
    [wallets, debts, goals, investments, transactions, budgets, categories],
  );
  const riskData = useMemo(
    () => computeRiskScore(wallets, debts, goals, transactions, investments),
    [wallets, debts, goals, transactions, investments],
  );
  const forecast = useMemo(
    () => computeFinancialForecast(wallets, debts, investments, transactions),
    [wallets, debts, investments, transactions],
  );
  const smartBudget = useMemo(
    () => computeSmartBudget(transactions, categories, budgets),
    [transactions, categories, budgets],
  );

  // ── Investment analytics (NEW) ────────────────────────────────────────────
  const totalInvested = useMemo(
    () => investments.reduce((s, inv) => s + inv.investedAmount, 0),
    [investments],
  );
  const displayedInvestmentCapital =
    summary.investmentAssets > 0
      ? summary.investmentAssets
      : summary.investmentAllocation;
  const investmentROI = useMemo(
    () =>
      totalInvested > 0
        ? Math.round(
            ((summary.investmentAssets - totalInvested) / totalInvested) * 100,
          )
        : 0,
    [totalInvested, summary.investmentAssets],
  );
  const invPieData = useMemo(() => {
    const types = ["stock", "crypto", "fund", "gold", "other"] as const;
    return types
      .map((t) => ({
        name: INV_TYPE_LABEL[t],
        value: investments
          .filter((inv) => inv.type === t)
          .reduce((s, inv) => s + inv.currentValue, 0),
        color: INV_TYPE_COLORS[t],
      }))
      .filter((d) => d.value > 0);
  }, [investments]);

  // ── Professional report center data ───────────────────────────────────────
  const monthlyAverages = useMemo(() => {
    const monthsWithData = monthly.filter(
      (m) => m.income > 0 || m.expense > 0 || m.futureAllocation > 0,
    );
    const divisor = Math.max(monthsWithData.length, 1);
    return {
      income: monthsWithData.reduce((sum, m) => sum + m.income, 0) / divisor,
      expense: monthsWithData.reduce((sum, m) => sum + m.expense, 0) / divisor,
      cashFlow:
        monthsWithData.reduce((sum, m) => sum + m.cashFlow, 0) / divisor,
      allocation:
        monthsWithData.reduce((sum, m) => sum + m.futureAllocation, 0) /
        divisor,
      months: monthsWithData.length,
    };
  }, [monthly]);

  const assetAllocationData = useMemo(() => {
    const walletAssets = getTotalAssets(wallets);
    const rows = [
      { name: "Thanh khoản", value: walletAssets, color: "#2563eb" },
      { name: "Tiết kiệm", value: summary.savingAssets, color: "#06b6d4" },
      { name: "Đầu tư", value: summary.investmentAssets, color: "#8b5cf6" },
      { name: "Nợ", value: summary.totalDebt, color: "#f43f5e" },
    ];
    return rows.filter((item) => item.value > 0);
  }, [
    wallets,
    summary.savingAssets,
    summary.investmentAssets,
    summary.totalDebt,
  ]);

  const goalMeta = useMemo(
    () =>
      goals.map((goal) => {
        const supabaseSavingAmount = getSupabaseSavingAmountForReportGoal(
          goal,
          savings,
        );
        const baseCurrent = getGoalEffectiveCurrentAmount({
          goal,
          transactions,
        });
        const effectiveCurrentAmount = Math.max(
          baseCurrent,
          toNumber(goal.currentAmount) + supabaseSavingAmount,
        );
        const remaining = Math.max(
          goal.targetAmount - effectiveCurrentAmount,
          0,
        );
        const pct =
          goal.targetAmount > 0
            ? Math.min(
                Math.round((effectiveCurrentAmount / goal.targetAmount) * 100),
                100,
              )
            : 0;
        const suggestedMonthly =
          remaining > 0 ? Math.ceil(remaining / 12 / 1000) * 1000 : 0;
        const monthsLeft =
          suggestedMonthly > 0 ? Math.ceil(remaining / suggestedMonthly) : 0;
        const status =
          pct >= 100
            ? "Hoàn thành"
            : pct >= 75
              ? "Gần hoàn thành"
              : pct >= 30
                ? "Đang tiến triển"
                : "Đang chậm";
        return {
          ...goal,
          effectiveCurrentAmount,
          remaining,
          pct,
          suggestedMonthly,
          monthsLeft,
          status,
        };
      }),
    [goals, savings, transactions],
  );

  const goalReportScore = useMemo(() => {
    const totalTarget = goalMeta.reduce(
      (sum, goal) => sum + goal.targetAmount,
      0,
    );
    const totalCurrent = goalMeta.reduce(
      (sum, goal) => sum + goal.effectiveCurrentAmount,
      0,
    );
    return totalTarget > 0
      ? Math.min(Math.round((totalCurrent / totalTarget) * 100), 100)
      : 0;
  }, [goalMeta]);

  // ── Export helpers (preserved) ────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      [
        "Tháng",
        "Thu nhập (đ)",
        "Chi phí thật (đ)",
        "Tiết kiệm + Đầu tư (đ)",
        "Dòng tiền sau chi phí (đ)",
      ],
      ...monthly.map((m) => [
        m.month,
        String(Math.round(m.thu * 1e6)),
        String(Math.round(m.chi * 1e6)),
        String(Math.round((m.tichLuy ?? 0) * 1e6)),
        String(Math.round(m.dongTienRong * 1e6)),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "myfinance-report-" + year + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    window.print();
  }

  const label = periodLabel(
    periodMode,
    year,
    month,
    quarter,
    customStart,
    customEnd,
  );
  const YEARS = ["2024", "2025", "2026", "2027", "2028"];
  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: "Tháng " + (i + 1),
  }));
  const QUARTERS = [
    { value: "1", label: "Q1 (T1-T3)" },
    { value: "2", label: "Q2 (T4-T6)" },
    { value: "3", label: "Q3 (T7-T9)" },
    { value: "4", label: "Q4 (T10-T12)" },
  ];

  const healthGrade =
    healthV2.grade === "A"
      ? { gradient: "from-emerald-500 to-green-500", label: healthV2.label }
      : healthV2.grade === "B"
        ? { gradient: "from-cyan-500 to-cyan-600", label: healthV2.label }
        : healthV2.grade === "C"
          ? { gradient: "from-amber-400 to-orange-500", label: healthV2.label }
          : { gradient: "from-rose-500 to-red-500", label: healthV2.label };

  const REPORT_TABS: { id: ReportTab; label: string }[] = [
    { id: "overview", label: "Tổng Quan" },
    { id: "income", label: "Thu Nhập" },
    { id: "expense", label: "Chi Tiêu" },
    { id: "cashflow", label: "Dòng Tiền" },
    { id: "investment", label: "Đầu Tư" },
    { id: "goals", label: "Mục Tiêu" },
    { id: "ai", label: "AI Insights" },
  ];

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 print:space-y-4">
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Bright Hero + 5 KPI cards
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-4xl border border-blue-100 shadow-sm">
        <div className="bg-linear-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Personal CFO Report Center
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Báo cáo tài chính
              </h1>
              <p className="mt-1 text-sm text-slate-500">{label}</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <Download size={15} />
                CSV
              </button>
              <button
                onClick={exportPDF}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200/60 hover:bg-blue-700"
              >
                <FileText size={15} />
                PDF
              </button>
            </div>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tài sản ròng"
              value={formatVND(summary.netWorth)}
              sub="Tài sản − Nợ"
              gradient={
                summary.netWorth >= 0
                  ? "from-blue-500 to-blue-600"
                  : "from-rose-500 to-red-500"
              }
              iconBg="bg-white/20"
              icon={<Landmark size={16} />}
            />
            <KpiCard
              label="Dòng tiền sau chi phí"
              value={formatVND(summary.saving)}
              sub={
                "TB " + formatCompactVND(monthlyAverages.cashFlow) + "/tháng"
              }
              gradient="from-indigo-500 to-indigo-600"
              iconBg="bg-indigo-400/30"
              icon={<WalletCards size={16} />}
            />
            <KpiCard
              label="Tiết kiệm"
              value={formatVND(summary.savingAssets)}
              sub={"Phân bổ " + formatVND(summary.futureAllocation)}
              gradient="from-emerald-500 to-teal-500"
              iconBg="bg-white/20"
              icon={<ShieldCheck size={16} />}
            />
            <KpiCard
              label="Danh mục đầu tư"
              value={formatVND(displayedInvestmentCapital)}
              sub={
                "ROI " + (investmentROI >= 0 ? "+" : "") + investmentROI + "%"
              }
              gradient="from-cyan-500 to-cyan-600"
              iconBg="bg-cyan-400/30"
              icon={<TrendingUp size={16} />}
            />
            {/* Health Score card */}
            <div
              className={
                "col-span-2 sm:col-span-1 rounded-2xl bg-linear-to-br p-4 shadow-sm " +
                healthGrade.gradient
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
                Financial Health
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {healthV2.total}
                <span className="text-lg opacity-70">/100</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{ width: Math.min(healthV2.total, 100) + "%" }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-white/80">
                {healthV2.grade} — {healthGrade.label}
              </p>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4 print:hidden">
          <span className="text-xs font-bold text-slate-500">Kỳ báo cáo:</span>
          {(["month", "quarter", "year", "custom"] as PeriodMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setPeriodMode(m)}
              className={
                "rounded-xl px-3 py-1.5 text-xs font-bold transition " +
                (periodMode === m
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300")
              }
            >
              {m === "month"
                ? "Tháng"
                : m === "quarter"
                  ? "Quý"
                  : m === "year"
                    ? "Năm"
                    : "Tuỳ chọn"}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {periodMode === "month" && (
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            {periodMode === "quarter" && (
              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
              >
                {QUARTERS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            )}
            {periodMode === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none"
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Report Tab Navigation
          ══════════════════════════════════════════════════════════════════ */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto print:hidden">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setReportTab(tab.id)}
            className={
              "shrink-0 rounded-2xl border px-5 py-2.5 text-sm font-bold transition-all " +
              (reportTab === tab.id
                ? "border-blue-300 bg-blue-600 text-white shadow-sm shadow-blue-200"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="grid gap-3 xl:grid-cols-3">
        <InsightSummaryCard
          icon={<WalletCards size={18} />}
          title="Tài sản & dòng tiền"
          value={formatVND(summary.netWorth)}
          note={
            "Dòng tiền sau chi phí " +
            formatVND(summary.saving) +
            ". Đã phân bổ " +
            formatVND(summary.futureAllocation) +
            " vào tiết kiệm/đầu tư."
          }
          tone={summary.saving >= 0 ? "good" : "danger"}
        />
        <InsightSummaryCard
          icon={<ShieldCheck size={18} />}
          title="Sức khỏe tài chính"
          value={healthV2.total + "/100"}
          note={
            healthV2.grade +
            " — " +
            healthGrade.label +
            ". Tỷ lệ nợ " +
            Math.round(summary.debtRatio) +
            "% và tỷ lệ tích lũy " +
            summary.savingRate +
            "% ."
          }
          tone={
            healthV2.total >= 75
              ? "good"
              : healthV2.total >= 50
                ? "warning"
                : "danger"
          }
        />
        <InsightSummaryCard
          icon={<Target size={18} />}
          title="Mục tiêu"
          value={goalReportScore + "%"}
          note={
            goals.length > 0
              ? goals.length +
                " mục tiêu đang theo dõi. Tiến độ được lấy từ Goals Page để tránh lệch dữ liệu."
              : "Chưa có mục tiêu tài chính. Hãy tạo mục tiêu để báo cáo có dự báo rõ hơn."
          }
          tone={
            goalReportScore >= 70
              ? "good"
              : goalReportScore >= 30
                ? "warning"
                : "danger"
          }
        />
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Tổng Quan
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "overview" && (
        <>
          {/* Overview mini-stat row */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatMini
              label="Thu nhập"
              value={formatVND(summary.income)}
              color="text-emerald-600"
              bg="bg-emerald-50"
              border="border-emerald-100"
            />
            <StatMini
              label="Chi phí thật"
              value={formatVND(summary.expense)}
              color="text-rose-500"
              bg="bg-rose-50"
              border="border-rose-100"
            />
            <StatMini
              label="Tiết kiệm"
              value={formatVND(summary.saving)}
              color={summary.saving >= 0 ? "text-blue-600" : "text-rose-500"}
              bg="bg-blue-50"
              border="border-blue-100"
            />
            <StatMini
              label="Tỷ lệ tiết kiệm"
              value={summary.savingRate + "%"}
              color={
                summary.savingRate >= 20
                  ? "text-emerald-600"
                  : summary.savingRate >= 10
                    ? "text-amber-500"
                    : "text-rose-500"
              }
              bg="bg-slate-50"
              border="border-slate-200"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                icon={<PieChartIcon size={20} />}
                title="Cấu trúc tài sản"
                subtitle="Thanh khoản · Tiết kiệm · Đầu tư · Nợ"
              />
              <div className="mt-5 grid gap-5 lg:grid-cols-[240px_1fr]">
                <div className="relative mx-auto h-56 w-56">
                  {assetAllocationData.length > 0 ? (
                    <PieChart width={224} height={224}>
                      <Pie
                        data={assetAllocationData}
                        dataKey="value"
                        innerRadius={64}
                        outerRadius={98}
                        paddingAngle={4}
                      >
                        {assetAllocationData.map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => [
                          formatVND(Number(v ?? 0)),
                          "Giá trị",
                        ]}
                      />
                    </PieChart>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-full bg-slate-50 text-sm text-slate-400">
                      Chưa có dữ liệu
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-blue-600">
                      {formatCompactVND(summary.totalAssets)}
                    </span>
                    <span className="text-xs text-slate-500">Tổng tài sản</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {assetAllocationData.map((item) => {
                    const pct =
                      summary.totalAssets > 0
                        ? Math.round((item.value / summary.totalAssets) * 100)
                        : 0;
                    return (
                      <div key={item.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 font-bold text-slate-700">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: item.color }}
                            />
                            {item.name}
                          </span>
                          <span className="font-black text-slate-900">
                            {formatVND(item.value)}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100">
                          <div
                            className="h-2.5 rounded-full"
                            style={{ width: pct + "%", background: item.color }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {pct}% tổng tài sản
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                icon={<Brain size={20} />}
                title="Executive Summary"
                subtitle="Điểm chính cần chú ý trong kỳ"
              />
              <div className="mt-5 grid gap-3">
                <ReportSignal
                  label="Dòng tiền"
                  value={formatVND(incomeExpenseGap)}
                  note={
                    incomeExpenseGap >= 0
                      ? "Thu nhập đang lớn hơn chi phí thật."
                      : "Chi phí thật đang vượt thu nhập."
                  }
                  tone={incomeExpenseGap >= 0 ? "good" : "danger"}
                />
                <ReportSignal
                  label="Tích lũy tương lai"
                  value={formatVND(summary.futureAllocation)}
                  note="Gồm tiền đưa vào tiết kiệm và đầu tư trong kỳ."
                  tone={summary.futureAllocation > 0 ? "good" : "warning"}
                />
                <ReportSignal
                  label="Mục tiêu ưu tiên"
                  value={
                    goalMeta.length
                      ? (goalMeta.sort((a, b) => a.pct - b.pct)[0]?.name ??
                        "Không có")
                      : "Chưa có"
                  }
                  note={
                    goalMeta.length
                      ? "Mục tiêu có tiến độ thấp nhất cần được ưu tiên."
                      : "Tạo mục tiêu để báo cáo có kế hoạch rõ hơn."
                  }
                  tone={
                    goalMeta.length && goalMeta.some((goal) => goal.pct < 30)
                      ? "warning"
                      : "good"
                  }
                />
              </div>
            </div>
          </section>

          {/* Trend sparklines */}
          <section>
            <SectionHeader
              icon={<TrendingUp size={20} />}
              title="Phân tích xu hướng"
              subtitle={"12 tháng năm " + year}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <TrendCard
                title="Thu nhập"
                color="#10b981"
                data={monthly.map((m) => ({ v: m.thu }))}
                unit="M"
                positive
              />
              <TrendCard
                title="Chi phí thật"
                color="#f43f5e"
                data={monthly.map((m) => ({ v: m.chi }))}
                unit="M"
                positive={false}
              />
              <TrendCard
                title="Tiết kiệm"
                color="#2563eb"
                data={monthly.map((m) => ({ v: m.tietKiem }))}
                unit="M"
                positive
              />
              <TrendCard
                title="Đầu tư"
                color="#10b981"
                data={investments.map((inv) => ({ v: inv.currentValue / 1e6 }))}
                unit="M"
                positive
              />
              <TrendCard
                title="Nợ phải trả"
                color="#f97316"
                data={debts.map((d) => ({ v: d.remainingAmount / 1e6 }))}
                unit="M"
                positive={false}
              />
              <TrendCard
                title="Mục tiêu"
                color="#6366f1"
                data={goalMeta.map((g) => ({ v: g.pct }))}
                unit="%"
                positive
              />
            </div>
          </section>

          {/* MoM / QoQ / YoY comparisons */}
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<BarChart3 size={20} />}
              title="So sánh kỳ"
              subtitle="Month · Quarter · Year over Year"
            />
            <div className="mt-5 space-y-6">
              <CompareSection
                title="Month over Month (MoM)"
                data={comparisons.mom}
              />
              <CompareSection
                title="Quarter over Quarter (QoQ)"
                data={comparisons.qoq}
              />
              <CompareSection
                title="Year over Year (YoY)"
                data={comparisons.yoy}
              />
            </div>
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Thu Nhập
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "income" && (
        <>
          {/* Summary mini-stats */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatMini
              label="Tổng thu nhập"
              value={formatVND(summary.income)}
              color="text-emerald-600"
              bg="bg-emerald-50"
              border="border-emerald-100"
            />
            <StatMini
              label="Chi phí thật"
              value={formatVND(summary.expense)}
              color="text-rose-500"
              bg="bg-rose-50"
              border="border-rose-100"
            />
            <StatMini
              label="Lợi nhuận ròng"
              value={formatVND(summary.saving)}
              color={summary.saving >= 0 ? "text-blue-600" : "text-rose-500"}
              bg="bg-blue-50"
              border="border-blue-100"
            />
          </section>

          {/* 12-month area chart */}
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<TrendingUp size={20} />}
              title="Xu hướng thu nhập"
              subtitle={"12 tháng năm " + year}
            />
            <div className="mt-5">
              <ResponsiveContainer width="100%" height={280} minWidth={0}>
                <AreaChart
                  data={monthly}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#10b981"
                        stopOpacity={0.15}
                      />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#f43f5e"
                        stopOpacity={0.15}
                      />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                  />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} />
                  <Tooltip formatter={(value) => formatMillionTooltip(value)} />
                  <Area
                    type="monotone"
                    dataKey="thu"
                    name="Thu nhập"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#incGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="chi"
                    name="Chi tiêu"
                    stroke="#f43f5e"
                    strokeWidth={2.5}
                    fill="url(#expGrad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="dongTienRong"
                    name="Dòng tiền ròng"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Thu nhập (M)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Chi tiêu (M)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-500" />
                  Dòng tiền ròng (M)
                </span>
              </div>
            </div>
          </section>

          {/* Income Statement table */}
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<FileText size={20} />}
              title="Kết quả kinh doanh"
              subtitle={label}
            />
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-left font-black text-slate-700">
                      Khoản mục
                    </th>
                    <th className="pb-3 text-right font-black text-slate-700">
                      Số tiền
                    </th>
                    <th className="pb-3 text-right font-black text-slate-700">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr className="bg-emerald-50/40">
                    <td className="py-3 font-black text-slate-900">
                      Tổng thu nhập
                    </td>
                    <td className="py-3 text-right font-black text-emerald-600">
                      {formatVND(summary.income)}
                    </td>
                    <td className="py-3 text-right text-emerald-600">100%</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="py-3 font-black text-slate-900">
                      Chi phí thật
                    </td>
                    <td className="py-3 text-right font-black text-rose-500">
                      {formatVND(summary.expense)}
                    </td>
                    <td className="py-3 text-right text-rose-500">
                      {summary.income > 0
                        ? Math.round((summary.expense / summary.income) * 100)
                        : 0}
                      %
                    </td>
                  </tr>
                  <tr className="font-black">
                    <td className="py-3 text-slate-900">Lợi nhuận ròng</td>
                    <td
                      className={
                        "py-3 text-right " +
                        (summary.saving >= 0
                          ? "text-blue-600"
                          : "text-rose-500")
                      }
                    >
                      {formatVND(summary.saving)}
                    </td>
                    <td
                      className={
                        "py-3 text-right " +
                        (summary.saving >= 0
                          ? "text-blue-600"
                          : "text-rose-500")
                      }
                    >
                      {summary.savingRate}%
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="py-3 text-slate-500" colSpan={3}>
                      <p className="font-bold mb-1">Chi tiết theo danh mục</p>
                    </td>
                  </tr>
                  {spendingByCategory.map((item, i) => (
                    <tr key={item.name}>
                      <td className="flex items-center gap-2 py-2 pl-4 text-slate-600">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        {item.name}
                      </td>
                      <td className="py-2 text-right text-slate-700">
                        {formatVND(item.value)}
                      </td>
                      <td className="py-2 text-right text-slate-400">
                        {item.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Chi Tiêu
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "expense" && (
        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {/* Pie chart */}
          <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<PieChartIcon size={20} />}
              title="Chi tiêu theo danh mục"
              subtitle="Tỷ trọng từng nhóm"
            />
            <div className="relative mx-auto mt-5 h-56 w-56">
              <PieChart width={224} height={224}>
                <Pie
                  data={spendingPieData}
                  dataKey="value"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={4}
                >
                  {spendingPieData.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [formatVND(Number(v ?? 0)), "Chi tiêu"]}
                />
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-rose-500">
                  {Math.round(summary.expense / 1e6)}M
                </span>
                <span className="text-xs text-slate-500">Tổng chi</span>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {spendingPieData.map((item) => (
                <div key={item.name}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="flex items-center gap-2 font-bold text-slate-700">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: item.color }}
                      />
                      {item.name}
                    </span>
                    <span className="text-slate-500">
                      {formatVND(item.value)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all"
                      style={{
                        width: item.percent + "%",
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{item.percent}%</p>
                </div>
              ))}
              {spendingPieData.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  Không có dữ liệu chi tiêu cho kỳ này.
                </p>
              )}
            </div>
          </div>

          {/* Monthly comparison bar chart */}
          <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<BarChart3 size={20} />}
              title="Thu chi theo tháng"
              subtitle={"Đơn vị: triệu đồng — Năm " + year}
            />
            <div className="mt-5">
              <ResponsiveContainer width="100%" height={300} minWidth={0}>
                <BarChart
                  data={monthly}
                  barGap={3}
                  barCategoryGap={12}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                    tickFormatter={(value) => String(value) + "M"}
                  />
                  <Tooltip
                    formatter={(value) => formatMillionTooltip(value)}
                    labelFormatter={(label) => String(label)}
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
                  <Bar
                    dataKey="tietKiem"
                    name="Tiết kiệm"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Thu nhập
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Chi tiêu
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-blue-600" />
                  Tiết kiệm
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Dòng Tiền
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "cashflow" && (
        <>
          {/* Cash flow statement tabs */}
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<FileText size={20} />}
              title="Báo cáo tài chính"
              subtitle="Income Statement · Cash Flow · Net Worth"
            />
            <div className="mt-5 flex gap-2 border-b border-slate-100 pb-0">
              {(
                [
                  ["income", "Kết quả kinh doanh"],
                  ["cashflow", "Dòng tiền"],
                  ["networth", "Tài sản ròng"],
                ] as [typeof stmtTab, string][]
              ).map(([id, lbl]) => (
                <button
                  key={id}
                  onClick={() => setStmtTab(id)}
                  className={
                    "rounded-t-xl px-4 py-2.5 text-sm font-bold transition " +
                    (stmtTab === id
                      ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {lbl}
                </button>
              ))}
            </div>

            {stmtTab === "cashflow" && (
              <div className="mt-5">
                <ResponsiveContainer width="100%" height={280} minWidth={0}>
                  <BarChart
                    data={monthly}
                    barGap={3}
                    barCategoryGap={10}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                      tickFormatter={(value) => String(value) + "M"}
                    />
                    <Tooltip
                      formatter={(value) => formatMillionTooltip(value)}
                      labelFormatter={(label) => String(label)}
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
                    <Bar
                      dataKey="tietKiem"
                      name="Tiết kiệm"
                      fill="#2563eb"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    Thu nhập
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-rose-500" />
                    Chi tiêu
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-blue-600" />
                    Tiết kiệm
                  </span>
                </div>
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        {[
                          "Tháng",
                          "Thu (M)",
                          "Chi thật (M)",
                          "Dòng tiền (M)",
                        ].map((h) => (
                          <th
                            key={h}
                            className="pb-2 text-right font-bold text-slate-500 first:text-left"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {monthly
                        .filter((m) => m.thu > 0 || m.chi > 0)
                        .map((m) => (
                          <tr key={m.month}>
                            <td className="py-1.5 font-bold text-slate-700">
                              {m.month}
                            </td>
                            <td className="py-1.5 text-right text-emerald-600">
                              {m.thu.toFixed(1)}
                            </td>
                            <td className="py-1.5 text-right text-rose-500">
                              {m.chi.toFixed(1)}
                            </td>
                            <td
                              className={
                                "py-1.5 text-right font-bold " +
                                (m.dongTienRong >= 0
                                  ? "text-blue-600"
                                  : "text-rose-500")
                              }
                            >
                              {m.dongTienRong.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stmtTab === "income" && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-3 text-left font-black text-slate-700">
                        Khoản mục
                      </th>
                      <th className="pb-3 text-right font-black text-slate-700">
                        Số tiền
                      </th>
                      <th className="pb-3 text-right font-black text-slate-700">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr className="bg-emerald-50/40">
                      <td className="py-3 font-black text-slate-900">
                        Tổng thu nhập
                      </td>
                      <td className="py-3 text-right font-black text-emerald-600">
                        {formatVND(summary.income)}
                      </td>
                      <td className="py-3 text-right text-emerald-600">100%</td>
                    </tr>
                    <tr className="bg-rose-50/40">
                      <td className="py-3 font-black text-slate-900">
                        Chi phí thật
                      </td>
                      <td className="py-3 text-right font-black text-rose-500">
                        {formatVND(summary.expense)}
                      </td>
                      <td className="py-3 text-right text-rose-500">
                        {summary.income > 0
                          ? Math.round((summary.expense / summary.income) * 100)
                          : 0}
                        %
                      </td>
                    </tr>
                    <tr className="font-black">
                      <td className="py-3 text-slate-900">Lợi nhuận ròng</td>
                      <td
                        className={
                          "py-3 text-right " +
                          (summary.saving >= 0
                            ? "text-blue-600"
                            : "text-rose-500")
                        }
                      >
                        {formatVND(summary.saving)}
                      </td>
                      <td
                        className={
                          "py-3 text-right " +
                          (summary.saving >= 0
                            ? "text-blue-600"
                            : "text-rose-500")
                        }
                      >
                        {summary.savingRate}%
                      </td>
                    </tr>
                    {spendingByCategory.map((item, i) => (
                      <tr key={item.name}>
                        <td className="flex items-center gap-2 py-2 pl-4 text-slate-600">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          {item.name}
                        </td>
                        <td className="py-2 text-right text-slate-700">
                          {formatVND(item.value)}
                        </td>
                        <td className="py-2 text-right text-slate-400">
                          {item.percent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {stmtTab === "networth" && (
              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-3 text-sm font-black text-slate-700">
                    Tài sản
                  </p>
                  <div className="space-y-2">
                    {wallets.map((w) => (
                      <div
                        key={w.id}
                        className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                      >
                        <span className="text-slate-600">{w.name}</span>
                        <span className="font-black text-blue-600">
                          {formatVND(w.balance)}
                        </span>
                      </div>
                    ))}
                    {investments.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                      >
                        <span className="text-slate-600">{inv.name}</span>
                        <span className="font-black text-emerald-600">
                          {formatVND(inv.currentValue)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black">
                      <span className="text-blue-700">Tổng tài sản</span>
                      <span className="text-blue-700">
                        {formatVND(summary.totalAssets)}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-sm font-black text-slate-700">
                    Nợ phải trả
                  </p>
                  <div className="space-y-2">
                    {debts.map((d) => (
                      <div
                        key={d.id}
                        className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                      >
                        <span className="text-slate-600">{d.name}</span>
                        <span className="font-black text-rose-500">
                          {formatVND(d.remainingAmount)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black">
                      <span className="text-rose-700">Tổng nợ</span>
                      <span className="text-rose-700">
                        {formatVND(summary.totalDebt)}
                      </span>
                    </div>
                    <div className="mt-4 flex justify-between rounded-2xl bg-linear-to-r from-blue-600 to-cyan-500 px-4 py-4 text-sm font-black text-white">
                      <span>Tài sản ròng</span>
                      <span>{formatVND(summary.netWorth)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Đầu Tư
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "investment" && (
        <>
          {/* Investment KPIs */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatMini
              label="Danh mục đầu tư"
              value={formatVND(summary.investmentAssets)}
              color="text-blue-600"
              bg="bg-blue-50"
              border="border-blue-100"
            />
            <StatMini
              label="Vốn giao dịch kỳ này"
              value={formatVND(summary.investmentAllocation)}
              color="text-slate-600"
              bg="bg-slate-50"
              border="border-slate-200"
            />
            <StatMini
              label="ROI"
              value={(investmentROI >= 0 ? "+" : "") + investmentROI + "%"}
              color={investmentROI >= 0 ? "text-emerald-600" : "text-rose-500"}
              bg={investmentROI >= 0 ? "bg-emerald-50" : "bg-rose-50"}
              border={
                investmentROI >= 0 ? "border-emerald-100" : "border-rose-100"
              }
            />
            <StatMini
              label="Số lượng tài sản"
              value={String(investments.length)}
              color="text-indigo-600"
              bg="bg-indigo-50"
              border="border-indigo-100"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
            {/* Per-investment cards */}
            <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
              <SectionHeader
                icon={<BriefcaseBusiness size={20} />}
                title="Danh mục đầu tư"
                subtitle={investments.length + " tài sản đầu tư"}
              />
              <div className="mt-5 space-y-3">
                {investments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    Chưa có tài sản đầu tư nào.
                  </p>
                ) : (
                  investments.map((inv) => {
                    const roi =
                      inv.investedAmount > 0
                        ? Math.round(
                            ((inv.currentValue - inv.investedAmount) /
                              inv.investedAmount) *
                              100,
                          )
                        : 0;
                    const color = INV_TYPE_COLORS[inv.type] ?? "#94a3b8";
                    const pct =
                      summary.investmentAssets > 0
                        ? Math.round(
                            (inv.currentValue / summary.investmentAssets) * 100,
                          )
                        : 0;
                    return (
                      <div
                        key={inv.id}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className="size-3 shrink-0 rounded-full mt-0.5"
                              style={{ background: color }}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-black text-slate-900">
                                {inv.name}
                              </p>
                              <span
                                className="mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                                style={{ background: color }}
                              >
                                {INV_TYPE_LABEL[inv.type] ?? inv.type}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-blue-700">
                              {formatVND(inv.currentValue)}
                            </p>
                            <p
                              className={
                                "text-xs font-bold " +
                                (roi >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-500")
                              }
                            >
                              {roi >= 0 ? "+" : ""}
                              {roi}% ROI
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="text-slate-400">
                              Tỷ trọng danh mục
                            </span>
                            <span className="font-bold text-slate-600">
                              {pct}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{ width: pct + "%", background: color }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Allocation pie */}
            <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-black text-slate-900">
                Phân bổ loại tài sản
              </h2>
              {invPieData.length > 0 ? (
                <>
                  <div className="flex justify-center">
                    <PieChart width={160} height={160}>
                      <Pie
                        data={invPieData}
                        dataKey="value"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={4}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {invPieData.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <div className="mt-4 space-y-2">
                    {invPieData.map((d) => (
                      <div
                        key={d.name}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: d.color }}
                        />
                        <span className="flex-1 font-bold text-slate-600">
                          {d.name}
                        </span>
                        <span className="font-black text-slate-900">
                          {summary.investmentAssets > 0
                            ? Math.round(
                                (d.value / summary.investmentAssets) * 100,
                              )
                            : 0}
                          %
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-4 text-center text-sm text-slate-400">
                  Chưa có dữ liệu
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: Mục Tiêu
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "goals" && (
        <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={<Target size={20} />}
            title="Tiến độ mục tiêu"
            subtitle="Trạng thái từng mục tiêu tài chính"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {goalMeta.length === 0 ? (
              <p className="col-span-3 py-6 text-center text-sm text-slate-400">
                Chưa có mục tiêu nào.
              </p>
            ) : (
              goalMeta.map((g) => {
                const effectiveCurrentAmount = g.effectiveCurrentAmount;
                const remainingAmount = g.remaining;
                const pct = g.pct;
                const isComplete = pct >= 100;
                const isNear = pct >= 75;
                return (
                  <div
                    key={g.id}
                    className={
                      "rounded-2xl border p-4 " +
                      (isComplete
                        ? "border-emerald-100 bg-emerald-50/50"
                        : isNear
                          ? "border-blue-100 bg-blue-50/50"
                          : "border-slate-100 bg-slate-50")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-slate-900">{g.name}</p>
                      <span
                        className={
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold " +
                          (isComplete
                            ? "bg-emerald-100 text-emerald-700"
                            : isNear
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700")
                        }
                      >
                        {pct}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatVND(effectiveCurrentAmount)} /{" "}
                      {formatVND(g.targetAmount)}
                    </p>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{
                          width: pct + "%",
                          background: isComplete
                            ? "#10b981"
                            : isNear
                              ? "#2563eb"
                              : "#f59e0b",
                        }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold">
                      <div className="rounded-xl bg-white px-2 py-1.5 text-slate-500">
                        Còn lại
                        <p className="mt-0.5 text-slate-900">
                          {formatVND(remainingAmount)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-2 py-1.5 text-slate-500">
                        Góp đề xuất
                        <p className="mt-0.5 text-blue-600">
                          {isComplete
                            ? "Đã xong"
                            : formatVND(g.suggestedMonthly) + "/tháng"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: AI Insights
          ══════════════════════════════════════════════════════════════════ */}
      {reportTab === "ai" && (
        <>
          {/* 4 engine insight blocks */}
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-violet-600 to-indigo-500 text-white shadow-lg shadow-violet-100">
                <Bot size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  AI Financial Insights
                </h2>
                <p className="text-sm text-slate-500">
                  Phân tích thông minh từ dữ liệu thực tế
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InsightBlock
                icon={<PieChartIcon size={18} />}
                title="Phân tích chi tiêu"
                tone={
                  smartBudget.adherenceScore >= 80
                    ? "good"
                    : smartBudget.adherenceScore >= 60
                      ? "warning"
                      : "danger"
                }
              >
                <p className="text-xs leading-5 opacity-80">
                  Điểm tuân thủ ngân sách:{" "}
                  <strong>{smartBudget.adherenceScore}/100</strong>.{" "}
                  {smartBudget.violations.length > 0
                    ? "Có " +
                      smartBudget.violations.length +
                      " danh mục vượt ngân sách. " +
                      smartBudget.violations
                        .map((v) => v.categoryName)
                        .join(", ") +
                      "."
                    : "Tất cả danh mục trong giới hạn ngân sách."}
                </p>
              </InsightBlock>

              <InsightBlock
                icon={<Sparkles size={18} />}
                title="Sức khoẻ tài chính"
                tone={
                  healthV2.grade === "A" || healthV2.grade === "B"
                    ? "good"
                    : healthV2.grade === "C"
                      ? "warning"
                      : "danger"
                }
              >
                <p className="text-xs leading-5 opacity-80">
                  Điểm: <strong>{healthV2.total}/100</strong> · Xếp hạng{" "}
                  <strong>{healthV2.grade}</strong> ({healthV2.label}).{" "}
                  {healthV2.factors
                    .slice(0, 2)
                    .map((f) => f.note)
                    .join(" ")}
                </p>
              </InsightBlock>

              <InsightBlock
                icon={<Brain size={18} />}
                title="Dự báo tài chính"
                tone={
                  forecast.expected.projectedSaving >= 0 ? "good" : "danger"
                }
              >
                <p className="text-xs leading-5 opacity-80">
                  Tháng tới: Thu{" "}
                  <strong>
                    {formatVND(forecast.expected.projectedIncome)}
                  </strong>{" "}
                  · Chi{" "}
                  <strong>
                    {formatVND(forecast.expected.projectedExpense)}
                  </strong>
                  . Dự kiến tiết kiệm{" "}
                  <strong>
                    {formatVND(forecast.expected.projectedSaving)}
                  </strong>
                  . Độ tin cậy: <strong>{forecast.confidenceLabel}</strong>.
                </p>
              </InsightBlock>

              <InsightBlock
                icon={<ShieldCheck size={18} />}
                title="Phân tích rủi ro"
                tone={
                  riskData.level === "low"
                    ? "good"
                    : riskData.level === "medium"
                      ? "warning"
                      : "danger"
                }
              >
                <p className="text-xs leading-5 opacity-80">
                  Rủi ro: <strong>{riskData.total}/100</strong> (
                  {riskData.label}).{" "}
                  {riskData.recommendations.slice(0, 1).join("")}
                </p>
              </InsightBlock>
            </div>
          </section>

          {/* Health score factors */}
          <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
            <SectionHeader
              icon={<Zap size={20} />}
              title="Chi tiết điểm sức khoẻ tài chính"
              subtitle={
                "Tổng điểm: " + healthV2.total + "/100 · Hạng " + healthV2.grade
              }
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {healthV2.factors.map((f) => (
                <div key={f.label} className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="font-bold text-slate-700">{f.label}</span>
                    <span className="font-black text-slate-900">
                      {f.score * f.weight}/{10 * f.weight}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className={
                        "h-2 rounded-full transition-all " +
                        (f.score >= 7
                          ? "bg-emerald-500"
                          : f.score >= 4
                            ? "bg-amber-400"
                            : "bg-rose-500")
                      }
                      style={{ width: (f.score / 10) * 100 + "%" }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{f.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Budget violations (conditional) */}
          {smartBudget.violations.length > 0 && (
            <section className="rounded-4xl border border-rose-100 bg-rose-50/50 p-6 shadow-sm">
              <SectionHeader
                icon={<AlertTriangle size={20} />}
                title={
                  "Vượt ngân sách · " +
                  smartBudget.violations.length +
                  " danh mục"
                }
                subtitle="Cần điều chỉnh chi tiêu ngay"
              />
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {smartBudget.violations.map((v) => (
                  <div
                    key={v.categoryId}
                    className="rounded-2xl border border-rose-200 bg-white p-4"
                  >
                    <p className="text-sm font-black text-rose-700">
                      {v.categoryName}
                    </p>
                    <p className="mt-1 text-xs text-rose-500">
                      Vượt {formatVND(v.overage)} (+
                      {Math.round(v.overagePercent)}%)
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>Hạn mức: {formatVND(v.budgetLimit)}</span>
                      <span className="font-bold text-rose-600">
                        Thực tế: {formatVND(v.actualSpend)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Risk recommendations */}
          {riskData.recommendations.length > 0 && (
            <section className="rounded-4xl border border-amber-100 bg-amber-50/50 p-6 shadow-sm">
              <SectionHeader
                icon={<ShieldCheck size={20} />}
                title="Khuyến nghị quản lý rủi ro"
                subtitle={
                  "Mức rủi ro: " +
                  riskData.label +
                  " (" +
                  riskData.total +
                  "/100)"
                }
              />
              <div className="mt-4 space-y-2">
                {riskData.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-2xl bg-white p-3"
                  >
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700">
                      {i + 1}
                    </span>
                    <p className="text-sm text-slate-600">{rec}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          Export Center (always visible)
          ══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-linear-to-br from-slate-600 to-slate-700 text-white shadow-sm">
              <Download size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Export Center
              </h2>
              <p className="text-xs text-slate-500">
                Xuất CSV/PDF cho kỳ {label} · gồm KPI, chart và dữ liệu chi tiết
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Download size={15} />
              Xuất CSV
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200/60 hover:bg-blue-700"
            >
              <FileText size={15} />
              Xuất PDF
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  gradient,
  iconBg,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  gradient: string;
  iconBg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className={"rounded-2xl bg-gradient-to-br p-4 shadow-sm " + gradient}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
          {label}
        </p>
        <div
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-lg text-white " +
            iconBg
          }
        >
          {icon}
        </div>
      </div>
      <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-white/70">{sub}</p>
    </div>
  );
}

function StatMini({
  label,
  value,
  color,
  bg,
  border,
}: {
  label: string;
  value: string;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div className={"rounded-2xl border p-4 " + bg + " " + border}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={"mt-2 text-xl font-black " + color}>{value}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function TrendCard({
  title,
  color,
  data,
  unit,
  positive,
}: {
  title: string;
  color: string;
  data: { v: number }[];
  unit: string;
  positive: boolean;
}) {
  const meaningfulData = data.filter((item) => item.v !== 0);
  const last = meaningfulData.at(-1)?.v ?? data.at(-1)?.v ?? 0;
  const prev = meaningfulData.at(-2)?.v ?? 0;
  const delta =
    prev !== 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : null;
  const up = delta !== null && delta > 0;
  const chartData = data.map((d, i) => ({ i, v: d.v }));
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{title}</p>
        {delta !== null && (
          <span
            className={
              "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold " +
              (up === positive
                ? "bg-emerald-50 text-emerald-600"
                : "bg-rose-50 text-rose-500")
            }
          >
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-black" style={{ color }}>
        {last.toFixed(1)}
        {unit}
      </p>
      <div className="mt-3 h-16">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={64} minWidth={0}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Không đủ dữ liệu
          </div>
        )}
      </div>
    </div>
  );
}

function CompareSection({
  title,
  data,
}: {
  title: string;
  data: {
    income: number | null;
    expense: number | null;
    saving: number | null;
  };
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black text-slate-500">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        <DeltaChip label="Thu nhập" delta={data.income} positive />
        <DeltaChip label="Chi phí thật" delta={data.expense} positive={false} />
        <DeltaChip label="Tiết kiệm" delta={data.saving} positive />
      </div>
    </div>
  );
}

function DeltaChip({
  label,
  delta,
  positive,
}: {
  label: string;
  delta: number | null;
  positive: boolean;
}) {
  if (delta === null)
    return (
      <div className="rounded-2xl bg-slate-50 p-3 text-center">
        <p className="text-xs font-bold text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-black text-slate-400">—</p>
      </div>
    );
  const up = delta > 0;
  const good = up === positive;
  return (
    <div
      className={
        "rounded-2xl p-3 text-center " + (good ? "bg-emerald-50" : "bg-rose-50")
      }
    >
      <p
        className={
          "text-xs font-bold " + (good ? "text-emerald-600" : "text-rose-500")
        }
      >
        {label}
      </p>
      <p
        className={
          "mt-1 flex items-center justify-center gap-0.5 text-sm font-black " +
          (good ? "text-emerald-600" : "text-rose-500")
        }
      >
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {up ? "+" : ""}
        {delta}%
      </p>
    </div>
  );
}

function ReportSignal({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "good" | "warning" | "danger";
}) {
  const styles = {
    good: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    danger: "border-rose-100 bg-rose-50 text-rose-700",
  };

  return (
    <div className={"rounded-2xl border p-4 " + styles[tone]}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 text-lg font-black">{value}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{note}</p>
    </div>
  );
}

function InsightSummaryCard({
  icon,
  title,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  note: string;
  tone: "good" | "warning" | "danger";
}) {
  const styles = {
    good: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    danger: "border-rose-100 bg-rose-50 text-rose-700",
  };

  return (
    <div className={"rounded-3xl border p-5 shadow-sm " + styles[tone]}>
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-white/70">
          {icon}
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide opacity-70">
            {title}
          </p>
          <p className="mt-0.5 text-2xl font-black">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 opacity-90">{note}</p>
    </div>
  );
}

function InsightBlock({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "good" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const styles = {
    good: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    danger: "border-rose-100 bg-rose-50 text-rose-700",
  };
  return (
    <div className={"rounded-2xl border p-4 " + styles[tone]}>
      <div className="mb-2 flex items-center gap-2">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <p className="text-sm font-black">{title}</p>
      </div>
      {children}
    </div>
  );
}
