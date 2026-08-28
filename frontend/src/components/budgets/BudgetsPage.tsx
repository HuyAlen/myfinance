"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { useDateFilter } from "../layout/DateFilterProvider";
import { useQuickActionCreateIntent } from "@/src/lib/navigation/quickActionIntent";
import {
  buildTransactionsHref,
  parseFocusId,
} from "@/src/lib/navigation/financeNavigation";
import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChartPie,
  Edit3,
  Plus,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { Cell, Pie, PieChart } from "recharts";

import type {
  Budget,
  Category,
  Transaction,
  CategoryPlanningGroup,
} from "@/src/types/finance";

import {
  addBudget,
  deleteBudget,
  getBudgets,
  getCategories,
  getTransactions,
  updateBudget,
} from "@/src/services/finance/financeStorage";

import {
  calculateBudgetSpending,
  formatVND,
  getCategoryPlanningGroup,
} from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";
import { computeSmartBudget } from "@/src/services/finance/analytics";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  categoryId: string;
  month: string;
  limitAmount: string;
};

const emptyForm: FormState = {
  categoryId: "",
  month: "2026-06",
  limitAmount: "",
};

const PIE_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#7c3aed",
  "#ef4444",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#ec4899",
  "#64748b",
];

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getMonthMeta(month: string) {
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const monthIndex = Number.isFinite(monthRaw)
    ? monthRaw - 1
    : new Date().getMonth();
  const now = new Date();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const isCurrentMonth =
    now.getFullYear() === year && now.getMonth() === monthIndex;

  const elapsedDays = isCurrentMonth
    ? clampNumber(now.getDate(), 1, daysInMonth)
    : daysInMonth;

  return {
    year,
    monthIndex,
    daysInMonth,
    elapsedDays,
    remainingDays: Math.max(daysInMonth - elapsedDays, 0),
    isCurrentMonth,
  };
}

function getBudgetForecast(limitAmount: number, spent: number, month: string) {
  const meta = getMonthMeta(month);
  const dailyPace = meta.elapsedDays > 0 ? spent / meta.elapsedDays : 0;
  const projectedSpend = meta.isCurrentMonth
    ? Math.round(dailyPace * meta.daysInMonth)
    : spent;
  const projectedRemaining = limitAmount - projectedSpend;
  const projectedPercent =
    limitAmount > 0 ? Math.round((projectedSpend / limitAmount) * 100) : 0;
  const projectedOverage = Math.max(0, projectedSpend - limitAmount);
  const safeDailyBudget =
    meta.remainingDays > 0
      ? Math.max(0, (limitAmount - spent) / meta.remainingDays)
      : 0;

  const confidenceLevel = !meta.isCurrentMonth
    ? "high"
    : meta.elapsedDays < 10
      ? "low"
      : meta.elapsedDays < 18
        ? "medium"
        : "high";

  const confidenceLabel =
    confidenceLevel === "low"
      ? "Độ tin cậy thấp"
      : confidenceLevel === "medium"
        ? "Độ tin cậy trung bình"
        : "Độ tin cậy cao";

  const confidenceNote =
    confidenceLevel === "low"
      ? `Dữ liệu mới ${meta.elapsedDays} ngày, dự báo có thể dao động mạnh.`
      : confidenceLevel === "medium"
        ? `Dựa trên ${meta.elapsedDays} ngày dữ liệu trong tháng.`
        : meta.isCurrentMonth
          ? `Dựa trên ${meta.elapsedDays} ngày dữ liệu trong tháng.`
          : "Tháng đã kết thúc, số liệu là thực tế.";

  const confidenceWeight =
    confidenceLevel === "low" ? 0.35 : confidenceLevel === "medium" ? 0.65 : 1;

  return {
    ...meta,
    dailyPace,
    projectedSpend,
    projectedRemaining,
    projectedPercent,
    projectedOverage,
    safeDailyBudget,
    confidenceLevel,
    confidenceLabel,
    confidenceNote,
    confidenceWeight,
    isProjectedOver: projectedRemaining < 0,
  };
}

function getPreviousMonthKey(month: string) {
  const [yearRaw, monthRaw] = month.split("-").map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const monthIndex = Number.isFinite(monthRaw)
    ? monthRaw - 1
    : new Date().getMonth();
  const previous = new Date(year, monthIndex - 1, 1);
  return (
    previous.getFullYear() +
    "-" +
    String(previous.getMonth() + 1).padStart(2, "0")
  );
}

function getFixedCostStatus(ratio: number) {
  if (ratio <= 40) {
    return {
      label: "Ổn định",
      tone: "good" as const,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
    };
  }

  if (ratio <= 60) {
    return {
      label: "Cần theo dõi",
      tone: "warning" as const,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
    };
  }

  return {
    label: "Rủi ro cao",
    tone: "danger" as const,
    color: "text-rose-600",
    bg: "bg-rose-50",
    border: "border-rose-100",
  };
}

