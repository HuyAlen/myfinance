"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Edit3,
  Lightbulb,
  Medal,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import type { Goal } from "@/src/types/finance";

import {
  addGoal,
  deleteGoal,
  getGoals,
  initFinanceDemoData,
  updateGoal,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
};

const emptyForm: FormState = {
  name: "",
  targetAmount: "",
  currentAmount: "",
};

type GoalTier = "completed" | "near" | "progress" | "started";

function getTier(pct: number): GoalTier {
  if (pct >= 100) return "completed";
  if (pct >= 75) return "near";
  if (pct >= 25) return "progress";
  return "started";
}

const TIER_STYLE: Record<
  GoalTier,
  {
    badge: string;
    bar: string;
    border: string;
    iconGrad: string;
    label: string;
  }
> = {
  completed: {
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    bar: "#10b981",
    border: "border-emerald-100",
    iconGrad: "from-emerald-500 to-teal-400",
    label: "Hoàn thành",
  },
  near: {
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    bar: "#2563eb",
    border: "border-blue-100",
    iconGrad: "from-blue-500 to-cyan-500",
    label: "Gần đích",
  },
  progress: {
    badge: "bg-cyan-100 text-cyan-700 border-cyan-200",
    bar: "#06b6d4",
    border: "border-cyan-100",
    iconGrad: "from-cyan-500 to-blue-400",
    label: "Đang thực hiện",
  },
  started: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    bar: "#f59e0b",
    border: "border-amber-100",
    iconGrad: "from-amber-400 to-orange-500",
    label: "Mới bắt đầu",
  },
};

