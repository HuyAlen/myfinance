"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  AlertTriangle,
  ArrowDownRight,
  Bot,
  CheckCircle2,
  Edit3,
  Landmark,
  Lightbulb,
  Plus,
  Shield,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import type { Debt } from "@/src/types/finance";

import {
  addDebt,
  deleteDebt,
  getDebts,
  getWallets,
  getTransactions,
  initFinanceDemoData,
  updateDebt,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getTotalAssets,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";
import { SaveError } from "@/src/components/ui/SaveError";

// ─── Types ────────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  totalAmount: string;
  remainingAmount: string;
};

const emptyForm: FormState = {
  name: "",
  totalAmount: "",
  remainingAmount: "",
};

type DebtTier = "paid" | "near" | "progress" | "started";

function getDebtTier(paidPct: number, remaining: number): DebtTier {
  if (remaining === 0 || paidPct >= 100) return "paid";
  if (paidPct >= 75) return "near";
  if (paidPct >= 25) return "progress";
  return "started";
}

const TIER_STYLE: Record<
  DebtTier,
  {
    badge: string;
    bar: string;
    border: string;
    iconGrad: string;
    label: string;
  }
> = {
  paid: {
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    bar: "#10b981",
    border: "border-emerald-100",
    iconGrad: "from-emerald-500 to-teal-400",
    label: "Đã tất toán",
  },
  near: {
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    bar: "#2563eb",
    border: "border-blue-100",
    iconGrad: "from-blue-500 to-cyan-500",
    label: "Gần xong",
  },
  progress: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    bar: "#f59e0b",
    border: "border-amber-100",
    iconGrad: "from-amber-400 to-orange-500",
    label: "Đang trả",
  },
  started: {
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    bar: "#f43f5e",
    border: "border-rose-100",
    iconGrad: "from-rose-500 to-red-500",
    label: "Mới bắt đầu",
  },
};

