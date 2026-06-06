"use client";

import { useEffect, useMemo, useState } from "react";
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    reloadData();
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

  // ── NEW: Category analysis lookup map ─────────────────────────────────────
  const categoryAnalysisMap = useMemo(
    () => new Map(smartBudget.categoryAnalysis.map((a) => [a.categoryId, a])),
    [smartBudget],
  );

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
    smartBudget.adherenceScore >= 80
      ? { gradient: "from-emerald-500 to-green-500", label: "Xuất sắc" }
      : smartBudget.adherenceScore >= 60
        ? { gradient: "from-amber-400 to-orange-500", label: "Tốt" }
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
      alert("Vui lòng chọn danh mục");
      return;
    }
    if (!form.month) {
      alert("Vui lòng chọn tháng");
      return;
    }
    if (!limitAmount || limitAmount <= 0) {
      alert("Vui lòng nhập ngân sách hợp lệ");
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

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa ngân sách này?")) return;
    const { error } = await deleteBudget(id);
    if (error) {
      alert("Lỗi xóa ngân sách: " + error);
      return;
    }
    await reloadData();
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
                {smartBudget.adherenceScore}
                <span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{
                    width: Math.min(smartBudget.adherenceScore, 100) + "%",
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
                      <div key={d.name}>
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

            {[
              {
                bucket: smartBudget.allocation.needs,
                color: "#2563eb",
                target: "50%",
                textColor: "text-blue-700",
              },
              {
                bucket: smartBudget.allocation.wants,
                color: "#f59e0b",
                target: "30%",
                textColor: "text-amber-700",
              },
              {
                bucket: smartBudget.allocation.savings,
                color: "#10b981",
                target: "20%",
                textColor: "text-emerald-700",
              },
            ].map(({ bucket, color, target, textColor }) => {
              const overColor = "text-rose-600";
              const actualColor =
                bucket.status === "over" ? overColor : textColor;
              return (
                <div key={bucket.label} className="mb-5 last:mb-0">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-slate-700">
                        {bucket.label}
                      </span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                        Mục tiêu {target}
                      </span>
                    </div>
                    <span className={"text-sm font-black " + actualColor}>
                      {Math.round(bucket.actualPercent)}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{
                        width: Math.min(bucket.actualPercent, 100) + "%",
                        background: color,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {formatVND(bucket.actualAmount)} /{" "}
                    {formatVND(bucket.targetAmount)}
                  </p>
                </div>
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
                <p className="text-xs leading-5 text-amber-700">
                  Chi tiêu đang tăng ~{Math.round(Math.abs(a.trendRate))}
                  %/tháng. Cân nhắc điều chỉnh ngân sách trước khi vượt giới
                  hạn.
                </p>
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