function getStabilityScore(
  fixedRatio: number,
  variableRatio: number,
  savingRatio: number,
) {
  const fixedPenalty =
    fixedRatio <= 40
      ? 0
      : fixedRatio <= 60
        ? (fixedRatio - 40) * 1.1
        : 22 + (fixedRatio - 60) * 1.4;
  const variablePenalty =
    variableRatio <= 45
      ? 0
      : variableRatio <= 65
        ? (variableRatio - 45) * 0.8
        : 16 + (variableRatio - 65) * 1.1;
  const savingBonus =
    savingRatio >= 20
      ? Math.min(12, (savingRatio - 20) * 0.5)
      : -(20 - savingRatio) * 1.2;

  return Math.round(
    clampNumber(82 - fixedPenalty - variablePenalty + savingBonus, 0, 100),
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  // FINANCE-DATA-1B: `budgets` starts at [] the same as a genuine
  // zero-budget account. "Chưa có ngân sách nào" is a real financial
  // conclusion, so it must not render before a load has actually
  // SUCCEEDED at least once — otherwise an initial read failure would
  // look identical to "you haven't set up any budgets."
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);
  const [budgetsLoadError, setBudgetsLoadError] = useState<string | null>(
    null,
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCloningPrevious, setIsCloningPrevious] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();
  const {
    selectedMonth: activeMonth,
    filterMode,
    filterLabel,
    dateRange,
  } = useDateFilter();

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  const reloadData = useCallback(async () => {
    // FINANCE-DATA-1: getBudgets/getCategories/getTransactions now reject
    // on a genuine query failure instead of silently resolving to [] —
    // caught here so every caller (mount or realtime) never sees an
    // unhandled rejection.
    // State setters only run after a successful resolve, so a caught
    // failure leaves the previously-loaded budgets/categories/transactions
    // on screen.
    try {
      const [b, c, t] = await Promise.all([
        getBudgets(),
        getCategories(),
        getTransactions(),
      ]);
      setBudgets(b);
      setCategories(c);
      setTransactions(t);
      setBudgetsLoadError(null);
    } catch (error) {
      console.error("[BudgetsPage] reloadData failed:", error);
      setBudgetsLoadError(
        "Không thể tải dữ liệu ngân sách. Vui lòng tải lại trang.",
      );
    } finally {
      setIsLoadingBudgets(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reloadData]);

  // REALTIME-NAV-INTEGRITY-1: category planning-group/type changes affect
  // which budgets are considered real-expense budgets and how their cards are
  // labelled. Keep every read dependency in the realtime contract, not only
  // the two tables that hold budget/transaction rows themselves.
  useRealtimeTable(["budgets", "transactions", "categories"], reloadData);

  // ── PRESERVED: expense categories ─────────────────────────────────────────
  const expenseCategories = useMemo(
    () =>
      categories.filter(
        (item) =>
          item.type === "expense" &&
          item.id !== "saving-demo" &&
          item.id !== "trading-capital",
      ),
    [categories],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const getCategoryGroup = useCallback(
    (categoryId: string): CategoryPlanningGroup => {
      return getCategoryPlanningGroup(categoryById.get(categoryId));
    },
    [categoryById],
  );

  const isRealExpenseGroup = useCallback(
    (categoryId: string) => {
      const group = getCategoryGroup(categoryId);
      return group === "fixed" || group === "variable";
    },
    [getCategoryGroup],
  );

  // MYFINANCE-CROSSPAGE-1: Budget analytics consume the same exact global
  // dateRange as Dashboard/Transactions/Reports. Budget rows remain monthly
  // planning artifacts, but their spending is intersected with the selected
  // period (important for custom ranges that cut through a month).
  const periodTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const day = transaction.date.slice(0, 10);
        return day >= dateRange.startDate && day <= dateRange.endDate;
      }),
    [dateRange.endDate, dateRange.startDate, transactions],
  );

  // ── Canonical: delegates to calculateBudgetSpending ───────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function getSpent(budget: Budget) {
    return calculateBudgetSpending({
      budget,
      transactions: periodTransactions,
      categories,
    }).spent;
  }

  // ── NEW: Smart Budget analytics ───────────────────────────────────────────
  const smartBudget = useMemo(
    () => computeSmartBudget(transactions, categories, budgets),
    [transactions, categories, budgets],
  );

  const realExpenseViolations = useMemo(
    () =>
      smartBudget.violations.filter((item) =>
        isRealExpenseGroup(item.categoryId),
      ),
    [isRealExpenseGroup, smartBudget.violations],
  );

  const realExpenseTrends = useMemo(
    () =>
      smartBudget.overspendingTrend.filter((item) =>
        isRealExpenseGroup(item.categoryId),
      ),
    [isRealExpenseGroup, smartBudget.overspendingTrend],
  );

  const filteredBudgets = useMemo(() => {
    const startMonth = dateRange.startDate.slice(0, 7);
    const endMonth = dateRange.endDate.slice(0, 7);
    return budgets.filter(
      (budget) => budget.month >= startMonth && budget.month <= endMonth,
    );
  }, [budgets, dateRange.endDate, dateRange.startDate]);

  // ── Selected-period budget summary ─────────────────────────────────────────
  const filteredSummary = useMemo(() => {
    const realExpenseBudgets = filteredBudgets.filter((budget) =>
      isRealExpenseGroup(budget.categoryId),
    );
    const totalLimit = realExpenseBudgets.reduce(
      (s, b) => s + b.limitAmount,
      0,
    );
    const totalSpent = realExpenseBudgets.reduce(
      (s, b) => s + getSpent(b),
      0,
    );
    return {
      totalLimit,
      totalSpent,
      remaining: totalLimit - totalSpent,
      percent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0,
    };
  }, [filteredBudgets, getSpent, isRealExpenseGroup]);

  const budgetForecast = useMemo(() => {
    if (filterMode === "month") {
      return getBudgetForecast(
        filteredSummary.totalLimit,
        filteredSummary.totalSpent,
        activeMonth,
      );
    }

    // A multi-month/global custom period is already an aggregate; do not
    // extrapolate that aggregate as though all spending happened in the
    // anchor month. Health uses the actual selected-period utilization.
    return {
      projectedPercent: filteredSummary.percent,
      confidenceWeight: 1,
    };
  }, [activeMonth, filterMode, filteredSummary]);

  const periodIncome = useMemo(
    () =>
      periodTransactions
        .filter((transaction) => transaction.type === "income")
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    [periodTransactions],
  );

  const financialPlanning = useMemo(() => {
    type PlanningBudgetItem = {
      categoryId: string;
      categoryName: string;
      group: CategoryPlanningGroup;
      spent: number;
      limit: number;
      projectedSpend: number;
    };

    const fixedItems: PlanningBudgetItem[] = [];
    const variableItems: PlanningBudgetItem[] = [];
    const savingItems: PlanningBudgetItem[] = [];
    const investmentItems: PlanningBudgetItem[] = [];
    const uncategorizedItems: PlanningBudgetItem[] = [];

    filteredBudgets.forEach((budget) => {
      const category = categoryById.get(budget.categoryId);
      const categoryName = category?.name ?? "Danh mục";
      const group = getCategoryPlanningGroup(category);
      const spent = getSpent(budget);
      const forecast = getBudgetForecast(
        budget.limitAmount,
        spent,
        budget.month,
      );
      const item: PlanningBudgetItem = {
        categoryId: budget.categoryId,
        categoryName,
        group,
        spent,
        limit: budget.limitAmount,
        projectedSpend: forecast.projectedSpend,
      };

      if (group === "fixed") {
        fixedItems.push(item);
      } else if (group === "variable") {
        variableItems.push(item);
      } else if (group === "saving") {
        savingItems.push(item);
      } else if (group === "investment") {
        investmentItems.push(item);
      } else {
        uncategorizedItems.push(item);
      }
    });

    const sumBy = (
      items: PlanningBudgetItem[],
      key: "spent" | "limit" | "projectedSpend",
    ) => items.reduce((sum, item) => sum + item[key], 0);

    const fixedLimit = sumBy(fixedItems, "limit");
    const variableLimit = sumBy(variableItems, "limit");
    const savingLimit = sumBy(savingItems, "limit");
    const investmentLimit = sumBy(investmentItems, "limit");

    const classifyPlanningTransaction = (
      transaction: Transaction,
    ): CategoryPlanningGroup | null => {
      const transactionType = String(transaction.type);
      const category = categoryById.get(transaction.categoryId);
      const categoryGroup = getCategoryPlanningGroup(category);

      if (transactionType === "income" || transactionType === "transfer") {
        return null;
      }

      if (transactionType === "saving") {
        return "saving";
      }

      if (transactionType === "investment") {
        return "investment";
      }

      if (
        categoryGroup === "fixed" ||
        categoryGroup === "variable" ||
        categoryGroup === "saving" ||
        categoryGroup === "investment"
      ) {
        return categoryGroup;
      }

      return categoryGroup === "income" ? null : categoryGroup;
    };

    const actualPlanningSpent = periodTransactions.reduce(
      (summary, transaction) => {
        const group = classifyPlanningTransaction(transaction);
        if (group === "fixed") summary.fixed += transaction.amount;
        if (group === "variable") summary.variable += transaction.amount;
        if (group === "saving") summary.saving += transaction.amount;
        if (group === "investment") summary.investment += transaction.amount;
        return summary;
      },
      {
        fixed: 0,
        variable: 0,
        saving: 0,
        investment: 0,
      },
    );

    const fixedSpent = actualPlanningSpent.fixed;
    const variableSpent = actualPlanningSpent.variable;
    const savingSpent = actualPlanningSpent.saving;
    const investmentSpent = actualPlanningSpent.investment;
    const uncategorizedSpent = sumBy(uncategorizedItems, "spent");
    const fixedProjected = sumBy(fixedItems, "projectedSpend");
    const variableProjected = sumBy(variableItems, "projectedSpend");
    const savingProjected = sumBy(savingItems, "projectedSpend");
    const investmentProjected = sumBy(investmentItems, "projectedSpend");
    const realExpenseSpent = fixedSpent + variableSpent;
    const futureAllocationSpent = savingSpent + investmentSpent;
    const realExpenseProjected = fixedProjected + variableProjected;
    const effectiveIncome =
      periodIncome > 0
        ? periodIncome
        : Math.max(
            filteredSummary.totalLimit,
            realExpenseSpent + futureAllocationSpent,
          );
    const fixedRatio =
      effectiveIncome > 0
        ? Math.round((fixedSpent / effectiveIncome) * 100)
        : 0;
    const variableRatio =
      effectiveIncome > 0
        ? Math.round((variableSpent / effectiveIncome) * 100)
        : 0;
    const savingRatio =
      effectiveIncome > 0
        ? Math.round((futureAllocationSpent / effectiveIncome) * 100)
        : 0;
    const stabilityScore = getStabilityScore(
      fixedRatio,
      variableRatio,
      savingRatio,
    );
    const fixedStatus = getFixedCostStatus(fixedRatio);

    return {
      fixedItems,
      variableItems,
      savingItems,
      investmentItems,
      uncategorizedItems,
      fixedSpent,
      variableSpent,
      savingSpent,
      investmentSpent,
      uncategorizedSpent,
      fixedLimit,
      variableLimit,
      savingLimit,
      investmentLimit,
      fixedProjected,
      variableProjected,
      savingProjected,
      investmentProjected,
      realExpenseSpent,
      futureAllocationSpent,
      realExpenseProjected,
      fixedRatio,
      variableRatio,
      savingRatio,
      stabilityScore,
      fixedStatus,
      effectiveIncome,
    };
  }, [
    categoryById,
    filteredBudgets,
    filteredSummary.totalLimit,
    getSpent,
    periodIncome,
    periodTransactions,
  ]);

  const budgetHealthScore = useMemo(() => {
    if (filteredSummary.totalLimit <= 0) return 0;

    const currentUsagePenalty =
      filteredSummary.percent <= 70
        ? 0
        : filteredSummary.percent <= 100
          ? (filteredSummary.percent - 70) * 0.45
          : 18 + (filteredSummary.percent - 100) * 0.8;

    const forecastPenalty =
      budgetForecast.projectedPercent <= 100
        ? 0
        : Math.min(28, (budgetForecast.projectedPercent - 100) * 0.7) *
          budgetForecast.confidenceWeight;

    const violationPenalty = Math.min(18, realExpenseViolations.length * 5);
    const trendPenalty = Math.min(10, realExpenseTrends.length * 3);
    const fixedCostPenalty =
      financialPlanning.fixedRatio <= 40
        ? 0
        : financialPlanning.fixedRatio <= 60
          ? (financialPlanning.fixedRatio - 40) * 0.4
          : 8 + (financialPlanning.fixedRatio - 60) * 0.65;

    return Math.round(
      clampNumber(
        100 -
          currentUsagePenalty -
          forecastPenalty -
          violationPenalty -
          trendPenalty -
          fixedCostPenalty,
        0,
        100,
      ),
    );
  }, [
    budgetForecast,
    filteredSummary,
    financialPlanning.fixedRatio,
    realExpenseTrends.length,
    realExpenseViolations.length,
  ]);

  // ── NEW: Category analysis lookup map ─────────────────────────────────────
  const categoryAnalysisMap = useMemo(
    () => new Map(smartBudget.categoryAnalysis.map((a) => [a.categoryId, a])),
    [smartBudget],
  );

  const previousMonth = useMemo(
    () => getPreviousMonthKey(activeMonth),
    [activeMonth],
  );

  const previousMonthBudgets = useMemo(
    () => budgets.filter((budget) => budget.month === previousMonth),
    [budgets, previousMonth],
  );

  const canClonePreviousBudget =
    filterMode === "month" &&
    filteredBudgets.length === 0 &&
    previousMonthBudgets.length > 0;

  // ── NEW: Pie data for budget allocation ───────────────────────────────────
  const pieData = useMemo(() => {
    const limitByCategory = new Map<string, number>();
    filteredBudgets.forEach((budget) => {
      limitByCategory.set(
        budget.categoryId,
        (limitByCategory.get(budget.categoryId) ?? 0) + budget.limitAmount,
      );
    });

    return Array.from(limitByCategory.entries()).map(
      ([categoryId, value], index) => ({
        name: categories.find((category) => category.id === categoryId)?.name ??
          "Khác",
        value,
        color: PIE_COLORS[index % PIE_COLORS.length],
      }),
    );
  }, [filteredBudgets, categories]);

  // ── NEW: Health score ─────────────────────────────────────────────────────
  const healthGrade =
    budgetHealthScore >= 85
      ? { gradient: "from-emerald-500 to-green-500", label: "Xuất sắc" }
      : budgetHealthScore >= 70
        ? { gradient: "from-blue-500 to-cyan-500", label: "Tốt" }
        : budgetHealthScore >= 55
          ? { gradient: "from-amber-400 to-orange-500", label: "Cần chú ý" }
          : { gradient: "from-rose-500 to-red-500", label: "Cần cải thiện" };

  // ── PRESERVED: CRUD ───────────────────────────────────────────────────────
  function openCreateForm() {
    setSaveError(null);
    setForm({
      ...emptyForm,
      categoryId: expenseCategories[0]?.id ?? "",
      month: activeMonth,
    });
    setIsFormOpen(true);
  }

  useQuickActionCreateIntent(openCreateForm);
  useSuppressGlobalFabsWhileOpen(isFormOpen || !!pendingAction);

  // Contextual entity focus from Dashboard/Header (?budgetId=...): scroll to
  // and briefly highlight the matching card once it renders. A missing or
  // already-deleted budgetId is ignored — the page just loads normally.
  const searchParams = useSearchParams();
  const focusBudgetId = parseFocusId(searchParams, "budgetId");
  const [highlightedBudgetId, setHighlightedBudgetId] = useState<string | null>(
    null,
  );
  const focusedBudgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusBudgetId || focusedBudgetIdRef.current === focusBudgetId) return;
    const el = document.getElementById(`budget-card-${focusBudgetId}`);
    if (!el) return;

    focusedBudgetIdRef.current = focusBudgetId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const highlightTimer = window.setTimeout(
      () => setHighlightedBudgetId(focusBudgetId),
      0,
    );
    const clearTimer = window.setTimeout(
      () => setHighlightedBudgetId(null),
      2500,
    );
    return () => {
      window.clearTimeout(highlightTimer);
      window.clearTimeout(clearTimer);
    };
  }, [focusBudgetId, filteredBudgets]);

  function openEditForm(budget: Budget) {
    setForm({
      id: budget.id,
      categoryId: budget.categoryId,
      month: budget.month,
      limitAmount: String(budget.limitAmount),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const limitAmount = Number(form.limitAmount);
    if (!form.categoryId) {
      setSaveError("Vui lòng chọn danh mục");
      return;
    }
    if (!form.month) {
      setSaveError("Vui lòng chọn tháng");
      return;
    }
    if (!limitAmount || limitAmount <= 0) {
      setSaveError("Vui lòng nhập ngân sách hợp lệ");
      return;
    }
    const budget = {
      id: form.id ?? crypto.randomUUID(),
      categoryId: form.categoryId,
      month: form.month,
      limitAmount,
      rolloverAmount: 0,
    } as Budget;
    setSaveError(null);
    const { error } = form.id
      ? await updateBudget(budget)
      : await addBudget(budget);
    if (error) {
      setSaveError(error);
      return;
    }
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleClonePreviousBudget() {
    if (!canClonePreviousBudget || isCloningPrevious) return;

    setIsCloningPrevious(true);

    try {
      const existingCategoryIds = new Set(
        budgets
          .filter((budget) => budget.month === activeMonth)
          .map((budget) => budget.categoryId),
      );

      const cloneItems = previousMonthBudgets.filter(
        (budget) => !existingCategoryIds.has(budget.categoryId),
      );

      if (cloneItems.length === 0) {
        toast({
          variant: "success",
          message: "Ngân sách tháng này đã có đủ danh mục từ tháng trước.",
        });
        return;
      }

      for (const item of cloneItems) {
        const clonedBudget = {
          id: crypto.randomUUID(),
          categoryId: item.categoryId,
          month: activeMonth,
          limitAmount: item.limitAmount,
          rolloverAmount: 0,
        } as Budget;

        const { error } = await addBudget(clonedBudget);

        if (error) {
          toast({
            variant: "error",
            message: "Lỗi sao chép ngân sách: " + error,
          });
          return;
        }
      }

      toast({
        variant: "success",
        message: `Đã sao chép ${cloneItems.length} ngân sách từ tháng ${previousMonth}.`,
      });
      await reloadData();
    } finally {
      setIsCloningPrevious(false);
    }
  }

  function handleDelete(id: string) {
    setPendingAction({
      title: "Xóa ngân sách?",
      description:
        "Hành động này không thể hoàn tác. Ngân sách sẽ bị xóa khỏi tài khoản của bạn.",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await deleteBudget(id);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa ngân sách: " + error });
          return;
        }
        toast({ variant: "success", message: "Đã xóa ngân sách thành công." });
        await reloadData();
      },
    });
  }

  // ─── Status helpers ───────────────────────────────────────────────────────
  const STATUS_STYLE: Record<
    string,
    { badge: string; bar: string; border: string }
  > = {
    over: {
      badge: "bg-rose-100 text-rose-700 border-rose-200",
      bar: "#ef4444",
      border: "border-rose-100",
    },
    near: {
      badge: "bg-amber-100 text-amber-700 border-amber-200",
      bar: "#f59e0b",
      border: "border-amber-100",
    },
    "on-track": {
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
      bar: "#10b981",
      border: "border-emerald-100",
    },
    "no-budget": {
      badge: "bg-slate-100 text-slate-600 border-slate-200",
      bar: "#94a3b8",
      border: "border-slate-200",
    },
    "no-spend": {
      badge: "bg-blue-100 text-blue-700 border-blue-200",
      bar: "#2563eb",
      border: "border-blue-100",
    },
  };

  const STATUS_LABEL: Record<string, string> = {
    over: "Vượt ngân sách",
    near: "Sắp đạt giới hạn",
    "on-track": "Đúng hạn mức",
    "no-budget": "Chưa có ngân sách",
    "no-spend": "Chưa chi tiêu",
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3.5 overflow-x-hidden sm:space-y-6">
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-2xl border border-[#DCE6EF] bg-white shadow-[0_6px_18px_rgba(54,83,107,0.07)] sm:rounded-4xl">
        <div className="bg-linear-to-br from-white via-[#F9FCFF] to-[#F1F6FB] px-3.5 py-3.5 sm:px-7 sm:py-7">
          {/* Top row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Budget Intelligence
              </p>
              <h1 className="mt-1 text-[22px] font-black tracking-tight text-[#36536B] sm:text-4xl">
                Ngân sách chi tiêu
              </h1>
              <p className="mt-1 hidden text-sm text-[#61788F] sm:block">
                Thiết lập hạn mức và theo dõi chi tiêu theo từng danh mục.
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#2F80ED] px-4 py-2.5 text-sm font-bold text-white shadow-[0_5px_14px_rgba(47,128,237,0.20)] transition-all hover:bg-[#2676DE] active:scale-[.98] sm:min-h-12 sm:w-auto sm:rounded-2xl sm:px-5 sm:py-3"
            >
              <Plus size={17} />
              Tạo ngân sách
            </button>
          </div>

          {/* Executive KPI cards */}
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tổng ngân sách"
              value={formatVND(filteredSummary.totalLimit)}
              sub={filteredBudgets.length + " ngân sách · " + filterLabel}
              tone="blue"
              icon={<Target size={16} />}
            />
            <KpiCard
              label="Đã sử dụng"
              value={formatVND(filteredSummary.totalSpent)}
              sub={filteredSummary.percent + "% hạn mức"}
              tone="violet"
              icon={<ArrowDownRight size={16} />}
            />
            <KpiCard
              label={
                filteredSummary.remaining < 0 ? "Vượt ngân sách" : "Còn lại"
              }
              value={formatVND(Math.abs(filteredSummary.remaining))}
              sub={
                filteredSummary.remaining < 0
                  ? `Vượt ${Math.max(0, filteredSummary.percent - 100)}% hạn mức`
                  : "Có thể tiếp tục chi"
              }
              tone={filteredSummary.remaining < 0 ? "rose" : "emerald"}
              icon={
                filteredSummary.remaining >= 0 ? (
                  <ArrowUpRight size={16} />
                ) : (
                  <ArrowDownRight size={16} />
                )
              }
            />
            <KpiCard
              label="Tỷ lệ sử dụng"
              value={filteredSummary.percent + "%"}
              sub={
                filteredSummary.percent >= 100
                  ? "Cần điều chỉnh ngay"
                  : filteredSummary.percent >= 80
                    ? "Sắp đạt giới hạn"
                    : "Trong vùng an toàn"
              }
              tone={
                filteredSummary.percent >= 100
                  ? "orange"
                  : filteredSummary.percent >= 80
                    ? "amber"
                    : "cyan"
              }
              icon={<ChartPie size={16} />}
            />
            <div className="col-span-2 rounded-2xl border border-rose-200 bg-linear-to-br from-rose-50 to-white p-3 shadow-sm xl:col-span-1 xl:rounded-3xl xl:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-500">
                    Budget Health
                  </p>
                  <p className="mt-1 text-xl font-black tracking-tight text-rose-700 sm:text-2xl">
                    {budgetHealthScore}
                    <span className="text-sm text-rose-400">/100</span>
                  </p>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 sm:size-9 sm:rounded-2xl">
                  <ShieldCheck size={16} />
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-100 sm:mt-3 sm:h-2">
                <div
                  className="h-full rounded-full bg-rose-500"
                  style={{ width: Math.min(budgetHealthScore, 100) + "%" }}
                />
              </div>

              <p className="mt-1.5 line-clamp-1 text-[10px] font-semibold leading-4 text-rose-600/80 sm:mt-2 sm:line-clamp-2 sm:text-[11px]">
                {filteredSummary.remaining < 0
                  ? `${realExpenseViolations.length} danh mục cần rà soát · ${healthGrade.label}`
                  : `${healthGrade.label} · ngân sách đang được kiểm soát`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {filteredSummary.totalLimit > 0 && (
        <section>
          <div
            className={
              "rounded-2xl border p-3.5 shadow-sm sm:rounded-4xl sm:p-5 " +
              financialPlanning.fixedStatus.bg +
              " " +
              financialPlanning.fixedStatus.border
            }
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm sm:size-10 sm:rounded-2xl">
                  <ShieldCheck size={17} />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#36536B]">
                    Chi phí cố định
                  </h2>
                  <p className="hidden text-xs text-[#61788F] sm:block">
                    Nhà ở · điện nước · phí định kỳ
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={
                    "text-xl font-black sm:text-2xl " + financialPlanning.fixedStatus.color
                  }
                >
                  {financialPlanning.fixedRatio}%
                </p>
                <p className="text-[10px] font-bold text-slate-500">
                  {financialPlanning.fixedStatus.label}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <MetricTile
                label="Đã chi cố định"
                value={formatVND(financialPlanning.fixedSpent)}
                sub={`/ ${formatVND(financialPlanning.effectiveIncome)} thu nhập`}
              />
              <MetricTile
                label="Chi biến đổi"
                value={`${financialPlanning.variableRatio}%`}
                sub={formatVND(financialPlanning.variableSpent)}
              />
              <MetricTile
                label="Ổn định tài chính"
                value={`${financialPlanning.stabilityScore}/100`}
                sub="Planning score"
              />
            </div>

            <div className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-2">
              {financialPlanning.fixedItems.slice(0, 3).map((item) => (
                <div
                  key={item.categoryId}
                  className="flex items-center justify-between rounded-xl bg-white/80 px-2.5 py-2 text-[11px] sm:rounded-2xl sm:px-3 sm:py-2.5 sm:text-xs"
                >
                  <span className="font-bold text-slate-700">
                    {item.categoryName}
                  </span>
                  <span className="font-black text-slate-900">
                    {formatVND(item.spent)}
                  </span>
                </div>
              ))}
              {financialPlanning.fixedItems.length === 0 && (
                <p className="rounded-2xl bg-white/75 px-3 py-3 text-xs leading-5 text-slate-500">
                  Chưa phát hiện danh mục chi phí cố định. Hãy phân loại Nhà ở,
                  Điện, Internet hoặc Bảo hiểm để theo dõi chính xác hơn.
                </p>
              )}
            </div>
          </div>

        </section>
      )}

      {budgets.length > 0 && (
        <section className="rounded-2xl border border-[#DCE6EF] bg-white p-3.5 shadow-sm sm:rounded-4xl sm:p-6">
          <div className="mb-3 flex items-center gap-2.5 sm:mb-5 sm:gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#EAF3FC] text-[#2F80ED] shadow-sm sm:size-10 sm:rounded-2xl sm:bg-linear-to-br sm:from-blue-600 sm:to-cyan-500 sm:text-white">
              <ChartPie size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-[#36536B]">
                Phân bổ ngân sách
              </h2>
              <p className="text-xs text-slate-500">
                {filterLabel} · cơ cấu hạn mức theo danh mục
              </p>
            </div>
          </div>

          {pieData.length > 0 ? (
            <div className="flex flex-col gap-3 sm:gap-6 lg:flex-row lg:items-center">
              <div className="flex shrink-0 justify-center">
                <PieChart width={152} height={152}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={44}
                    outerRadius={68}
                    paddingAngle={3}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name + index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="grid flex-1 gap-x-6 gap-y-2 md:grid-cols-2 md:gap-x-8 md:gap-y-3">
                {pieData.map((item) => {
                  const percent =
                    filteredSummary.totalLimit > 0
                      ? Math.round(
                          (item.value / filteredSummary.totalLimit) * 100,
                        )
                      : 0;
                  return (
                    <div
                      key={item.name}
                      title={`${item.name}: ${formatVND(item.value)} (${percent}%)`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: item.color }}
                          />
                          <span className="truncate font-bold text-slate-700">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-black text-slate-900">
                            {percent}%
                          </span>
                          <span className="text-slate-400">
                            {formatVND(item.value)}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: percent + "%",
                            background: item.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">
              Chưa có dữ liệu phân bổ cho kỳ đã chọn.
            </p>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 · Budget Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Section label */}
        <div className="mb-3 flex items-center gap-2 px-1 sm:mb-4">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">
            {filteredBudgets.length} ngân sách · {filterLabel}
          </p>
        </div>

        <div className="grid gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredBudgets.map((budget) => {
            const category = categories.find((c) => c.id === budget.categoryId);
            const spent = getSpent(budget);
            const pct =
              budget.limitAmount > 0
                ? Math.round((spent / budget.limitAmount) * 100)
                : 0;
            const remaining = budget.limitAmount - spent;

            const analysis = categoryAnalysisMap.get(budget.categoryId);
            const status: string =
              analysis?.status ??
              (spent > budget.limitAmount
                ? "over"
                : spent >= budget.limitAmount * 0.85
                  ? "near"
                  : "on-track");
            const trend = analysis?.trend ?? "stable";

            const s = STATUS_STYLE[status] ?? STATUS_STYLE["on-track"];
            const label = STATUS_LABEL[status] ?? "Đúng hạn mức";

            return (
              <div
                key={budget.id}
                id={`budget-card-${budget.id}`}
                className={
                  "group relative rounded-2xl border bg-white p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl sm:p-5 " +
                  s.border +
                  (highlightedBudgetId === budget.id
                    ? " ring-2 ring-blue-400 ring-offset-2"
                    : "")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF3FC] text-[#2F80ED] shadow-sm sm:size-11 sm:rounded-2xl sm:bg-linear-to-br sm:from-blue-600 sm:to-cyan-500 sm:text-white">
                      <ChartPie size={18} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-[15px] font-black leading-snug text-[#36536B] sm:text-base">
                        {category?.name ?? "Danh mục"}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            s.badge
                          }
                        >
                          {label}
                        </span>
                        {filterMode !== "month" && (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {budget.month}
                          </span>
                        )}
                        {trend === "increasing" && (
                          <TrendingUp size={11} className="text-rose-500" />
                        )}
                        {trend === "decreasing" && (
                          <TrendingDown
                            size={11}
                            className="text-emerald-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="hidden shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
                    <Link
                      href={buildTransactionsHref({
                        categoryId: budget.categoryId,
                        month: budget.month,
                      })}
                      aria-label="Xem giao dịch"
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <ArrowUpRight size={13} />
                    </Link>
                    <button
                      onClick={() => openEditForm(budget)}
                      aria-label="Sửa ngân sách"
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      aria-label="Xóa ngân sách"
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-5 sm:gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Đã chi
                    </p>
                    <p
                      className={
                        "mt-1 wrap-break-word text-base font-black leading-tight sm:text-xl " +
                        (status === "over" ? "text-rose-600" : "text-slate-900")
                      }
                    >
                      {formatVND(spent)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Hạn mức
                    </p>
                    <p className="mt-1 wrap-break-word text-sm font-black leading-tight text-slate-700 sm:text-base">
                      {formatVND(budget.limitAmount)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 sm:mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span
                      className={
                        remaining < 0
                          ? "font-bold text-rose-600"
                          : "font-bold text-emerald-600"
                      }
                    >
                      {remaining < 0
                        ? `Vượt ${formatVND(Math.abs(remaining))}`
                        : `Còn ${formatVND(remaining)}`}
                    </span>
                    <span
                      className={
                        "font-black " +
                        (status === "over"
                          ? "text-rose-600"
                          : status === "near"
                            ? "text-amber-600"
                            : "text-slate-700")
                      }
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 sm:h-2.5">
                    <div
                      className="h-2 rounded-full transition-all duration-500 sm:h-2.5"
                      style={{
                        width: Math.min(pct, 100) + "%",
                        background: s.bar,
                      }}
                    />
                  </div>
                </div>

                {/* BUDGETS-MOBILE-POLISH-1: mobile keeps the same direct action access as desktop. */}
                <div className="mt-3 grid grid-cols-3 gap-2 lg:hidden">
                  <Link
                    href={buildTransactionsHref({
                      categoryId: budget.categoryId,
                      month: budget.month,
                    })}
                    className="flex min-h-9 items-center justify-center gap-1 rounded-xl border border-emerald-100 bg-emerald-50/40 px-1 text-[11px] font-bold text-emerald-700"
                  >
                    <ArrowUpRight size={12} />
                    Giao dịch
                  </Link>
                  <button
                    onClick={() => openEditForm(budget)}
                    className="flex min-h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 px-1 text-[11px] font-bold text-[#61788F]"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(budget.id)}
                    className="flex min-h-9 items-center justify-center gap-1 rounded-xl border border-rose-100 px-1 text-[11px] font-bold text-rose-500"
                  >
                    <Trash2 size={12} />
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {/* FINANCE-DATA-1B: "Chưa có ngân sách nào" is a real financial
              conclusion — it must not render while we're still loading, or
              worse, when the initial load actually FAILED (getBudgets now
              rejects instead of silently resolving []). */}
          {filteredBudgets.length === 0 && isLoadingBudgets && (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-center sm:rounded-4xl sm:p-12 md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-slate-100">
                <ChartPie size={24} className="text-slate-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Đang tải dữ liệu ngân sách...
              </h3>
            </div>
          )}

          {filteredBudgets.length === 0 &&
            !isLoadingBudgets &&
            budgetsLoadError && (
              <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/40 p-6 text-center sm:rounded-4xl sm:p-12 md:col-span-2 xl:col-span-3">
                <div className="flex size-16 items-center justify-center rounded-3xl bg-rose-100">
                  <ChartPie size={24} className="text-rose-400" />
                </div>
                <h3 className="mt-4 text-base font-black text-slate-700">
                  Không thể tải dữ liệu ngân sách
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  {budgetsLoadError}
                </p>
              </div>
            )}

          {/* Empty state */}
          {filteredBudgets.length === 0 &&
            !isLoadingBudgets &&
            !budgetsLoadError && (
              <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-6 text-center sm:rounded-4xl sm:p-12 md:col-span-2 xl:col-span-3">
                <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                  <ChartPie size={24} className="text-blue-400" />
                </div>
                <h3 className="mt-4 text-base font-black text-slate-700">
                  {budgets.length > 0
                    ? "Không có ngân sách trong " + filterLabel
                    : "Chưa có ngân sách nào"}
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  {budgets.length > 0
                    ? canClonePreviousBudget
                      ? `Sao chép nhanh ngân sách tháng ${previousMonth}, hoặc tạo ngân sách mới.`
                      : "Chọn kỳ khác hoặc tạo ngân sách mới."
                    : "Bắt đầu bằng cách tạo ngân sách đầu tiên."}
                </p>
                <div className="mt-5 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
                  <button
                    onClick={openCreateForm}
                    className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                  >
                    <Plus size={15} />
                    Tạo ngân sách
                  </button>

                  {canClonePreviousBudget && (
                    <button
                      type="button"
                      onClick={handleClonePreviousBudget}
                      disabled={isCloningPrevious}
                      className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ChartPie size={15} />
                      {isCloningPrevious
                        ? "Đang sao chép..."
                        : `Sao chép tháng ${previousMonth}`}
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[calc(var(--app-height,100dvh)-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-4xl bg-white shadow-2xl sm:rounded-4xl">
            {/* Modal header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-4 sm:p-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa ngân sách" : "Tạo ngân sách"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Thiết lập hạn mức chi tiêu cho danh mục.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6"
            >
              <div className="space-y-4">
                {/* Category select */}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-black text-slate-700">
                    Danh mục
                  </span>
                  <select
                    value={form.categoryId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, categoryId: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-blue-400 focus:bg-white sm:text-sm"
                  >
                    <option value="">Chọn danh mục</option>
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Month */}
                <Input
                  label="Tháng"
                  type="month"
                  value={form.month}
                  onChange={(v) => setForm((p) => ({ ...p, month: v }))}
                />

                {/* Amount with ₫ prefix */}
                <div>
                  <CurrencyInput
                    label="Hạn mức ngân sách"
                    value={form.limitAmount}
                    onChange={(raw) =>
                      setForm((p) => ({ ...p, limitAmount: raw }))
                    }
                    placeholder="5000000"
                  />
                </div>
              </div>

              {/* Actions */}
              <SaveError
                message={saveError}
                onDismiss={() => setSaveError(null)}
              />
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98]"
                >
                  {form.id ? "Lưu thay đổi" : "Tạo ngân sách"}
                </button>
              </div>
            </form>
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

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-white/85 p-2.5 shadow-sm shadow-slate-100/40 sm:rounded-2xl sm:p-3">
      <p className="line-clamp-2 min-h-7 text-[8px] font-black uppercase leading-3.5 tracking-[0.04em] text-[#8CA0B3] sm:min-h-0 sm:text-[10px]">{label}</p>
      <p className="mt-1 truncate text-[11px] font-black tracking-[-0.035em] text-[#36536B] sm:text-lg sm:tracking-normal">{value}</p>
      <p className="mt-0.5 hidden text-xs text-[#61788F] sm:block">{sub}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "violet" | "emerald" | "rose" | "orange" | "amber" | "cyan";
  icon: React.ReactNode;
}) {
  const styles = {
    blue: {
      shell: "border-blue-200 bg-linear-to-br from-blue-50 to-white",
      label: "text-blue-500",
      value: "text-blue-700",
      note: "text-blue-500/80",
      icon: "bg-blue-100 text-blue-600",
    },
    violet: {
      shell: "border-violet-200 bg-linear-to-br from-violet-50 to-white",
      label: "text-violet-500",
      value: "text-violet-700",
      note: "text-violet-500/80",
      icon: "bg-violet-100 text-violet-600",
    },
    emerald: {
      shell: "border-emerald-200 bg-linear-to-br from-emerald-50 to-white",
      label: "text-emerald-500",
      value: "text-emerald-700",
      note: "text-emerald-500/80",
      icon: "bg-emerald-100 text-emerald-600",
    },
    rose: {
      shell: "border-rose-200 bg-linear-to-br from-rose-50 to-white",
      label: "text-rose-500",
      value: "text-rose-700",
      note: "text-rose-500/80",
      icon: "bg-rose-100 text-rose-600",
    },
    orange: {
      shell: "border-orange-200 bg-linear-to-br from-orange-50 to-white",
      label: "text-orange-500",
      value: "text-orange-700",
      note: "text-orange-500/80",
      icon: "bg-orange-100 text-orange-600",
    },
    amber: {
      shell: "border-amber-200 bg-linear-to-br from-amber-50 to-white",
      label: "text-amber-500",
      value: "text-amber-700",
      note: "text-amber-500/80",
      icon: "bg-amber-100 text-amber-600",
    },
    cyan: {
      shell: "border-cyan-200 bg-linear-to-br from-cyan-50 to-white",
      label: "text-cyan-500",
      value: "text-cyan-700",
      note: "text-cyan-500/80",
      icon: "bg-cyan-100 text-cyan-600",
    },
  };

  const style = styles[tone];

  // Mobile Finance UX: keep the complete amount visible on one line.
  // The font scales down by formatted string length instead of truncating.
  const mobileValueSize =
    value.length >= 20
      ? "text-[10px] tracking-[-0.055em]"
      : value.length >= 17
        ? "text-[11px] tracking-[-0.05em]"
        : value.length >= 14
          ? "text-[12px] tracking-[-0.045em]"
          : value.length >= 11
            ? "text-[14px] tracking-[-0.04em]"
            : "text-[18px] tracking-[-0.03em]";

  return (
    <div
      className={
        "min-w-0 overflow-hidden rounded-2xl border p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl sm:p-4 " +
        style.shell
      }
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5 sm:gap-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={
              "line-clamp-2 min-h-7 text-[8.5px] font-black uppercase leading-3.5 tracking-[0.09em] sm:min-h-0 sm:text-[10px] sm:leading-4 sm:tracking-[0.16em] " +
              style.label
            }
          >
            {label}
          </p>
          <p
            className={
              "mt-1.5 block w-full whitespace-nowrap font-black leading-none tabular-nums sm:mt-2 sm:text-[clamp(13px,1vw,20px)] sm:tracking-[-0.03em] " +
              mobileValueSize +
              " " +
              style.value
            }
            title={value}
          >
            {value}
          </p>
          <p
            className={
              "mt-1 line-clamp-1 min-h-4 text-[9.5px] font-semibold leading-4 sm:line-clamp-2 sm:min-h-8 sm:text-[11px] " +
              style.note
            }
          >
            {sub}
          </p>
        </div>

        <div
          className={
            "flex size-6.5 shrink-0 items-center justify-center rounded-lg sm:size-9 sm:rounded-2xl " +
            style.icon
          }
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-blue-400 focus:bg-white sm:text-sm"
      />
    </label>
  );
}
