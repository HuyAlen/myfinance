"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChartPie,
  Edit3,
  Lightbulb,
  Plus,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import type { Budget, Category, Transaction } from "@/src/types/finance";

import {
  addBudget,
  deleteBudget,
  getBudgets,
  getCategories,
  getTransactions,
  updateBudget,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";
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

function formatDeltaPercent(current: number, previous: number) {
  if (previous <= 0 && current > 0) return "+100%";
  if (previous <= 0) return "0%";
  const delta = Math.round(((current - previous) / previous) * 100);
  return (delta >= 0 ? "+" : "") + delta + "%";
}

function getTrendDeltaText(current: number, previous: number) {
  const delta = current - previous;
  if (delta === 0) {
    return `Giữ nguyên ở ${formatVND(current)} so với tháng trước.`;
  }

  const direction = delta > 0 ? "tăng" : "giảm";
  return `${formatVND(previous)} → ${formatVND(current)} · ${direction} ${formatVND(Math.abs(delta))} (${formatDeltaPercent(current, previous)}).`;
}

function getReadableMonths(months: number | null) {
  if (months === null || !Number.isFinite(months)) return "Chưa đủ dữ liệu";
  if (months < 12) return `~${months} tháng`;
  const years = months / 12;
  return `~${years.toFixed(years >= 10 ? 0 : 1)} năm`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();
  const router = useRouter();
  const [activeMonth, setActiveMonth] = useState(() => {
    const now = new Date();
    return (
      now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0")
    );
  });

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  async function reloadData() {
    const [b, c, t] = await Promise.all([
      getBudgets(),
      getCategories(),
      getTransactions(),
    ]);
    setBudgets(b);
    setCategories(c);
    setTransactions(t);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reloadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  useRealtimeTable(["budgets", "transactions"], reloadData);

  // ── PRESERVED: expense categories ─────────────────────────────────────────
  const expenseCategories = useMemo(
    () => categories.filter((item) => item.type === "expense"),
    [categories],
  );

  // ── PRESERVED: getSpent ───────────────────────────────────────────────────
  function getSpent(categoryId: string, month: string) {
    return transactions
      .filter(
        (item) =>
          item.type === "expense" &&
          item.categoryId === categoryId &&
          item.date.startsWith(month),
      )
      .reduce((sum, item) => sum + item.amount, 0);
  }

  // ── PRESERVED: budgetSummary (all budgets) ────────────────────────────────
  const budgetSummary = useMemo(() => {
    const totalLimit = budgets.reduce((sum, item) => sum + item.limitAmount, 0);
    const totalSpent = budgets.reduce(
      (sum, item) => sum + getSpent(item.categoryId, item.month),
      0,
    );
    return {
      totalLimit,
      totalSpent,
      remaining: totalLimit - totalSpent,
      percent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, transactions]);

  // ── NEW: Smart Budget analytics ───────────────────────────────────────────
  const smartBudget = useMemo(
    () => computeSmartBudget(transactions, categories, budgets),
    [transactions, categories, budgets],
  );

  // ── NEW: Month filter ─────────────────────────────────────────────────────
  const allMonths = useMemo(
    () => [...new Set(budgets.map((b) => b.month))].sort().reverse(),
    [budgets],
  );

  const filteredBudgets = useMemo(
    () => budgets.filter((b) => b.month === activeMonth),
    [budgets, activeMonth],
  );

  // ── NEW: Filtered summary for active month KPIs ───────────────────────────
  const filteredSummary = useMemo(() => {
    const totalLimit = filteredBudgets.reduce((s, b) => s + b.limitAmount, 0);
    const totalSpent = filteredBudgets.reduce(
      (s, b) => s + getSpent(b.categoryId, b.month),
      0,
    );
    return {
      totalLimit,
      totalSpent,
      remaining: totalLimit - totalSpent,
      percent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredBudgets, transactions]);

  const budgetForecast = useMemo(
    () =>
      getBudgetForecast(
        filteredSummary.totalLimit,
        filteredSummary.totalSpent,
        activeMonth,
      ),
    [activeMonth, filteredSummary],
  );

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

    const violationPenalty = Math.min(18, smartBudget.violations.length * 5);
    const trendPenalty = Math.min(10, smartBudget.overspendingTrend.length * 3);

    return Math.round(
      clampNumber(
        100 -
          currentUsagePenalty -
          forecastPenalty -
          violationPenalty -
          trendPenalty,
        0,
        100,
      ),
    );
  }, [budgetForecast, filteredSummary, smartBudget]);

  const budgetForecastInsights = useMemo(() => {
    const insights: string[] = [];

    if (budgetForecast.confidenceLevel === "low") {
      insights.push(
        `${budgetForecast.confidenceLabel}: ${budgetForecast.confidenceNote}`,
      );
    }

    if (budgetForecast.projectedOverage > 0) {
      insights.push(
        `Nếu giữ tốc độ chi hiện tại, ngân sách có thể vượt ${formatVND(budgetForecast.projectedOverage)} vào cuối tháng.`,
      );
    } else if (filteredSummary.totalLimit > 0) {
      insights.push(
        `Nếu giữ tốc độ chi hiện tại, bạn còn dư khoảng ${formatVND(Math.max(0, budgetForecast.projectedRemaining))} cuối tháng.`,
      );
    }

    const fastestTrend = smartBudget.overspendingTrend[0];
    if (fastestTrend) {
      insights.push(
        `${fastestTrend.categoryName} có biến động đáng chú ý. Xem chi tiết delta trong Smart Budget AI bên dưới.`,
      );
    }

    const topViolation = smartBudget.violations[0];
    if (topViolation) {
      insights.push(
        `${topViolation.categoryName} đã vượt ${formatVND(topViolation.overage)}, nên ưu tiên chỉnh hạn mức hoặc giảm chi.`,
      );
    }

    return insights.slice(0, 3);
  }, [budgetForecast, filteredSummary.totalLimit, smartBudget]);

  // ── NEW: Category analysis lookup map ─────────────────────────────────────
  const categoryAnalysisMap = useMemo(
    () => new Map(smartBudget.categoryAnalysis.map((a) => [a.categoryId, a])),
    [smartBudget],
  );

  const previousMonth = useMemo(
    () => getPreviousMonthKey(activeMonth),
    [activeMonth],
  );

  const spendingByCategory = useMemo(() => {
    const current = new Map<string, number>();
    const previous = new Map<string, number>();

    transactions.forEach((transaction) => {
      if (transaction.type !== "expense") return;
      const map = transaction.date.startsWith(activeMonth)
        ? current
        : transaction.date.startsWith(previousMonth)
          ? previous
          : null;
      if (!map) return;
      map.set(
        transaction.categoryId,
        (map.get(transaction.categoryId) ?? 0) + transaction.amount,
      );
    });

    return { current, previous };
  }, [activeMonth, previousMonth, transactions]);

  const v7Allocation = useMemo(() => {
    const normalizeBucket = (
      bucket: typeof smartBudget.allocation.needs,
      targetPercent: number,
      color: string,
      textColor: string,
    ) => {
      const percentOfTarget =
        bucket.targetAmount > 0
          ? Math.round((bucket.actualAmount / bucket.targetAmount) * 100)
          : 0;
      const status =
        percentOfTarget > 100
          ? "over"
          : percentOfTarget >= 85
            ? "near"
            : "safe";
      const difference = bucket.actualAmount - bucket.targetAmount;
      return {
        ...bucket,
        targetPercent,
        percentOfTarget,
        status,
        difference,
        color,
        textColor,
      };
    };

    return [
      normalizeBucket(
        smartBudget.allocation.needs,
        50,
        "#2563eb",
        "text-blue-700",
      ),
      normalizeBucket(
        smartBudget.allocation.wants,
        30,
        "#f59e0b",
        "text-amber-700",
      ),
      normalizeBucket(
        smartBudget.allocation.savings,
        20,
        "#10b981",
        "text-emerald-700",
      ),
    ];
  }, [smartBudget]);

  const topRiskCategories = useMemo(() => {
    const byCategory = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        spent: number;
        limit: number;
        projectedSpend: number;
        riskScore: number;
        reason: string;
        tone: "danger" | "warning" | "good";
      }
    >();

    filteredBudgets.forEach((budget) => {
      const categoryName =
        categories.find((category) => category.id === budget.categoryId)
          ?.name ?? "Danh mục";
      const spent = getSpent(budget.categoryId, budget.month);
      const forecast = getBudgetForecast(
        budget.limitAmount,
        spent,
        budget.month,
      );
      const usage =
        budget.limitAmount > 0 ? (spent / budget.limitAmount) * 100 : 0;
      const forecastUsage =
        budget.limitAmount > 0
          ? (forecast.projectedSpend / budget.limitAmount) * 100
          : 0;
      const riskScore = Math.round(Math.max(usage, forecastUsage));
      const projectedOverage = Math.max(
        0,
        forecast.projectedSpend - budget.limitAmount,
      );
      const overage = Math.max(0, spent - budget.limitAmount);
      const tone =
        overage > 0 || projectedOverage > 0
          ? "danger"
          : riskScore >= 85
            ? "warning"
            : "good";
      const reason =
        overage > 0
          ? `Đã vượt ${formatVND(overage)}.`
          : projectedOverage > 0
            ? `Dự kiến vượt ${formatVND(projectedOverage)} cuối tháng.`
            : riskScore >= 85
              ? `Đã dùng ${Math.round(usage)}% hạn mức.`
              : `Đang trong hạn mức.`;

      byCategory.set(budget.categoryId, {
        categoryId: budget.categoryId,
        categoryName,
        spent,
        limit: budget.limitAmount,
        projectedSpend: forecast.projectedSpend,
        riskScore,
        reason,
        tone,
      });
    });

    return [...byCategory.values()]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, filteredBudgets, transactions]);

  const budgetIntelligenceScore = useMemo(() => {
    if (filteredSummary.totalLimit <= 0) return 0;
    const riskPenalty = topRiskCategories.reduce((sum, item) => {
      if (item.tone === "danger") return sum + 8;
      if (item.tone === "warning") return sum + 4;
      return sum;
    }, 0);
    const allocationPenalty = v7Allocation.reduce((sum, item) => {
      if (item.percentOfTarget > 120) return sum + 8;
      if (item.percentOfTarget > 100) return sum + 4;
      return sum;
    }, 0);
    return Math.round(
      clampNumber(budgetHealthScore - riskPenalty - allocationPenalty, 0, 100),
    );
  }, [
    budgetHealthScore,
    filteredSummary.totalLimit,
    topRiskCategories,
    v7Allocation,
  ]);

  // ── NEW: Pie data for budget allocation ───────────────────────────────────
  const pieData = useMemo(
    () =>
      filteredBudgets.map((b, i) => ({
        name: categories.find((c) => c.id === b.categoryId)?.name ?? "Khác",
        value: b.limitAmount,
        color: PIE_COLORS[i % PIE_COLORS.length],
      })),
    [filteredBudgets, categories],
  );

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
    setForm({ ...emptyForm, categoryId: expenseCategories[0]?.id ?? "" });
    setIsFormOpen(true);
  }

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
    const budget: Budget = {
      id: form.id ?? crypto.randomUUID(),
      categoryId: form.categoryId,
      month: form.month,
      limitAmount,
    };
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
    <div className="space-y-6">
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 shadow-sm">
        <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          {/* Top row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Budget Intelligence
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Ngân sách chi tiêu
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Thiết lập hạn mức và theo dõi chi tiêu theo từng danh mục.
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
            >
              <Plus size={17} />
              Tạo ngân sách
            </button>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tổng ngân sách"
              value={formatVND(filteredSummary.totalLimit)}
              sub={filteredBudgets.length + " danh mục · tháng " + activeMonth}
              gradient="from-blue-500 to-blue-600"
              iconBg="bg-blue-400/30"
              icon={<Target size={16} />}
            />
            <KpiCard
              label="Đã sử dụng"
              value={formatVND(filteredSummary.totalSpent)}
              sub={filteredSummary.percent + "% hạn mức"}
              gradient="from-rose-400 to-rose-500"
              iconBg="bg-white/20"
              icon={<ArrowDownRight size={16} />}
            />
            <KpiCard
              label="Còn lại"
              value={formatVND(Math.abs(filteredSummary.remaining))}
              sub={
                filteredSummary.remaining < 0 ? "Vượt ngân sách" : "Khả dụng"
              }
              gradient={
                filteredSummary.remaining < 0
                  ? "from-rose-500 to-red-500"
                  : "from-emerald-500 to-emerald-600"
              }
              iconBg="bg-white/20"
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
                  ? "Vượt ngân sách"
                  : filteredSummary.percent >= 80
                    ? "Sắp đạt giới hạn"
                    : "An toàn"
              }
              gradient={
                filteredSummary.percent >= 100
                  ? "from-rose-500 to-red-500"
                  : filteredSummary.percent >= 80
                    ? "from-amber-400 to-orange-500"
                    : "from-emerald-500 to-teal-500"
              }
              iconBg="bg-white/20"
              icon={<ChartPie size={16} />}
            />
            {/* Health Score card */}
            <div
              className={
                "col-span-2 sm:col-span-1 rounded-2xl bg-gradient-to-br p-4 shadow-sm " +
                healthGrade.gradient
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
                Budget Health
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {budgetHealthScore}
                <span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{
                    width: Math.min(budgetHealthScore, 100) + "%",
                  }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-white/80">
                {healthGrade.label}
              </p>
            </div>
          </div>
        </div>
      </section>

      {filteredSummary.totalLimit > 0 && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ForecastCard
              label="Dự kiến chi tiêu cuối tháng"
              value={formatVND(budgetForecast.projectedSpend)}
              sub={budgetForecast.confidenceLabel}
              tone={
                budgetForecast.confidenceLevel === "low"
                  ? "warning"
                  : budgetForecast.isProjectedOver
                    ? "danger"
                    : "good"
              }
            />
            <ForecastCard
              label="Còn lại dự kiến"
              value={formatVND(Math.abs(budgetForecast.projectedRemaining))}
              sub={
                budgetForecast.projectedRemaining < 0
                  ? "Vượt dự kiến"
                  : "Còn dư cuối tháng"
              }
              tone={budgetForecast.projectedRemaining < 0 ? "danger" : "good"}
            />
            <ForecastCard
              label="Vượt dự kiến"
              value={
                budgetForecast.projectedOverage > 0
                  ? "+" + formatVND(budgetForecast.projectedOverage)
                  : "0 đ"
              }
              sub={budgetForecast.confidenceNote}
              tone={
                budgetForecast.projectedOverage > 0
                  ? "danger"
                  : budgetForecast.projectedPercent >= 85
                    ? "warning"
                    : "good"
              }
            />
            <ForecastCard
              label="Mức chi/ngày còn lại"
              value={formatVND(Math.round(budgetForecast.safeDailyBudget))}
              sub={
                budgetForecast.remainingDays > 0
                  ? budgetForecast.remainingDays + " ngày còn lại"
                  : "Đã hết kỳ ngân sách"
              }
              tone="neutral"
            />
          </section>

          {budgetForecastInsights.length > 0 && (
            <section className="rounded-[1.75rem] border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <Lightbulb size={16} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">
                    AI Forecast Insight
                  </p>
                  <p className="text-xs text-slate-500">
                    Giải thích dự báo ngân sách cuối tháng
                  </p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {budgetForecastInsights.map((item, index) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white bg-white/80 p-3 text-xs leading-5 text-slate-600 shadow-sm"
                  >
                    <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700">
                      {index + 1}
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Budget Overview + Analytics
          ══════════════════════════════════════════════════════════════════ */}
      {budgets.length > 0 && (
        <section className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
          {/* LEFT: Category allocation */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-100">
                <ChartPie size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Phân bổ ngân sách
                </h2>
                <p className="text-xs text-slate-500">
                  Tháng {activeMonth} · theo danh mục
                </p>
              </div>
            </div>

            {pieData.length > 0 ? (
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                {/* Pie chart */}
                <div className="shrink-0">
                  <PieChart width={160} height={160}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={3}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </div>
                {/* Legend bars */}
                <div className="flex-1 space-y-3">
                  {pieData.map((d) => {
                    const pct =
                      filteredSummary.totalLimit > 0
                        ? Math.round(
                            (d.value / filteredSummary.totalLimit) * 100,
                          )
                        : 0;
                    return (
                      <div
                        key={d.name}
                        title={`${d.name}: ${formatVND(d.value)} (${pct}%)`}
                      >
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: d.color }}
                            />
                            <span className="font-bold text-slate-700">
                              {d.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900">
                              {pct}%
                            </span>
                            <span className="text-slate-400">
                              {formatVND(d.value)}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: pct + "%", background: d.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">
                Chọn tháng có ngân sách để xem phân bổ.
              </p>
            )}
          </div>

          {/* RIGHT: 50/30/20 framework */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
                <ShieldCheck size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Khung 50/30/20
                </h2>
                <p className="text-xs text-slate-500">
                  Nhu cầu · Mong muốn · Tiết kiệm
                </p>
              </div>
            </div>

            {v7Allocation.map((bucket) => {
              const actualColor =
                bucket.status === "over"
                  ? "text-rose-600"
                  : bucket.status === "near"
                    ? "text-amber-600"
                    : bucket.textColor;
              const diffText =
                bucket.difference > 0
                  ? `Vượt ${formatVND(bucket.difference)}`
                  : `Còn ${formatVND(Math.abs(bucket.difference))}`;
              return (
                <div key={bucket.label} className="mb-5 last:mb-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-700">
                        {bucket.label}
                      </span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                        Mục tiêu {bucket.targetPercent}%
                      </span>
                    </div>
                    <span className={"text-sm font-black " + actualColor}>
                      {bucket.percentOfTarget}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{
                        width: Math.min(bucket.percentOfTarget, 100) + "%",
                        background: bucket.color,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">
                      {formatVND(bucket.actualAmount)} /{" "}
                      {formatVND(bucket.targetAmount)}
                    </span>
                    <span
                      className={
                        bucket.difference > 0
                          ? "font-bold text-rose-500"
                          : "font-bold text-emerald-600"
                      }
                    >
                      {diffText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {topRiskCategories.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
                <AlertTriangle size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Top 3 danh mục rủi ro
                </h2>
                <p className="text-xs text-slate-500">
                  Ưu tiên theo hạn mức hiện tại và dự báo cuối tháng
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Budget Intelligence
              </p>
              <p className="text-lg font-black text-slate-900">
                {budgetIntelligenceScore}/100
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {topRiskCategories.map((item, index) => {
              const toneClass =
                item.tone === "danger"
                  ? "border-rose-100 bg-rose-50 text-rose-700"
                  : item.tone === "warning"
                    ? "border-amber-100 bg-amber-50 text-amber-700"
                    : "border-emerald-100 bg-emerald-50 text-emerald-700";
              return (
                <button
                  key={item.categoryId}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/transactions?category=${encodeURIComponent(item.categoryId)}`,
                    )
                  }
                  className={
                    "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md " +
                    toneClass
                  }
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex size-7 items-center justify-center rounded-xl bg-white/70 text-xs font-black">
                      {index + 1}
                    </span>
                    <span className="text-xs font-black">
                      {item.riskScore}%
                    </span>
                  </div>
                  <p className="font-black text-slate-900">
                    {item.categoryName}
                  </p>
                  <p className="mt-1 text-xs leading-5 opacity-80">
                    {item.reason}
                  </p>
                  <p className="mt-2 text-[10px] font-bold opacity-70">
                    Đã chi {formatVND(item.spent)} · Dự kiến{" "}
                    {formatVND(item.projectedSpend)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Smart Budget AI Insights
          ══════════════════════════════════════════════════════════════════ */}
      {(smartBudget.violations.length > 0 ||
        smartBudget.overspendingTrend.length > 0 ||
        smartBudget.recommendedBudgets.length > 0) && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Bot size={14} className="text-blue-600" />
            <p className="text-sm font-black text-slate-700">Smart Budget AI</p>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
              {smartBudget.violations.length +
                Math.min(smartBudget.overspendingTrend.length, 2) +
                Math.min(smartBudget.recommendedBudgets.length, 2)}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {/* Violations → rose */}
            {smartBudget.violations.slice(0, 3).map((v) => (
              <div
                key={v.categoryId}
                className="rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                    <AlertTriangle size={13} />
                  </div>
                  <p className="text-xs font-black text-rose-800">
                    Vượt ngân sách · {v.categoryName}
                  </p>
                </div>
                <p className="text-xs leading-5 text-rose-700">
                  Đã chi{" "}
                  <span className="font-bold">{formatVND(v.actualSpend)}</span>,
                  vượt <span className="font-bold">{formatVND(v.overage)}</span>{" "}
                  (+{Math.round(v.overagePercent)}%) so với hạn mức{" "}
                  {formatVND(v.budgetLimit)}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const targetBudget = filteredBudgets.find(
                      (b) => b.categoryId === v.categoryId,
                    );
                    if (targetBudget) openEditForm(targetBudget);
                  }}
                  className="mt-3 rounded-xl bg-rose-600 px-3 py-2 text-[11px] font-black text-white transition hover:bg-rose-700"
                >
                  Chỉnh ngân sách
                </button>
              </div>
            ))}

            {/* Overspending trend → amber */}
            {smartBudget.overspendingTrend.slice(0, 2).map((a) => (
              <div
                key={a.categoryId}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <TrendingUp size={13} />
                  </div>
                  <p className="text-xs font-black text-amber-800">
                    Xu hướng tăng · {a.categoryName}
                  </p>
                </div>
                {(() => {
                  const currentSpend =
                    spendingByCategory.current.get(a.categoryId) ?? 0;
                  const previousSpend =
                    spendingByCategory.previous.get(a.categoryId) ?? 0;
                  const trendDelta = currentSpend - previousSpend;
                  const directionText =
                    trendDelta >= 0 ? "Chi tiêu tăng" : "Chi tiêu giảm";
                  return (
                    <div className="text-xs leading-5 text-amber-700">
                      <p>
                        {directionText}:{" "}
                        {getTrendDeltaText(currentSpend, previousSpend)}
                      </p>
                      <p className="mt-1 font-bold">
                        Tháng này: {formatVND(currentSpend)} · Tháng trước:{" "}
                        {formatVND(previousSpend)}
                      </p>
                    </div>
                  );
                })()}
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/transactions?category=${encodeURIComponent(a.categoryId)}`,
                    )
                  }
                  className="mt-3 rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black text-white transition hover:bg-amber-600"
                >
                  Xem giao dịch
                </button>
              </div>
            ))}

            {/* Recommendations → blue */}
            {smartBudget.recommendedBudgets.slice(0, 2).map((r) => (
              <div
                key={r.categoryId}
                className="rounded-2xl border border-blue-200 bg-blue-50 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <Lightbulb size={13} />
                  </div>
                  <p className="text-xs font-black text-blue-800">
                    Đề xuất · {r.categoryName}
                  </p>
                </div>
                <p className="text-xs leading-5 text-blue-700">{r.reasoning}</p>
                {r.recommended > 0 && (
                  <p className="mt-2 text-[10px] font-black text-blue-600">
                    Đề xuất: {formatVND(r.recommended)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const targetBudget = filteredBudgets.find(
                      (b) => b.categoryId === r.categoryId,
                    );
                    if (targetBudget) {
                      openEditForm(targetBudget);
                    } else {
                      setForm({
                        ...emptyForm,
                        categoryId: r.categoryId,
                        month: activeMonth,
                        limitAmount: String(Math.round(r.recommended || 0)),
                      });
                      setIsFormOpen(true);
                    }
                  }}
                  className="mt-3 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white transition hover:bg-blue-700"
                >
                  Áp dụng đề xuất
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 · Month Filter + Budget Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Month filter */}
        {allMonths.length > 1 && (
          <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
            {allMonths.map((m) => (
              <button
                key={m}
                onClick={() => setActiveMonth(m)}
                className={
                  "shrink-0 rounded-2xl border px-4 py-2 text-sm font-bold transition-all " +
                  (activeMonth === m
                    ? "border-blue-300 bg-blue-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50")
                }
              >
                Tháng {m}
              </button>
            ))}
          </div>
        )}

        {/* Section label */}
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">
            {filteredBudgets.length} ngân sách · tháng {activeMonth}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredBudgets.map((budget) => {
            const category = categories.find((c) => c.id === budget.categoryId);
            const spent = getSpent(budget.categoryId, budget.month);
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
                className={
                  "group rounded-[2rem] border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg " +
                  s.border
                }
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-100">
                      <ChartPie size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">
                        {category?.name ?? "Danh mục"}
                      </h3>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            s.badge
                          }
                        >
                          {label}
                        </span>
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
                  {/* Hover edit/delete */}
                  <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEditForm(budget)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 3-col mini stats */}
                <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3">
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Hạn mức
                    </p>
                    <p className="mt-0.5 text-xs font-black text-blue-700">
                      {budget.limitAmount >= 1_000_000
                        ? Math.round(budget.limitAmount / 1_000_000) + "M"
                        : Math.round(budget.limitAmount / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Đã chi
                    </p>
                    <p
                      className={
                        "mt-0.5 text-xs font-black " +
                        (status === "over" ? "text-rose-600" : "text-slate-700")
                      }
                    >
                      {spent >= 1_000_000
                        ? Math.round(spent / 1_000_000) + "M"
                        : Math.round(spent / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Còn lại
                    </p>
                    <p
                      className={
                        "mt-0.5 text-xs font-black " +
                        (remaining < 0 ? "text-rose-600" : "text-emerald-600")
                      }
                    >
                      {Math.abs(remaining) >= 1_000_000
                        ? Math.round(Math.abs(remaining) / 1_000_000) + "M"
                        : Math.round(Math.abs(remaining) / 1_000) + "K"}
                    </p>
                  </div>
                </div>

                {/* Large spent figure */}
                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Đã sử dụng
                  </p>
                  <p
                    className={
                      "mt-1 text-2xl font-black " +
                      (status === "over" ? "text-rose-600" : "text-slate-900")
                    }
                  >
                    {formatVND(spent)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    / {formatVND(budget.limitAmount)}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tiến độ</span>
                    <span
                      className={
                        "font-black " +
                        (status === "over" ? "text-rose-600" : "text-slate-700")
                      }
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full transition-all duration-500"
                      style={{
                        width: Math.min(pct, 100) + "%",
                        background: s.bar,
                      }}
                    />
                  </div>
                </div>

                {(() => {
                  const itemForecast = getBudgetForecast(
                    budget.limitAmount,
                    spent,
                    budget.month,
                  );
                  return (
                    <div
                      className={
                        "mt-3 rounded-2xl border px-3 py-2 text-xs " +
                        (itemForecast.isProjectedOver
                          ? "border-rose-100 bg-rose-50 text-rose-700"
                          : itemForecast.projectedPercent >= 85
                            ? "border-amber-100 bg-amber-50 text-amber-700"
                            : "border-emerald-100 bg-emerald-50 text-emerald-700")
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">
                          Dự kiến chi cuối tháng
                        </span>
                        <span className="font-black">
                          {formatVND(itemForecast.projectedSpend)}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] opacity-80">
                        {itemForecast.isProjectedOver
                          ? `Có thể vượt ${formatVND(Math.abs(itemForecast.projectedRemaining))} (${itemForecast.projectedPercent}% hạn mức).`
                          : `Dự kiến còn ${formatVND(itemForecast.projectedRemaining)} (${itemForecast.projectedPercent}% hạn mức).`}
                      </p>
                      {itemForecast.confidenceLevel === "low" && (
                        <p className="mt-1 text-[10px] font-bold opacity-80">
                          {itemForecast.confidenceLabel}: mới{" "}
                          {itemForecast.elapsedDays} ngày dữ liệu.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Mobile edit row */}
                <div className="mt-4 flex gap-2 lg:hidden">
                  <button
                    onClick={() => openEditForm(budget)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(budget.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-100 py-2 text-xs font-bold text-rose-500"
                  >
                    <Trash2 size={12} />
                    Xóa
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredBudgets.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <ChartPie size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                {budgets.length > 0
                  ? "Không có ngân sách tháng " + activeMonth
                  : "Chưa có ngân sách nào"}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                {budgets.length > 0
                  ? "Chọn tháng khác hoặc tạo ngân sách mới."
                  : "Bắt đầu bằng cách tạo ngân sách đầu tiên."}
              </p>
              <button
                onClick={openCreateForm}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Plus size={15} />
                Tạo ngân sách
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 · Monthly Planning (Recommended Budgets)
          ══════════════════════════════════════════════════════════════════ */}
      {smartBudget.recommendedBudgets.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-100">
              <Zap size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Kế hoạch ngân sách đề xuất
              </h2>
              <p className="text-xs text-slate-500">
                Dựa trên phân tích chi tiêu thực tế nhiều tháng
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-3 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Danh mục
                  </th>
                  <th className="pb-3 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Hiện tại
                  </th>
                  <th className="pb-3 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">
                    AI đề xuất
                  </th>
                  <th className="pb-3 text-right text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Chênh lệch
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {smartBudget.recommendedBudgets.map((r) => {
                  const diff = r.recommended - r.currentLimit;
                  return (
                    <tr
                      key={r.categoryId}
                      className="transition-colors hover:bg-blue-50/30"
                    >
                      <td className="py-3 font-bold text-slate-700">
                        {r.categoryName}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-500">
                        {r.currentLimit > 0 ? formatVND(r.currentLimit) : "—"}
                      </td>
                      <td className="py-3 text-right font-black text-blue-700">
                        {formatVND(r.recommended)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={
                            "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-black " +
                            (diff > 0
                              ? "bg-rose-100 text-rose-600"
                              : diff < 0
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-slate-100 text-slate-500")
                          }
                        >
                          {diff > 0 ? (
                            <ArrowUpRight size={9} />
                          ) : diff < 0 ? (
                            <ArrowDownRight size={9} />
                          ) : null}
                          {diff === 0
                            ? "Giữ nguyên"
                            : formatVND(Math.abs(diff))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
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

            <form onSubmit={handleSubmit} className="p-6">
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
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
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

function ForecastCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "danger"
      ? "border-rose-100 bg-rose-50 text-rose-700"
      : tone === "warning"
        ? "border-amber-100 bg-amber-50 text-amber-700"
        : tone === "good"
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-slate-100 bg-white text-slate-700";

  return (
    <div className={"rounded-[1.5rem] border p-4 shadow-sm " + toneClass}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 truncate text-xl font-black">{value}</p>
      <p className="mt-1 text-xs opacity-75">{sub}</p>
    </div>
  );
}

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
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}