const PIE_COLORS = [
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#2563eb",
  "#7c3aed",
  "#06b6d4",
  "#10b981",
  "#94a3b8",
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [totalAssets, setTotalAssets] = useState(0);
  const [annualIncome, setAnnualIncome] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── PRESERVED: reloadData ─────────────────────────────────────────────────
  async function reloadData() {
    const [d, w, t] = await Promise.all([
      getDebts(),
      getWallets(),
      getTransactions(),
    ]);
    setDebts(d);
    setTotalAssets(getTotalAssets(w));
    // Last-12-months income for debt-to-income
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const recent = t.filter((tx) => tx.date >= cutoff);
    setAnnualIncome(getTotalIncome(recent));
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);
  useRealtimeTable(["debts"], reloadData);

  // ── PRESERVED: summary ────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalAmount = debts.reduce((s, d) => s + d.totalAmount, 0);
    const remainingAmount = debts.reduce((s, d) => s + d.remainingAmount, 0);
    const paidAmount = totalAmount - remainingAmount;
    const paidPercent =
      totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
    return { totalAmount, remainingAmount, paidAmount, paidPercent };
  }, [debts]);

  // ── NEW: per-debt meta ────────────────────────────────────────────────────
  const debtMeta = useMemo(
    () =>
      debts.map((d, i) => {
        const paidAmt = d.totalAmount - d.remainingAmount;
        const paidPct =
          d.totalAmount > 0 ? Math.round((paidAmt / d.totalAmount) * 100) : 0;
        const tier = getDebtTier(paidPct, d.remainingAmount);
        return {
          ...d,
          paidAmt,
          paidPct,
          tier,
          color: PIE_COLORS[i % PIE_COLORS.length],
        };
      }),
    [debts],
  );

  // ── NEW: tier counts ──────────────────────────────────────────────────────
  const tierCounts = useMemo(
    () => ({
      paid: debtMeta.filter((d) => d.tier === "paid").length,
      near: debtMeta.filter((d) => d.tier === "near").length,
      progress: debtMeta.filter((d) => d.tier === "progress").length,
      started: debtMeta.filter((d) => d.tier === "started").length,
    }),
    [debtMeta],
  );

  // ── NEW: debt ratios ──────────────────────────────────────────────────────
  const debtToAsset =
    totalAssets > 0
      ? Math.round((summary.remainingAmount / totalAssets) * 100)
      : 0;
  const debtToIncome =
    annualIncome > 0
      ? Math.round((summary.remainingAmount / annualIncome) * 100)
      : 0;

  // ── NEW: health score ─────────────────────────────────────────────────────
  const healthScore = summary.paidPercent; // 0→100: % paid off overall
  const healthGrade =
    healthScore >= 70
      ? { gradient: "from-emerald-500 to-green-500", label: "Xuất sắc" }
      : healthScore >= 40
        ? { gradient: "from-amber-400 to-orange-500", label: "Trung bình" }
        : { gradient: "from-rose-500 to-red-500", label: "Áp lực cao" };

  // ── NEW: pie data ─────────────────────────────────────────────────────────
  const pieData = useMemo(
    () =>
      debtMeta
        .filter((d) => d.remainingAmount > 0)
        .map((d) => ({
          name: d.name,
          value: d.remainingAmount,
          color: d.color,
        })),
    [debtMeta],
  );

  // ── NEW: AI coach insights ────────────────────────────────────────────────
  const coachInsights = useMemo(() => {
    const insights: {
      tone: "good" | "info" | "warning" | "danger";
      title: string;
      body: string;
    }[] = [];
    const paidDebts = debtMeta.filter((d) => d.tier === "paid");
    const nearDebts = debtMeta.filter((d) => d.tier === "near");
    const newDebts = debtMeta.filter((d) => d.tier === "started");

    if (paidDebts.length > 0) {
      insights.push({
        tone: "good",
        title: "Xuất sắc! Đã tất toán " + paidDebts.length + " khoản",
        body:
          paidDebts.map((d) => d.name).join(", ") +
          " — Đây là thành tích tuyệt vời trên hành trình tự do tài chính!",
      });
    }
    for (const d of nearDebts.slice(0, 2)) {
      insights.push({
        tone: "good",
        title: "Gần xong · " + d.name,
        body:
          "Đã trả " +
          d.paidPct +
          "%, chỉ còn " +
          formatVND(d.remainingAmount) +
          " nữa là tất toán. Hãy tăng tốc!",
      });
    }
    if (summary.remainingAmount > 0 && debtToAsset > 0 && debtToAsset < 30) {
      insights.push({
        tone: "info",
        title: "Tỷ lệ nợ lành mạnh",
        body:
          "Dư nợ chỉ chiếm " +
          debtToAsset +
          "% tổng tài sản — mức an toàn. Tiếp tục duy trì nhịp trả nợ đều đặn.",
      });
    }
    if (debtToAsset >= 50) {
      insights.push({
        tone: "danger",
        title: "Tỷ lệ nợ cao",
        body:
          "Dư nợ chiếm " +
          debtToAsset +
          "% tổng tài sản. Ưu tiên trả nợ trước khi tăng chi tiêu hoặc đầu tư mới.",
      });
    } else if (debtToAsset >= 30) {
      insights.push({
        tone: "warning",
        title: "Tỷ lệ nợ cần chú ý",
        body:
          "Dư nợ chiếm " +
          debtToAsset +
          "% tổng tài sản. Hãy cân nhắc tăng tốc trả nợ để cải thiện sức khỏe tài chính.",
      });
    }
    for (const d of newDebts.slice(0, 2)) {
      insights.push({
        tone: "warning",
        title: "Cần tập trung · " + d.name,
        body:
          "Mới trả được " +
          d.paidPct +
          "%, còn " +
          formatVND(d.remainingAmount) +
          ". Hãy lên kế hoạch tăng mức trả hàng tháng.",
      });
    }
    if (summary.paidPercent >= 80 && summary.remainingAmount > 0) {
      insights.push({
        tone: "good",
        title: "Sắp tự do tài chính!",
        body:
          "Đã tất toán " +
          summary.paidPercent +
          "% tổng dư nợ! Chỉ còn " +
          formatVND(summary.remainingAmount) +
          " là về đích.",
      });
    }
    return insights.slice(0, 6);
  }, [debtMeta, summary, debtToAsset]);

  // ── NEW: Payoff planner (Snowball = smallest remaining first; Avalanche = highest remaining ratio first) ──
  const snowballOrder = useMemo(
    () =>
      [...debtMeta]
        .filter((d) => d.tier !== "paid")
        .sort((a, b) => a.remainingAmount - b.remainingAmount),
    [debtMeta],
  );
  const avalancheOrder = useMemo(
    () =>
      [...debtMeta]
        .filter((d) => d.tier !== "paid")
        .sort((a, b) => {
          const ratioA =
            a.totalAmount > 0 ? a.remainingAmount / a.totalAmount : 0;
          const ratioB =
            b.totalAmount > 0 ? b.remainingAmount / b.totalAmount : 0;
          return ratioB - ratioA;
        }),
    [debtMeta],
  );

  // ── PRESERVED: CRUD ───────────────────────────────────────────────────────
  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(debt: Debt) {
    setForm({
      id: debt.id,
      name: debt.name,
      totalAmount: String(debt.totalAmount),
      remainingAmount: String(debt.remainingAmount),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const totalAmount = Number(form.totalAmount);
    const remainingAmount = Number(form.remainingAmount);
    if (!form.name.trim()) {
      alert("Vui lòng nhập tên khoản nợ");
      return;
    }
    if (!totalAmount || totalAmount <= 0) {
      alert("Vui lòng nhập tổng số tiền vay hợp lệ");
      return;
    }
    if (Number.isNaN(remainingAmount) || remainingAmount < 0) {
      alert("Vui lòng nhập số tiền còn lại hợp lệ");
      return;
    }
    if (remainingAmount > totalAmount) {
      alert("Số tiền còn lại không được lớn hơn tổng số tiền vay");
      return;
    }
    const debt: Debt = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      totalAmount,
      remainingAmount,
    };
    setSaveError(null);
    const { error } = form.id ? await updateDebt(debt) : await addDebt(debt);
    if (error) {
      setSaveError(error);
      return;
    }
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa khoản nợ này?")) return;
    const { error } = await deleteDebt(id);
    if (error) {
      alert("Lỗi xóa khoản nợ: " + error);
      return;
    }
    await reloadData();
  }

  // Sort: unpaid (by remaining %) first, paid last
  const sortedDebts = useMemo(
    () =>
      [...debtMeta].sort((a, b) => {
        if (a.tier === "paid" && b.tier !== "paid") return 1;
        if (a.tier !== "paid" && b.tier === "paid") return -1;
        return b.remainingAmount - a.remainingAmount;
      }),
    [debtMeta],
  );

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
                Debt Management Center
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Nợ & Khoản vay
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Theo dõi và lập kế hoạch trả nợ hướng tới tự do tài chính.
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
            >
              <Plus size={17} />
              Thêm khoản nợ
            </button>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="Tổng dư nợ"
              value={formatVND(summary.remainingAmount)}
              sub={
                debts.filter((d) => d.remainingAmount > 0).length +
                " khoản chưa tất toán"
              }
              gradient="from-rose-400 to-rose-500"
              iconBg="bg-white/20"
              icon={<ArrowDownRight size={16} />}
            />
            <KpiCard
              label="Đã hoàn trả"
              value={formatVND(summary.paidAmount)}
              sub={summary.paidPercent + "% tổng dư nợ"}
              gradient="from-emerald-500 to-emerald-600"
              iconBg="bg-emerald-400/30"
              icon={<CheckCircle2 size={16} />}
            />
            <KpiCard
              label="Số khoản nợ"
              value={String(debts.length)}
              sub={
                tierCounts.paid +
                " tất toán · " +
                (debts.length - tierCounts.paid) +
                " đang trả"
              }
              gradient="from-blue-500 to-blue-600"
              iconBg="bg-blue-400/30"
              icon={<Landmark size={16} />}
            />
            <KpiCard
              label="Tỷ lệ Nợ/Tài sản"
              value={debtToAsset + "%"}
              sub={
                debtToAsset < 30
                  ? "An toàn"
                  : debtToAsset < 50
                    ? "Cần chú ý"
                    : "Rủi ro cao"
              }
              gradient={
                debtToAsset < 30
                  ? "from-indigo-500 to-indigo-600"
                  : debtToAsset < 50
                    ? "from-amber-400 to-orange-500"
                    : "from-rose-500 to-red-500"
              }
              iconBg="bg-white/20"
              icon={<Shield size={16} />}
            />
            {/* Debt Health Score */}
            <div
              className={
                "col-span-2 sm:col-span-1 rounded-2xl bg-gradient-to-br p-4 shadow-sm " +
                healthGrade.gradient
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
                Debt Health
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {healthScore}
                <span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{ width: Math.min(healthScore, 100) + "%" }}
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
          SECTION 2 · Debt Overview + Analytics
          ══════════════════════════════════════════════════════════════════ */}
      {debts.length > 0 && (
        <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
          {/* LEFT: Master progress + tier breakdown */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-sm shadow-blue-100">
                <Landmark size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Tổng quan trả nợ
                </h2>
                <p className="text-xs text-slate-500">
                  {debts.length} khoản nợ đang theo dõi
                </p>
              </div>
            </div>

            {/* Master bar */}
            <div className="mb-6 rounded-2xl bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-slate-700">
                    Tiến độ trả nợ tổng thể
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatVND(summary.paidAmount)} /{" "}
                    {formatVND(summary.totalAmount)}
                  </p>
                </div>
                <span
                  className={
                    "text-3xl font-black " +
                    (summary.paidPercent >= 70
                      ? "text-emerald-600"
                      : summary.paidPercent >= 40
                        ? "text-amber-500"
                        : "text-rose-500")
                  }
                >
                  {summary.paidPercent}%
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-4 rounded-full transition-all duration-700"
                  style={{
                    width: Math.min(summary.paidPercent, 100) + "%",
                    background:
                      summary.paidPercent >= 70
                        ? "#10b981"
                        : summary.paidPercent >= 40
                          ? "#f59e0b"
                          : "#f43f5e",
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Còn {formatVND(summary.remainingAmount)} cần tất toán
              </p>
            </div>

            {/* Tier breakdown bars */}
            <div className="space-y-4">
              {(["paid", "near", "progress", "started"] as DebtTier[]).map(
                (tier) => {
                  const count = tierCounts[tier];
                  if (count === 0) return null;
                  const s = TIER_STYLE[tier];
                  const pct =
                    debts.length > 0
                      ? Math.round((count / debts.length) * 100)
                      : 0;
                  return (
                    <div key={tier}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ background: s.bar }}
                          />
                          <span className="font-bold text-slate-700">
                            {s.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-900">
                            {count} khoản
                          </span>
                          <span className="text-slate-400 text-xs">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2.5 rounded-full transition-all duration-500"
                          style={{ width: pct + "%", background: s.bar }}
                        />
                      </div>
                    </div>
                  );
                },
              )}
            </div>

            {/* Debt-to-income ratio (if data available) */}
            {annualIncome > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Nợ / Tài sản
                  </p>
                  <p
                    className={
                      "mt-1 text-lg font-black " +
                      (debtToAsset < 30
                        ? "text-emerald-600"
                        : debtToAsset < 50
                          ? "text-amber-500"
                          : "text-rose-500")
                    }
                  >
                    {debtToAsset}%
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Nợ / Thu nhập
                  </p>
                  <p
                    className={
                      "mt-1 text-lg font-black " +
                      (debtToIncome < 100
                        ? "text-emerald-600"
                        : debtToIncome < 200
                          ? "text-amber-500"
                          : "text-rose-500")
                    }
                  >
                    {debtToIncome}%
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Pie + highlights */}
          <div className="flex flex-col gap-5">
            {/* Pie chart */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-black text-slate-900">
                Phân bổ dư nợ
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
                        key={d.name}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: d.color }}
                        />
                        <span className="flex-1 truncate font-bold text-slate-600">
                          {d.name}
                        </span>
                        <span className="font-black text-slate-900 text-[10px]">
                          {summary.remainingAmount > 0
                            ? Math.round(
                                (d.value / summary.remainingAmount) * 100,
                              )
                            : 0}
                          %
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-slate-400">
                  Tất cả đã tất toán!
                </p>
              )}
            </div>

            {/* Largest + most paid mini-cards */}
            <div className="grid grid-cols-2 gap-3">
              {(() => {
                const largest = [...debtMeta]
                  .filter((d) => d.tier !== "paid")
                  .sort((a, b) => b.remainingAmount - a.remainingAmount)[0];
                const mostPaid = [...debtMeta].sort(
                  (a, b) => b.paidPct - a.paidPct,
                )[0];
                return (
                  <>
                    <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wide text-rose-500">
                        Gánh nặng nhất
                      </p>
                      <p className="mt-1.5 truncate text-sm font-black text-slate-900">
                        {largest?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-rose-600">
                        {largest ? formatVND(largest.remainingAmount) : "—"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                      <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">
                        Tiến độ tốt nhất
                      </p>
                      <p className="mt-1.5 truncate text-sm font-black text-slate-900">
                        {mostPaid?.name ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs font-bold text-emerald-600">
                        {mostPaid ? mostPaid.paidPct + "% đã trả" : "—"}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · AI Debt Coach
          ══════════════════════════════════════════════════════════════════ */}
      {coachInsights.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Bot size={14} className="text-blue-600" />
            <p className="text-sm font-black text-slate-700">AI Debt Coach</p>
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
                danger: {
                  card: "border-rose-200 bg-rose-50",
                  icon: "bg-rose-100 text-rose-600",
                  title: "text-rose-800",
                  body: "text-rose-700",
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
          SECTION 4 · Payoff Planner
          ══════════════════════════════════════════════════════════════════ */}
      {snowballOrder.length > 1 && (
        <section className="grid gap-5 xl:grid-cols-2">
          {/* Snowball */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                <Zap size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Phương pháp Snowball
                </h2>
                <p className="text-xs text-slate-500">
                  Trả khoản nhỏ nhất trước — tạo đà tâm lý
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {snowballOrder.map((d, i) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"
                >
                  <span
                    className={
                      "flex size-7 shrink-0 items-center justify-center rounded-xl text-xs font-black " +
                      (i === 0
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-600")
                    }
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-black text-slate-700">
                      {d.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatVND(d.remainingAmount)} còn lại
                    </p>
                  </div>
                  {i === 0 && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                      Ưu tiên
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Avalanche */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-sm">
                <TrendingDown size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Phương pháp Avalanche
                </h2>
                <p className="text-xs text-slate-500">
                  Trả khoản tỷ lệ còn lại cao nhất — tối ưu tài chính
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {avalancheOrder.map((d, i) => {
                const ratio =
                  d.totalAmount > 0
                    ? Math.round((d.remainingAmount / d.totalAmount) * 100)
                    : 0;
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"
                  >
                    <span
                      className={
                        "flex size-7 shrink-0 items-center justify-center rounded-xl text-xs font-black " +
                        (i === 0
                          ? "bg-rose-500 text-white"
                          : "bg-slate-200 text-slate-600")
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-black text-slate-700">
                        {d.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {ratio}% còn lại ({formatVND(d.remainingAmount)})
                      </p>
                    </div>
                    {i === 0 && (
                      <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-600">
                        Ưu tiên
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 · Premium Debt Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">
            {debts.length} khoản nợ
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sortedDebts.map((debt) => {
            const s = TIER_STYLE[debt.tier];
            const isPaid = debt.tier === "paid";
            return (
              <div
                key={debt.id}
                className={
                  "group rounded-[2rem] border bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg " +
                  s.border
                }
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm " +
                        s.iconGrad
                      }
                    >
                      <Landmark size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">
                        {debt.name}
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
                      onClick={() => openEditForm(debt)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(debt.id)}
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
                      Tổng vay
                    </p>
                    <p className="mt-0.5 text-xs font-black text-slate-600">
                      {debt.totalAmount >= 1_000_000
                        ? Math.round(debt.totalAmount / 1_000_000) + "M"
                        : Math.round(debt.totalAmount / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Đã trả
                    </p>
                    <p className="mt-0.5 text-xs font-black text-emerald-600">
                      {debt.paidAmt >= 1_000_000
                        ? Math.round(debt.paidAmt / 1_000_000) + "M"
                        : Math.round(debt.paidAmt / 1_000) + "K"}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Còn lại
                    </p>
                    <p
                      className={
                        "mt-0.5 text-xs font-black " +
                        (isPaid ? "text-emerald-600" : "text-rose-600")
                      }
                    >
                      {debt.remainingAmount >= 1_000_000
                        ? Math.round(debt.remainingAmount / 1_000_000) + "M"
                        : Math.round(debt.remainingAmount / 1_000) + "K"}
                    </p>
                  </div>
                </div>

                {/* Large remaining amount */}
                <div className="mt-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    {isPaid ? "Trạng thái" : "Còn phải trả"}
                  </p>
                  <p
                    className={
                      "mt-1 text-2xl font-black " +
                      (isPaid ? "text-emerald-600" : "text-rose-600")
                    }
                  >
                    {isPaid ? "Đã tất toán ✓" : formatVND(debt.remainingAmount)}
                  </p>
                  {!isPaid && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Tổng vay: {formatVND(debt.totalAmount)}
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Đã trả</span>
                    <span
                      className={
                        "font-black " +
                        (isPaid ? "text-emerald-600" : "text-slate-700")
                      }
                    >
                      {debt.paidPct}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full transition-all duration-700"
                      style={{
                        width: Math.min(debt.paidPct, 100) + "%",
                        background: s.bar,
                      }}
                    />
                  </div>
                </div>

                {/* Mobile edit row */}
                <div className="mt-4 flex gap-2 lg:hidden">
                  <button
                    onClick={() => openEditForm(debt)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(debt.id)}
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
          {debts.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-emerald-200 bg-emerald-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-emerald-100">
                <TrendingUp size={24} className="text-emerald-500" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Không có khoản nợ nào!
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Bạn đang tự do tài chính — hoặc thêm khoản nợ cần theo dõi.
              </p>
              <button
                onClick={openCreateForm}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Plus size={15} />
                Thêm khoản nợ
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
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Chỉnh sửa khoản nợ" : "Thêm khoản nợ mới"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Cập nhật tổng khoản vay và số tiền còn phải trả.
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
                  label="Tên khoản nợ"
                  value={form.name}
                  onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="VD: Vay mua xe, Thẻ tín dụng..."
                />
                <AmountInput
                  label="Tổng số tiền vay"
                  value={form.totalAmount}
                  onChange={(v) => setForm((p) => ({ ...p, totalAmount: v }))}
                  placeholder="50000000"
                />
                <AmountInput
                  label="Số tiền còn lại"
                  value={form.remainingAmount}
                  onChange={(v) =>
                    setForm((p) => ({ ...p, remainingAmount: v }))
                  }
                  placeholder="25000000"
                />
              </div>
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
                  {form.id ? "Lưu thay đổi" : "Thêm khoản nợ"}
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