const PIE_COLORS: Record<GoalTier, string> = {
  completed: "#10b981",
  near: "#2563eb",
  progress: "#06b6d4",
  started: "#f59e0b",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  async function reloadData() {
    setGoals(await getGoals());
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);
  useRealtimeTable(["goals"], reloadData);

  // ── PRESERVED: summary ───────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
    const totalCurrent = goals.reduce((s, g) => s + g.currentAmount, 0);
    const percent =
      totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
    return {
      totalTarget,
      totalCurrent,
      remaining: totalTarget - totalCurrent,
      percent,
    };
  }, [goals]);

  // ── NEW: per-goal analytics ───────────────────────────────────────────────
  const goalMeta = useMemo(
    () =>
      goals.map((g) => {
        const pct =
          g.targetAmount > 0
            ? Math.round((g.currentAmount / g.targetAmount) * 100)
            : 0;
        const tier = getTier(pct);
        const remaining = Math.max(g.targetAmount - g.currentAmount, 0);
        return { ...g, pct, tier, remaining };
      }),
    [goals],
  );

  // ── NEW: tier counts ──────────────────────────────────────────────────────
  const tierCounts = useMemo(
    () => ({
      completed: goalMeta.filter((g) => g.tier === "completed").length,
      near: goalMeta.filter((g) => g.tier === "near").length,
      progress: goalMeta.filter((g) => g.tier === "progress").length,
      started: goalMeta.filter((g) => g.tier === "started").length,
    }),
    [goalMeta],
  );

  // ── NEW: achievement score ────────────────────────────────────────────────
  const achievementScore = useMemo(() => {
    if (goals.length === 0) return 0;
    const completionBonus = Math.round(
      (tierCounts.completed / goals.length) * 50,
    );
    const progressScore = Math.round(summary.percent * 0.5);
    return Math.min(completionBonus + progressScore, 100);
  }, [goals.length, tierCounts.completed, summary.percent]);

  const achievementGrade =
    achievementScore >= 70
      ? { gradient: "from-emerald-500 to-green-500", label: "Xuất sắc" }
      : achievementScore >= 40
        ? { gradient: "from-amber-400 to-orange-500", label: "Tốt" }
        : { gradient: "from-rose-500 to-red-500", label: "Cần cố gắng" };

  // ── NEW: pie data ─────────────────────────────────────────────────────────
  const pieData = useMemo(
    () =>
      (["completed", "near", "progress", "started"] as GoalTier[])
        .map((tier) => ({
          tier,
          value: tierCounts[tier],
          label: TIER_STYLE[tier].label,
          color: PIE_COLORS[tier],
        }))
        .filter((d) => d.value > 0),
    [tierCounts],
  );

  // ── NEW: AI coach insights ────────────────────────────────────────────────
  const coachInsights = useMemo(() => {
    const insights: {
      tone: "good" | "warning" | "info";
      title: string;
      body: string;
    }[] = [];

    const completed = goalMeta.filter((g) => g.tier === "completed");
    const nearDone = goalMeta.filter((g) => g.tier === "near");
    const struggling = goalMeta.filter((g) => g.pct === 0);
    const started = goalMeta.filter((g) => g.tier === "started" && g.pct > 0);

    if (completed.length > 0) {
      insights.push({
        tone: "good",
        title: "Đã đạt mục tiêu!",
        body:
          completed.map((g) => g.name).join(", ") +
          " — Tuyệt vời! Hãy đặt ra mục tiêu cao hơn tiếp theo.",
      });
    }
    for (const g of nearDone.slice(0, 2)) {
      insights.push({
        tone: "good",
        title: "Gần đích · " + g.name,
        body:
          "Đã hoàn thành " +
          g.pct +
          "%. Chỉ còn " +
          formatVND(g.remaining) +
          " nữa là đạt mục tiêu. Đừng bỏ cuộc!",
      });
    }
    for (const g of started.slice(0, 2)) {
      insights.push({
        tone: "info",
        title: "Đang tiến tốt · " + g.name,
        body:
          "Tiến độ " +
          g.pct +
          "% — Hãy duy trì nhịp tích lũy đều đặn mỗi tháng để đạt mục tiêu sớm hơn.",
      });
    }
    for (const g of struggling.slice(0, 2)) {
      insights.push({
        tone: "warning",
        title: "Chưa bắt đầu · " + g.name,
        body:
          "Mục tiêu " +
          formatVND(g.targetAmount) +
          " vẫn chưa có tiến độ. Hãy bắt đầu tích lũy nhỏ đều đặn.",
      });
    }
    return insights.slice(0, 6);
  }, [goalMeta]);

  // ── PRESERVED: CRUD ───────────────────────────────────────────────────────
  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(goal: Goal) {
    setForm({
      id: goal.id,
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const targetAmount = Number(form.targetAmount);
    const currentAmount = Number(form.currentAmount);
    if (!form.name.trim()) {
      alert("Vui lòng nhập tên mục tiêu");
      return;
    }
    if (!targetAmount || targetAmount <= 0) {
      alert("Vui lòng nhập số tiền mục tiêu hợp lệ");
      return;
    }
    if (Number.isNaN(currentAmount) || currentAmount < 0) {
      alert("Vui lòng nhập số tiền đã tiết kiệm hợp lệ");
      return;
    }
    const goal: Goal = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      targetAmount,
      currentAmount,
    };
    if (form.id) await updateGoal(goal);
    else await addGoal(goal);
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa mục tiêu này?")) return;
    await deleteGoal(id);
    await reloadData();
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 · Executive KPI Header
          ══════════════════════════════════════════════════════════════════ */}
      <section className="overflow-hidden rounded-[2rem] border border-blue-100 shadow-sm">
        <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-6 pb-7 pt-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
                Goal Achievement Center
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Mục tiêu tài chính
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Lập kế hoạch và theo dõi hành trình đến từng mục tiêu lớn.
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
            >
              <Plus size={17} />
              Thêm mục tiêu
            </button>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tổng mục tiêu"
              value={String(goals.length)}
              sub={
                tierCounts.completed +
                " hoàn thành · " +
                (goals.length - tierCounts.completed) +
                " đang thực hiện"
              }
              gradient="from-blue-500 to-blue-600"
              iconBg="bg-blue-400/30"
              icon={<Target size={16} />}
            />
            <KpiCard
              label="Tổng giá trị mục tiêu"
              value={formatVND(summary.totalTarget)}
              sub="Tổng các mục tiêu đặt ra"
              gradient="from-indigo-500 to-indigo-600"
              iconBg="bg-indigo-400/30"
              icon={<Medal size={16} />}
            />
            <KpiCard
              label="Đã tích lũy"
              value={formatVND(summary.totalCurrent)}
              sub={summary.percent + "% tổng mục tiêu"}
              gradient="from-cyan-500 to-cyan-600"
              iconBg="bg-cyan-400/30"
              icon={<TrendingUp size={16} />}
            />
            <KpiCard
              label="Tỷ lệ hoàn thành"
              value={summary.percent + "%"}
              sub={
                summary.remaining > 0
                  ? "Còn " + formatVND(summary.remaining)
                  : "Đã vượt mục tiêu!"
              }
              gradient={
                summary.percent >= 80
                  ? "from-emerald-500 to-emerald-600"
                  : summary.percent >= 40
                    ? "from-amber-400 to-orange-500"
                    : "from-rose-400 to-rose-500"
              }
              iconBg="bg-white/20"
              icon={<CheckCircle2 size={16} />}
            />
            {/* Achievement score */}
            <div
              className={
                "col-span-2 sm:col-span-1 rounded-2xl bg-gradient-to-br p-4 shadow-sm " +
                achievementGrade.gradient
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
                Achievement Score
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {achievementScore}
                <span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{ width: Math.min(achievementScore, 100) + "%" }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-white/80">
                {achievementGrade.label}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Goals Overview + Analytics
          ══════════════════════════════════════════════════════════════════ */}
      {goals.length > 0 && (
        <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          {/* LEFT: Overall progress + tier bars */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-100">
                <Target size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Tổng quan mục tiêu
                </h2>
                <p className="text-xs text-slate-500">
                  {goals.length} mục tiêu đang theo dõi
                </p>
              </div>
            </div>

            {/* Master progress bar */}
            <div className="mb-6 rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-700">
                    Tiến độ tổng thể
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatVND(summary.totalCurrent)} /{" "}
                    {formatVND(summary.totalTarget)}
                  </p>
                </div>
                <span
                  className={
                    "text-3xl font-black " +
                    (summary.percent >= 80
                      ? "text-emerald-600"
                      : summary.percent >= 40
                        ? "text-amber-500"
                        : "text-blue-600")
                  }
                >
                  {summary.percent}%
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-4 rounded-full transition-all duration-700"
                  style={{
                    width: Math.min(summary.percent, 100) + "%",
                    background:
                      summary.percent >= 80
                        ? "#10b981"
                        : summary.percent >= 40
                          ? "#f59e0b"
                          : "#2563eb",
                  }}
                />
              </div>
              {summary.remaining > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  Còn thiếu {formatVND(summary.remaining)} để hoàn thành tất cả
                  mục tiêu
                </p>
              )}
            </div>

            {/* Tier breakdown bars */}
            <div className="space-y-4">
              {(["completed", "near", "progress", "started"] as GoalTier[]).map(
                (tier) => {
                  const count = tierCounts[tier];
                  if (count === 0) return null;
                  const s = TIER_STYLE[tier];
                  const pct =
                    goals.length > 0
                      ? Math.round((count / goals.length) * 100)
                      : 0;
                  return (
                    <div key={tier}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ background: PIE_COLORS[tier] }}
                          />
                          <span className="font-bold text-slate-700">
                            {s.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-900">
                            {count} mục tiêu
                          </span>
                          <span className="text-slate-400 text-xs">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2.5 rounded-full transition-all duration-500"
                          style={{
                            width: pct + "%",
                            background: PIE_COLORS[tier],
                          }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>

          {/* RIGHT: Pie + per-goal contribution */}
          <div className="flex flex-col gap-5">
            {/* Pie */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-black text-slate-900">
                Phân bổ trạng thái
              </h2>
              {pieData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="h-36 w-36 shrink-0">
                    <PieChart width={144} height={144}>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        innerRadius={44}
                        outerRadius={66}
                        paddingAngle={4}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {pieData.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <div className="flex-1 space-y-2">
                    {pieData.map((d) => (
                      <div
                        key={d.tier}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: d.color }}
                        />
                        <span className="flex-1 font-bold text-slate-600">
                          {d.label}
                        </span>
                        <span className="font-black text-slate-900">
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-slate-400">
                  Chưa có dữ liệu
                </p>
              )}
            </div>

            {/* Saving gap mini card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                Cần tích lũy thêm
              </p>
              <p className="mt-1 text-xl font-black text-rose-500">
                {formatVND(summary.remaining)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                để hoàn thành tất cả {goals.length} mục tiêu
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
                  style={{ width: Math.min(summary.percent, 100) + "%" }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · AI Goal Coach
          ══════════════════════════════════════════════════════════════════ */}
      {coachInsights.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Bot size={14} className="text-blue-600" />
            <p className="text-sm font-black text-slate-700">AI Goal Coach</p>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
              {coachInsights.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {coachInsights.map((insight, i) => {
              const styles = {
                good: {
                  card: "border-emerald-200 bg-emerald-50",
                  icon: "bg-emerald-100 text-emerald-600",
                  title: "text-emerald-800",
                  body: "text-emerald-700",
                  Icon: CheckCircle2,
                },
                info: {
                  card: "border-blue-200 bg-blue-50",
                  icon: "bg-blue-100 text-blue-600",
                  title: "text-blue-800",
                  body: "text-blue-700",
                  Icon: Lightbulb,
                },
                warning: {
                  card: "border-amber-200 bg-amber-50",
                  icon: "bg-amber-100 text-amber-600",
                  title: "text-amber-800",
                  body: "text-amber-700",
                  Icon: AlertTriangle,
                },
              };
              const s = styles[insight.tone];
              return (
                <div key={i} className={"rounded-2xl border p-4 " + s.card}>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className={
                        "flex size-7 shrink-0 items-center justify-center rounded-xl " +
                        s.icon
                      }
                    >
                      <s.Icon size={13} />
                    </div>
                    <p className={"text-xs font-black " + s.title}>
                      {insight.title}
                    </p>
                  </div>
                  <p className={"text-xs leading-5 " + s.body}>
                    {insight.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 · Goal Timeline (nearest to completion first)
          ══════════════════════════════════════════════════════════════════ */}
      {goalMeta.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
              <Zap size={17} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Goal Timeline
              </h2>
              <p className="text-xs text-slate-500">
                Hành trình tích lũy · Sắp xếp theo tiến độ
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {[...goalMeta]
              .sort((a, b) => b.pct - a.pct)
              .map((g) => {
                const s = TIER_STYLE[g.tier];
                return (
                  <div key={g.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black " +
                            s.badge
                          }
                        >
                          {s.label}
                        </span>
                        <span className="text-sm font-black text-slate-700">
                          {g.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">
                          {formatVND(g.currentAmount)}
                        </span>
                        <span className="text-slate-300">/</span>
                        <span className="font-bold text-slate-700">
                          {formatVND(g.targetAmount)}
                        </span>
                        <span
                          className={
                            "font-black " +
                            (g.tier === "completed"
                              ? "text-emerald-600"
                              : "text-blue-600")
                          }
                        >
                          {g.pct}%
                        </span>
                      </div>
                    </div>
                    {/* Milestone track */}
                    <div className="relative">
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-3 rounded-full transition-all duration-700"
                          style={{
                            width: Math.min(g.pct, 100) + "%",
                            background: s.bar,
                          }}
                        />
                      </div>
                      {/* Milestone markers at 25/50/75/100 */}
                      {[25, 50, 75, 100].map((m) => (
                        <div
                          key={m}
                          className="absolute top-0 h-3 w-px bg-white/60"
                          style={{ left: m + "%" }}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] text-slate-300">
                      <span>0%</span>
                      <span>25%</span>
                      <span>50%</span>
                      <span>75%</span>
                      <span>100%</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 · Premium Goal Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">
            {goals.length} mục tiêu tài chính
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {goalMeta.map((g) => {
            const s = TIER_STYLE[g.tier];
            return (
              <div
                key={g.id}
                className={
                  "group rounded-[2rem] border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg " +
                  s.border
                }
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm " +
                        s.iconGrad
                      }
                    >
                      {g.tier === "completed" ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Target size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">
                        {g.name}
                      </h3>
                      <span
                        className={
                          "mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                          s.badge
                        }
                      >
                        {s.label}
                      </span>
                    </div>
                  </div>
                  {/* Hover edit/delete */}
                  <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEditForm(g)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
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
                      Mục tiêu
                    </p>
                    <p className="mt-0.5 text-xs font-black text-blue-700">
                      {g.targetAmount >= 1_000_000
                        ? Math.round(g.targetAmount / 1_000_000) + "M"
                        : Math.round(g.targetAmount / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Đã có
                    </p>
                    <p className="mt-0.5 text-xs font-black text-emerald-600">
                      {g.currentAmount >= 1_000_000
                        ? Math.round(g.currentAmount / 1_000_000) + "M"
                        : Math.round(g.currentAmount / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Còn lại
                    </p>
                    <p className="mt-0.5 text-xs font-black text-slate-500">
                      {g.remaining >= 1_000_000
                        ? Math.round(g.remaining / 1_000_000) + "M"
                        : Math.round(g.remaining / 1_000) + "K"}
                    </p>
                  </div>
                </div>

                {/* Large saved amount */}
                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Đã tích lũy
                  </p>
                  <p
                    className={
                      "mt-1 text-2xl font-black " +
                      (g.tier === "completed"
                        ? "text-emerald-600"
                        : "text-blue-700")
                    }
                  >
                    {formatVND(g.currentAmount)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    / {formatVND(g.targetAmount)}
                  </p>
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tiến độ</span>
                    <div className="flex items-center gap-1.5">
                      {g.pct >= 100 ? (
                        <ArrowUpRight size={10} className="text-emerald-500" />
                      ) : g.pct >= 75 ? (
                        <ArrowUpRight size={10} className="text-blue-500" />
                      ) : null}
                      <span
                        className={
                          "font-black " +
                          (g.tier === "completed"
                            ? "text-emerald-600"
                            : "text-slate-700")
                        }
                      >
                        {g.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full transition-all duration-700"
                      style={{
                        width: Math.min(g.pct, 100) + "%",
                        background: s.bar,
                      }}
                    />
                  </div>
                </div>

                {/* Mobile edit row */}
                <div className="mt-4 flex gap-2 lg:hidden">
                  <button
                    onClick={() => openEditForm(g)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
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
          {goals.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <Target size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Chưa có mục tiêu nào
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Bắt đầu hành trình tài chính bằng cách đặt ra mục tiêu đầu tiên.
              </p>
              <button
                onClick={openCreateForm}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Plus size={15} />
                Thêm mục tiêu
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Chỉnh sửa mục tiêu" : "Thêm mục tiêu mới"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Cập nhật số tiền mục tiêu và số tiền đã tiết kiệm.
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
                <FormInput
                  label="Tên mục tiêu"
                  value={form.name}
                  onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="VD: Mua laptop, Quỹ khẩn cấp..."
                />
                {/* Target amount with ₫ */}
                <AmountInput
                  label="Số tiền mục tiêu"
                  value={form.targetAmount}
                  onChange={(v) => setForm((p) => ({ ...p, targetAmount: v }))}
                  placeholder="30000000"
                />
                {/* Current amount with ₫ */}
                <AmountInput
                  label="Số tiền đã tiết kiệm"
                  value={form.currentAmount}
                  onChange={(v) => setForm((p) => ({ ...p, currentAmount: v }))}
                  placeholder="12000000"
                />
              </div>

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
                  {form.id ? "Lưu thay đổi" : "Thêm mục tiêu"}
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

function FormInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}

function AmountInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <CurrencyInput
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}
