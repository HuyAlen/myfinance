"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bitcoin,
  Bot,
  BriefcaseBusiness,
  CircleDollarSign,
  Coins,
  Edit3,
  Gem,
  Lightbulb,
  Plus,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  Trophy,
  X,
  Zap,
} from "lucide-react";

import type { Investment, InvestmentType } from "@/src/types/finance";

import {
  addInvestment,
  deleteInvestment,
  getInvestments,
  initFinanceDemoData,
  updateInvestment,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";

// ─── Constants ────────────────────────────────────────────────────────────────

type FormState = {
  id?: string;
  name: string;
  type: InvestmentType;
  symbol: string;
  investedAmount: string;
  currentValue: string;
  purchaseDate: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  type: "stock",
  symbol: "",
  investedAmount: "",
  currentValue: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

const ALL_TYPES: InvestmentType[] = [
  "stock",
  "crypto",
  "fund",
  "gold",
  "other",
];

const TYPE_CONFIG: Record<
  InvestmentType,
  {
    label: string;
    color: string;
    gradientFrom: string;
    gradientTo: string;
    bg: string;
  }
> = {
  stock: {
    label: "Cổ phiếu",
    color: "#10b981",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-teal-400",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  crypto: {
    label: "Crypto",
    color: "#f97316",
    gradientFrom: "from-orange-400",
    gradientTo: "to-yellow-500",
    bg: "bg-orange-50 text-orange-700 border-orange-200",
  },
  fund: {
    label: "Quỹ đầu tư",
    color: "#2563eb",
    gradientFrom: "from-blue-600",
    gradientTo: "to-cyan-500",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
  },
  gold: {
    label: "Vàng",
    color: "#f59e0b",
    gradientFrom: "from-amber-400",
    gradientTo: "to-orange-500",
    bg: "bg-amber-50 text-amber-700 border-amber-200",
  },
  other: {
    label: "Khác",
    color: "#64748b",
    gradientFrom: "from-slate-500",
    gradientTo: "to-slate-600",
    bg: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

type PerfFilter = "all" | "profit" | "loss";
type HoldingTab = "largest" | "best" | "worst";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  // Filters
  const [typeFilter, setTypeFilter] = useState<InvestmentType | "all">("all");
  const [perfFilter, setPerfFilter] = useState<PerfFilter>("all");
  const [search, setSearch] = useState("");

  // UI tabs
  const [holdingTab, setHoldingTab] = useState<HoldingTab>("largest");

  // ── Data loading ───────────────────────────────────────────────────────────
  async function reloadData() {
    setInvestments(await getInvestments());
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);
  useRealtimeTable(["investments"], reloadData);

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const investedAmount = investments.reduce(
      (s, i) => s + i.investedAmount,
      0,
    );
    const currentValue = investments.reduce((s, i) => s + i.currentValue, 0);
    const profitLoss = currentValue - investedAmount;
    const returnPercent =
      investedAmount > 0
        ? Math.round((profitLoss / investedAmount) * 1000) / 10
        : 0;
    return { investedAmount, currentValue, profitLoss, returnPercent };
  }, [investments]);

  // ── By-type breakdown ──────────────────────────────────────────────────────
  const byType = useMemo(() => {
    return ALL_TYPES.map((type) => {
      const items = investments.filter((i) => i.type === type);
      const invested = items.reduce((s, i) => s + i.investedAmount, 0);
      const current = items.reduce((s, i) => s + i.currentValue, 0);
      const pl = current - invested;
      const plPct = invested > 0 ? Math.round((pl / invested) * 1000) / 10 : 0;
      const allocPct =
        summary.currentValue > 0
          ? Math.round((current / summary.currentValue) * 100)
          : 0;
      return {
        type,
        ...TYPE_CONFIG[type],
        count: items.length,
        invested,
        current,
        pl,
        plPct,
        allocPct,
      };
    }).filter((g) => g.count > 0);
  }, [investments, summary.currentValue]);

  // ── Per-investment enriched ───────────────────────────────────────────────
  const enriched = useMemo(
    () =>
      investments.map((inv) => {
        const pl = inv.currentValue - inv.investedAmount;
        const plPct =
          inv.investedAmount > 0
            ? Math.round((pl / inv.investedAmount) * 1000) / 10
            : 0;
        const allocPct =
          summary.currentValue > 0
            ? Math.round((inv.currentValue / summary.currentValue) * 100)
            : 0;
        const status: "strong" | "stable" | "under" =
          plPct >= 10 ? "strong" : plPct >= 0 ? "stable" : "under";
        return { ...inv, pl, plPct, allocPct, status };
      }),
    [investments, summary.currentValue],
  );

  // ── Chart data ─────────────────────────────────────────────────────────────
  const pieData = useMemo(
    () =>
      byType.map((g) => ({ name: g.label, value: g.allocPct, color: g.color })),
    [byType],
  );

  const barData = useMemo(
    () =>
      investments.map((i) => ({
        name: i.symbol || i.name.slice(0, 8),
        "Vốn đầu tư": +(i.investedAmount / 1_000_000).toFixed(1),
        "Giá trị HT": +(i.currentValue / 1_000_000).toFixed(1),
      })),
    [investments],
  );

  // ── Portfolio Health Scores ────────────────────────────────────────────────
  const healthScores = useMemo(() => {
    const typeCount = byType.length;
    const maxAlloc =
      byType.length > 0 ? Math.max(...byType.map((g) => g.allocPct)) : 0;
    const roi = summary.returnPercent;

    const diversification =
      typeCount >= 4
        ? 90
        : typeCount === 3
          ? 70
          : typeCount === 2
            ? 50
            : typeCount === 1
              ? 25
              : 0;

    const concentration =
      maxAlloc < 35 ? 90 : maxAlloc < 50 ? 70 : maxAlloc < 70 ? 45 : 20;

    const performance =
      roi > 15
        ? 95
        : roi > 8
          ? 80
          : roi > 3
            ? 65
            : roi > 0
              ? 50
              : roi > -5
                ? 30
                : 15;

    const overall =
      investments.length === 0
        ? 0
        : Math.round((diversification + concentration + performance) / 3);

    function grade(score: number): { label: string; color: string } {
      if (score >= 80) return { label: "Xuất sắc", color: "text-indigo-600" };
      if (score >= 60) return { label: "Tốt", color: "text-blue-600" };
      if (score >= 40) return { label: "Cảnh báo", color: "text-amber-600" };
      return { label: "Rủi ro cao", color: "text-rose-500" };
    }

    return {
      diversification,
      concentration,
      performance,
      overall,
      diversificationGrade: grade(diversification),
      concentrationGrade: grade(concentration),
      performanceGrade: grade(performance),
      overallGrade: grade(overall),
    };
  }, [byType, summary.returnPercent, investments.length]);

  // ── AI Investment Insights ─────────────────────────────────────────────────
  const insights = useMemo(() => {
    const out: {
      tone: "good" | "info" | "warning";
      title: string;
      body: string;
    }[] = [];
    const maxAlloc =
      byType.length > 0 ? Math.max(...byType.map((g) => g.allocPct)) : 0;
    const top = byType.find((g) => g.allocPct === maxAlloc);
    const underperformers = enriched.filter((i) => i.plPct < -10);
    const winners = enriched.filter((i) => i.plPct >= 15);
    const hasGold = byType.some((g) => g.type === "gold");
    const hasFund = byType.some((g) => g.type === "fund");

    if (maxAlloc > 60 && top) {
      out.push({
        tone: "warning",
        title: "Rủi ro tập trung cao · " + top.label,
        body:
          top.label +
          " chiếm tới " +
          maxAlloc +
          "% danh mục. Cân nhắc phân bổ lại để giảm rủi ro tập trung.",
      });
    }
    if (byType.length === 1) {
      out.push({
        tone: "warning",
        title: "Thiếu đa dạng hoá",
        body: "Danh mục chỉ có 1 loại tài sản. Phân bổ vào 2–3 loại khác nhau sẽ giảm rủi ro tổng thể đáng kể.",
      });
    }
    if (underperformers.length > 0) {
      out.push({
        tone: "warning",
        title: underperformers.length + " tài sản kém hiệu quả",
        body:
          underperformers
            .map((i) => i.name)
            .slice(0, 3)
            .join(", ") +
          " đang lỗ trên 10%. Xem xét chiến lược cắt lỗ hoặc tăng bình quân giá vốn.",
      });
    }
    if (summary.returnPercent > 10) {
      out.push({
        tone: "good",
        title: "Danh mục đang tăng trưởng tốt!",
        body:
          "ROI tổng thể đạt " +
          summary.returnPercent +
          "%. Danh mục của bạn đang vượt trội so với lãi suất tiết kiệm thông thường.",
      });
    }
    if (winners.length > 0) {
      out.push({
        tone: "good",
        title: winners.length + " tài sản sinh lời tốt",
        body:
          winners
            .map((i) => i.name)
            .slice(0, 3)
            .join(", ") +
          " đang có ROI ≥ 15%. Cân nhắc chốt lời một phần để cố định lợi nhuận.",
      });
    }
    if (!hasGold && investments.length >= 3) {
      out.push({
        tone: "info",
        title: "Cân nhắc thêm vàng vào danh mục",
        body: "Vàng là tài sản phòng thủ tốt, giúp bảo vệ danh mục trong giai đoạn thị trường biến động.",
      });
    }
    if (!hasFund && investments.length >= 3) {
      out.push({
        tone: "info",
        title: "Quỹ đầu tư — kênh đa dạng hoá thụ động",
        body: "Thêm quỹ ETF hoặc quỹ mở giúp phân bổ vốn tự động mà không cần theo dõi từng tài sản.",
      });
    }
    if (summary.returnPercent < 0) {
      out.push({
        tone: "warning",
        title: "Danh mục đang lỗ tổng thể",
        body:
          "ROI hiện tại: " +
          summary.returnPercent +
          "%. Xem xét lại phân bổ tài sản hoặc chờ thị trường phục hồi trước khi quyết định.",
      });
    }
    if (byType.length >= 4 && summary.returnPercent >= 5) {
      out.push({
        tone: "good",
        title: "Danh mục đa dạng & sinh lời",
        body:
          byType.length +
          " loại tài sản, ROI " +
          summary.returnPercent +
          "%. Portfolio của bạn được phân bổ tốt và đang tăng trưởng.",
      });
    }
    return out.slice(0, 6);
  }, [byType, enriched, summary.returnPercent, investments.length]);

  // ── Top Holdings ───────────────────────────────────────────────────────────
  const topHoldings = useMemo(() => {
    const sorted = [...enriched];
    const largest = [...sorted]
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 3);
    const best = [...sorted].sort((a, b) => b.plPct - a.plPct).slice(0, 3);
    const worst = [...sorted]
      .sort((a, b) => a.plPct - b.plPct)
      .slice(0, 3)
      .filter((i) => i.plPct < 0);
    return { largest, best, worst };
  }, [enriched]);

  // ── Filtered investments ───────────────────────────────────────────────────
  const filteredInvestments = useMemo(() => {
    return enriched
      .filter((inv) => {
        if (typeFilter !== "all" && inv.type !== typeFilter) return false;
        if (perfFilter === "profit" && inv.pl < 0) return false;
        if (perfFilter === "loss" && inv.pl >= 0) return false;
        if (
          search &&
          !inv.name.toLowerCase().includes(search.toLowerCase()) &&
          !(inv.symbol ?? "").toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [enriched, typeFilter, perfFilter, search]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────
  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(inv: Investment) {
    setForm({
      id: inv.id,
      name: inv.name,
      type: inv.type,
      symbol: inv.symbol ?? "",
      investedAmount: String(inv.investedAmount),
      currentValue: String(inv.currentValue),
      purchaseDate: inv.purchaseDate ?? new Date().toISOString().slice(0, 10),
      notes: inv.notes ?? "",
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const investedAmount = Number(form.investedAmount);
    const currentValue = Number(form.currentValue);
    if (!form.name.trim()) {
      alert("Vui lòng nhập tên tài sản đầu tư");
      return;
    }
    if (!investedAmount || investedAmount <= 0) {
      alert("Vui lòng nhập số vốn đầu tư hợp lệ");
      return;
    }
    if (Number.isNaN(currentValue) || currentValue < 0) {
      alert("Vui lòng nhập giá trị hiện tại hợp lệ");
      return;
    }

    const investment: Investment = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      symbol: form.symbol.trim() || undefined,
      investedAmount,
      currentValue,
      purchaseDate: form.purchaseDate || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (form.id) await updateInvestment(investment);
    else await addInvestment(investment);
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bạn có chắc muốn xóa tài sản đầu tư này?")) return;
    await deleteInvestment(id);
    await reloadData();
  }

  const isProfit = summary.profitLoss >= 0;

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
                Investment Intelligence
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Danh mục đầu tư
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {investments.length} tài sản · Cập nhật thời gian thực
              </p>
            </div>
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
            >
              <Plus size={17} />
              Thêm tài sản
            </button>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {/* 1 · Total portfolio value */}
            <KpiCard
              label="Tổng giá trị danh mục"
              value={
                summary.currentValue >= 1_000_000
                  ? (summary.currentValue / 1_000_000).toFixed(1) + "M"
                  : formatVND(summary.currentValue)
              }
              sub={investments.length + " tài sản · " + byType.length + " loại"}
              gradient="from-blue-500 to-blue-600"
              iconBg="bg-blue-400/30"
              icon={<BriefcaseBusiness size={16} />}
            />
            {/* 2 · Total invested capital */}
            <KpiCard
              label="Tổng vốn đầu tư"
              value={
                summary.investedAmount >= 1_000_000
                  ? (summary.investedAmount / 1_000_000).toFixed(1) + "M"
                  : formatVND(summary.investedAmount)
              }
              sub="Vốn gốc đã đầu tư"
              gradient="from-indigo-500 to-indigo-600"
              iconBg="bg-indigo-400/30"
              icon={<CircleDollarSign size={16} />}
            />
            {/* 3 · Profit / Loss */}
            <KpiCard
              label={isProfit ? "Lợi nhuận" : "Lỗ ròng"}
              value={
                (isProfit ? "+" : "-") +
                (Math.abs(summary.profitLoss) >= 1_000_000
                  ? (Math.abs(summary.profitLoss) / 1_000_000).toFixed(1) + "M"
                  : formatVND(Math.abs(summary.profitLoss)))
              }
              sub={isProfit ? "Lãi chưa thực hiện" : "Lỗ chưa thực hiện"}
              gradient={
                isProfit
                  ? "from-emerald-500 to-emerald-600"
                  : "from-rose-400 to-rose-500"
              }
              iconBg="bg-white/20"
              icon={
                isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />
              }
            />
            {/* 4 · ROI % */}
            <KpiCard
              label="Tỷ suất sinh lời (ROI)"
              value={(isProfit ? "+" : "") + summary.returnPercent + "%"}
              sub={isProfit ? "Tăng trưởng vốn" : "Sụt giảm vốn"}
              gradient={
                isProfit
                  ? "from-cyan-500 to-cyan-600"
                  : "from-orange-400 to-orange-500"
              }
              iconBg="bg-white/20"
              icon={<Zap size={16} />}
            />
            {/* 5 · Portfolio Health */}
            <div
              className={
                "col-span-2 sm:col-span-1 rounded-2xl bg-gradient-to-br p-4 shadow-sm " +
                (healthScores.overall >= 80
                  ? "from-indigo-500 to-indigo-600"
                  : healthScores.overall >= 60
                    ? "from-blue-500 to-blue-600"
                    : healthScores.overall >= 40
                      ? "from-amber-400 to-orange-500"
                      : "from-rose-500 to-red-500")
              }
            >
              <p className="text-[10px] font-black uppercase tracking-wide text-white/80">
                Portfolio Health
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                {healthScores.overall}
                <span className="text-lg opacity-70">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-1.5 rounded-full bg-white"
                  style={{ width: Math.min(healthScores.overall, 100) + "%" }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-white/80">
                {healthScores.overallGrade.label}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 · Portfolio Overview Panel
          ══════════════════════════════════════════════════════════════════ */}
      {investments.length > 0 && (
        <section className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          {/* Allocation donut + legend */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                <Target size={17} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Phân bổ danh mục
                </h2>
                <p className="text-xs text-slate-500">
                  Theo loại tài sản · giá trị hiện tại
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {pieData.length > 0 ? (
                <div className="shrink-0">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={4}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => `${Number(v).toFixed(0)}%`}
                    />
                  </PieChart>
                </div>
              ) : (
                <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-full bg-slate-50 text-sm text-slate-300">
                  Chưa có dữ liệu
                </div>
              )}

              {/* Type legend bars */}
              <div className="min-w-0 flex-1 space-y-3">
                {byType.map((g) => (
                  <div key={g.type}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: g.color }}
                        />
                        <span className="font-bold text-slate-700">
                          {g.label}
                        </span>
                        <span className="text-slate-400">({g.count})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            "text-xs font-black " +
                            (g.plPct >= 0
                              ? "text-emerald-600"
                              : "text-rose-500")
                          }
                        >
                          {g.plPct >= 0 ? "+" : ""}
                          {g.plPct}%
                        </span>
                        <span className="font-black text-slate-700">
                          {g.allocPct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: g.allocPct + "%", background: g.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Portfolio Overview stats */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div
                className={
                  "flex size-10 items-center justify-center rounded-2xl text-white shadow-sm " +
                  (isProfit
                    ? "bg-gradient-to-br from-emerald-500 to-teal-500"
                    : "bg-gradient-to-br from-rose-500 to-orange-400")
                }
              >
                {isProfit ? (
                  <TrendingUp size={17} />
                ) : (
                  <TrendingDown size={17} />
                )}
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">
                  Tổng quan danh mục
                </h2>
                <p className="text-xs text-slate-500">Unrealized P&amp;L</p>
              </div>
            </div>

            <div className="space-y-4">
              <OverviewRow
                label="Giá trị hiện tại"
                value={formatVND(summary.currentValue)}
                valueClass="text-blue-700 font-black"
              />
              <OverviewRow
                label="Vốn đầu tư"
                value={formatVND(summary.investedAmount)}
                valueClass="text-slate-700 font-black"
              />
              <div className="my-1 border-t border-slate-100" />
              <OverviewRow
                label="Lãi / Lỗ chưa thực hiện"
                value={(isProfit ? "+" : "") + formatVND(summary.profitLoss)}
                valueClass={
                  isProfit
                    ? "text-emerald-600 font-black"
                    : "text-rose-500 font-black"
                }
              />
              <OverviewRow
                label="Tỷ suất lợi nhuận"
                value={(isProfit ? "+" : "") + summary.returnPercent + "%"}
                valueClass={
                  isProfit
                    ? "text-emerald-600 font-black"
                    : "text-rose-500 font-black"
                }
              />
            </div>

            {/* Growth indicator */}
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs text-slate-500">
                <span>Vốn gốc</span>
                <span
                  className={
                    "font-black " +
                    (isProfit ? "text-emerald-600" : "text-rose-500")
                  }
                >
                  {isProfit ? "▲" : "▼"} {Math.abs(summary.returnPercent)}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={
                    "h-3 rounded-full transition-all " +
                    (isProfit
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-rose-500 to-orange-400")
                  }
                  style={{
                    width:
                      Math.min(Math.abs(summary.returnPercent) * 3, 100) + "%",
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                <span>0%</span>
                <span>Mục tiêu 15%</span>
                <span>30%+</span>
              </div>
            </div>

            {/* Growth chip */}
            <div
              className={
                "mt-4 inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold " +
                (isProfit
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-600")
              }
            >
              {isProfit ? (
                <ArrowUpRight size={15} />
              ) : (
                <ArrowDownRight size={15} />
              )}
              {isProfit
                ? "Danh mục đang tăng trưởng"
                : "Danh mục đang sụt giảm"}
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Asset Class Distribution + Performance BarChart
          ══════════════════════════════════════════════════════════════════ */}
      {byType.length > 0 && (
        <section className="space-y-5">
          {/* Asset class cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {byType.map((g) => (
              <div
                key={g.type}
                className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={
                      "flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm " +
                      g.gradientFrom +
                      " " +
                      g.gradientTo
                    }
                  >
                    <AssetIcon type={g.type} size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-700">
                      {g.label}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {g.count} tài sản
                    </p>
                  </div>
                </div>
                <p className="mt-4 truncate text-lg font-black text-blue-700">
                  {g.current >= 1_000_000
                    ? (g.current / 1_000_000).toFixed(1) + "M"
                    : formatVND(g.current)}
                </p>
                <p
                  className={
                    "mt-0.5 text-sm font-black " +
                    (g.plPct >= 0 ? "text-emerald-600" : "text-rose-500")
                  }
                >
                  {g.plPct >= 0 ? "+" : ""}
                  {g.plPct}%
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: g.allocPct + "%", background: g.color }}
                  />
                </div>
                <p className="mt-1 text-right text-[10px] font-bold text-slate-400">
                  {g.allocPct}% danh mục
                </p>
              </div>
            ))}
          </div>

          {/* Performance BarChart */}
          {investments.length > 0 && (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
                  <TrendingUp size={17} />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Hiệu suất từng tài sản
                  </h2>
                  <p className="text-xs text-slate-500">
                    So sánh vốn đầu tư và giá trị hiện tại (triệu đồng)
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <BarChart
                  width={Math.max(640, investments.length * 130)}
                  height={260}
                  data={barData}
                  barGap={4}
                  barCategoryGap={20}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                  />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} />
                  <Tooltip
                    formatter={(v: unknown) => `${Number(v).toFixed(1)}M đ`}
                  />
                  <Bar
                    dataKey="Vốn đầu tư"
                    fill="#94a3b8"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="Giá trị HT"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </div>
              <div className="mt-4 flex gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-5 rounded-full bg-slate-400" />
                  Vốn đầu tư
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-5 rounded-full bg-blue-600" />
                  Giá trị hiện tại
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4 · Portfolio Health Scores
          ══════════════════════════════════════════════════════════════════ */}
      {investments.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Shield size={14} className="text-indigo-600" />
            <p className="text-sm font-black text-slate-700">
              Portfolio Health Analysis
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Đa dạng hoá",
                score: healthScores.diversification,
                grade: healthScores.diversificationGrade,
                desc: "Dựa trên số loại tài sản",
                icon: <Zap size={16} />,
                grad: "from-indigo-500 to-indigo-600",
              },
              {
                label: "Rủi ro tập trung",
                score: healthScores.concentration,
                grade: healthScores.concentrationGrade,
                desc: "Dựa trên phân bổ cao nhất",
                icon: <Shield size={16} />,
                grad: "from-amber-400 to-orange-500",
              },
              {
                label: "Hiệu suất",
                score: healthScores.performance,
                grade: healthScores.performanceGrade,
                desc: "Dựa trên ROI tổng thể",
                icon: <TrendingUp size={16} />,
                grad: "from-emerald-500 to-teal-500",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={
                      "flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm " +
                      s.grad
                    }
                  >
                    {s.icon}
                  </div>
                  <span className={"text-sm font-black " + s.grade.color}>
                    {s.grade.label}
                  </span>
                </div>
                <p className="mt-4 text-3xl font-black text-slate-900">
                  {s.score}
                  <span className="text-base font-bold text-slate-400">
                    /100
                  </span>
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-600">
                  {s.label}
                </p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={
                      "h-2.5 rounded-full bg-gradient-to-r transition-all " +
                      s.grad
                    }
                    style={{ width: s.score + "%" }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5 · AI Investment Advisor
          ══════════════════════════════════════════════════════════════════ */}
      {insights.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <Bot size={14} className="text-blue-600" />
            <p className="text-sm font-black text-slate-700">
              AI Investment Advisor
            </p>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
              {insights.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map((insight, i) => {
              const styles = {
                good: {
                  card: "border-emerald-200 bg-emerald-50",
                  icon: "bg-emerald-100 text-emerald-600",
                  title: "text-emerald-800",
                  body: "text-emerald-700",
                  Icon: Sparkles,
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
          SECTION 6 · Top Holdings Leaderboard
          ══════════════════════════════════════════════════════════════════ */}
      {investments.length >= 2 && (
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Trophy size={14} className="text-amber-500" />
              <p className="text-sm font-black text-slate-700">Top Holdings</p>
            </div>
            {/* Tab pills */}
            <div className="flex gap-1.5">
              {[
                { val: "largest" as HoldingTab, label: "Lớn nhất" },
                { val: "best" as HoldingTab, label: "Tốt nhất" },
                { val: "worst" as HoldingTab, label: "Kém nhất" },
              ].map((tab) => (
                <button
                  key={tab.val}
                  onClick={() => setHoldingTab(tab.val)}
                  className={
                    "rounded-2xl px-3 py-1.5 text-xs font-bold transition-all " +
                    (holdingTab === tab.val
                      ? tab.val === "worst"
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {(holdingTab === "largest"
              ? topHoldings.largest
              : holdingTab === "best"
                ? topHoldings.best
                : topHoldings.worst
            ).map((inv, i) => {
              const medals = [
                {
                  bg: "from-amber-400 to-yellow-500",
                  text: "text-amber-600",
                  label: "#1",
                },
                {
                  bg: "from-slate-400 to-slate-500",
                  text: "text-slate-500",
                  label: "#2",
                },
                {
                  bg: "from-amber-600 to-orange-700",
                  text: "text-orange-600",
                  label: "#3",
                },
              ];
              const medal = medals[i] ?? medals[2];
              const cfg = TYPE_CONFIG[inv.type];
              const maxVal =
                holdingTab === "largest"
                  ? (topHoldings.largest[0]?.currentValue ?? 1)
                  : holdingTab === "best"
                    ? (topHoldings.best[0]?.plPct ?? 1)
                    : Math.abs(topHoldings.worst[0]?.plPct ?? 1);
              const barPct =
                holdingTab === "largest"
                  ? maxVal > 0
                    ? Math.round((inv.currentValue / maxVal) * 100)
                    : 0
                  : holdingTab === "best"
                    ? maxVal > 0
                      ? Math.round((inv.plPct / maxVal) * 100)
                      : 0
                    : maxVal > 0
                      ? Math.round((Math.abs(inv.plPct) / maxVal) * 100)
                      : 0;

              return (
                <div
                  key={inv.id}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        "flex size-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white text-xs font-black shadow-sm " +
                        medal.bg
                      }
                    >
                      {medal.label}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-slate-900">
                        {inv.name}
                      </h3>
                      <span
                        className={
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                          cfg.bg
                        }
                      >
                        {cfg.label}
                      </span>
                    </div>
                    {inv.symbol && (
                      <span className="text-xs font-bold text-slate-400">
                        {inv.symbol}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase text-slate-400">
                        {holdingTab === "largest" ? "Giá trị HT" : "ROI"}
                      </p>
                      <p
                        className={
                          "text-xl font-black " +
                          (holdingTab === "largest"
                            ? "text-blue-700"
                            : inv.plPct >= 0
                              ? "text-emerald-600"
                              : "text-rose-500")
                        }
                      >
                        {holdingTab === "largest"
                          ? inv.currentValue >= 1_000_000
                            ? (inv.currentValue / 1_000_000).toFixed(1) + "M"
                            : formatVND(inv.currentValue)
                          : (inv.plPct >= 0 ? "+" : "") + inv.plPct + "%"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={
                        "h-2 rounded-full bg-gradient-to-r transition-all " +
                        medal.bg
                      }
                      style={{ width: barPct + "%" }}
                    />
                  </div>
                </div>
              );
            })}
            {/* Fallback for "worst" tab with no losers */}
            {holdingTab === "worst" && topHoldings.worst.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center">
                <Sparkles size={28} className="text-emerald-400" />
                <p className="mt-3 font-black text-emerald-700">
                  Tất cả tài sản đều sinh lời!
                </p>
                <p className="mt-1 text-sm text-emerald-600">
                  Không có tài sản nào đang thua lỗ trong danh mục.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7 · Search + Filters + Investment Cards
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Filter bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative min-w-48 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tài sản, mã..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:shadow-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Type filter pills */}
          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              label="Tất cả"
              count={investments.length}
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              color="blue"
            />
            {ALL_TYPES.map((t) => {
              const count = investments.filter((i) => i.type === t).length;
              if (count === 0) return null;
              return (
                <FilterPill
                  key={t}
                  label={TYPE_CONFIG[t].label}
                  count={count}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(t)}
                  color="blue"
                />
              );
            })}
          </div>

          {/* Performance filter pills */}
          <div className="flex gap-1.5">
            <FilterPill
              label="Sinh lời"
              active={perfFilter === "profit"}
              onClick={() =>
                setPerfFilter(perfFilter === "profit" ? "all" : "profit")
              }
              color="emerald"
            />
            <FilterPill
              label="Thua lỗ"
              active={perfFilter === "loss"}
              onClick={() =>
                setPerfFilter(perfFilter === "loss" ? "all" : "loss")
              }
              color="rose"
            />
          </div>

          {/* Count + Add */}
          <div className="ml-auto flex items-center gap-3">
            {(search || typeFilter !== "all" || perfFilter !== "all") && (
              <span className="text-xs text-slate-400">
                {filteredInvestments.length} kết quả
              </span>
            )}
            <button
              onClick={openCreateForm}
              className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Plus size={13} />
              Thêm
            </button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredInvestments.map((inv) => {
            const cfg = TYPE_CONFIG[inv.type];
            const profit = inv.pl >= 0;

            const statusStyles: Record<
              "strong" | "stable" | "under",
              { badge: string; label: string }
            > = {
              strong: {
                badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
                label: "Tăng trưởng mạnh",
              },
              stable: {
                badge: "border-blue-200 bg-blue-50 text-blue-700",
                label: "Ổn định",
              },
              under: {
                badge: "border-rose-200 bg-rose-50 text-rose-600",
                label: "Kém hiệu quả",
              },
            };
            const st = statusStyles[inv.status];

            return (
              <div
                key={inv.id}
                className="group rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <InvestmentIcon type={inv.type} />
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">
                        {inv.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            cfg.bg
                          }
                        >
                          {cfg.label}
                        </span>
                        {inv.symbol && (
                          <span className="text-[10px] font-bold text-slate-400">
                            {inv.symbol}
                          </span>
                        )}
                        <span
                          className={
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold " +
                            st.badge
                          }
                        >
                          {st.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Hover edit/delete */}
                  <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => openEditForm(inv)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Current value + ROI chip */}
                <div className="mt-5 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">
                      Giá trị hiện tại
                    </p>
                    <p className="text-2xl font-black text-blue-700">
                      {formatVND(inv.currentValue)}
                    </p>
                  </div>
                  <div
                    className={
                      "flex items-center gap-1 rounded-2xl border px-3 py-1.5 text-sm font-black " +
                      (profit
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-rose-200 bg-rose-50 text-rose-500")
                    }
                  >
                    {profit ? (
                      <TrendingUp size={13} />
                    ) : (
                      <TrendingDown size={13} />
                    )}
                    {profit ? "+" : ""}
                    {inv.plPct}%
                  </div>
                </div>

                {/* 3-col mini stats */}
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3">
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Vốn đầu tư
                    </p>
                    <p className="mt-0.5 text-xs font-black text-slate-700">
                      {inv.investedAmount >= 1_000_000
                        ? (inv.investedAmount / 1_000_000).toFixed(1) + "M"
                        : formatVND(inv.investedAmount)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Lãi / Lỗ
                    </p>
                    <p
                      className={
                        "mt-0.5 text-xs font-black " +
                        (profit ? "text-emerald-600" : "text-rose-500")
                      }
                    >
                      {profit ? "+" : ""}
                      {inv.pl >= 1_000_000 || inv.pl <= -1_000_000
                        ? (inv.pl / 1_000_000).toFixed(1) + "M"
                        : formatVND(inv.pl)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-400">
                      Tỷ trọng
                    </p>
                    <p className="mt-0.5 text-xs font-black text-slate-700">
                      {inv.allocPct}%
                    </p>
                  </div>
                </div>

                {/* Allocation bar */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Tỷ trọng danh mục</span>
                    <span className="font-black text-slate-600">
                      {inv.allocPct}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{
                        width: inv.allocPct + "%",
                        background: cfg.color,
                      }}
                    />
                  </div>
                </div>

                {/* Purchase date */}
                {inv.purchaseDate && (
                  <p className="mt-3 text-[11px] text-slate-400">
                    Ngày mua: {inv.purchaseDate}
                  </p>
                )}

                {/* Notes */}
                {inv.notes && (
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                    {inv.notes}
                  </p>
                )}

                {/* Mobile row */}
                <div className="mt-4 flex gap-2 lg:hidden">
                  <button
                    onClick={() => openEditForm(inv)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-500"
                  >
                    <Edit3 size={12} />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(inv.id)}
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
          {filteredInvestments.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <BriefcaseBusiness size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                {search || typeFilter !== "all" || perfFilter !== "all"
                  ? "Không tìm thấy tài sản"
                  : "Chưa có tài sản đầu tư"}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                {search || typeFilter !== "all" || perfFilter !== "all"
                  ? "Thử thay đổi bộ lọc."
                  : "Thêm tài sản đầu tư đầu tiên để bắt đầu theo dõi danh mục."}
              </p>
              {!(search || typeFilter !== "all" || perfFilter !== "all") && (
                <button
                  onClick={openCreateForm}
                  className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
                >
                  <Plus size={15} />
                  Thêm tài sản
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa tài sản đầu tư" : "Thêm tài sản đầu tư"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Nhập vốn ban đầu và giá trị hiện tại để tính lãi/lỗ.
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
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  label="Tên tài sản *"
                  value={form.name}
                  onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="VD: Cổ phiếu FPT, Bitcoin..."
                />
                <FormInput
                  label="Mã / Symbol"
                  value={form.symbol}
                  onChange={(v) => setForm((p) => ({ ...p, symbol: v }))}
                  placeholder="VD: FPT, BTC, VNM..."
                />
                <CurrencyInput
                  label="Vốn đầu tư *"
                  value={form.investedAmount}
                  onChange={(v) =>
                    setForm((p) => ({ ...p, investedAmount: v }))
                  }
                  placeholder="10000000"
                />
                <CurrencyInput
                  label="Giá trị hiện tại *"
                  value={form.currentValue}
                  onChange={(v) => setForm((p) => ({ ...p, currentValue: v }))}
                  placeholder="12500000"
                />

                {/* Asset type selector */}
                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700">
                    Loại tài sản
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        type: e.target.value as InvestmentType,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                  >
                    {ALL_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_CONFIG[t].label}
                      </option>
                    ))}
                  </select>
                </div>

                <FormInput
                  label="Ngày mua"
                  value={form.purchaseDate}
                  onChange={(v) => setForm((p) => ({ ...p, purchaseDate: v }))}
                  type="date"
                />

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-black text-slate-700">
                    Ghi chú
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notes: e.target.value }))
                    }
                    placeholder="Ghi chú thêm về tài sản này..."
                    rows={2}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                  />
                </div>

                {/* P&L preview */}
                {form.investedAmount && form.currentValue && (
                  <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
                    {(() => {
                      const invested = Number(form.investedAmount);
                      const current = Number(form.currentValue);
                      const pl = current - invested;
                      const pct =
                        invested > 0
                          ? Math.round((pl / invested) * 1000) / 10
                          : 0;
                      const profit = pl >= 0;
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-slate-600">
                            Xem trước Lãi / Lỗ
                          </span>
                          <span
                            className={
                              "font-black " +
                              (profit ? "text-emerald-600" : "text-rose-500")
                            }
                          >
                            {profit ? "+" : ""}
                            {formatVND(pl)} ({profit ? "+" : ""}
                            {pct}%)
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-[.98]"
                >
                  {form.id ? "Lưu thay đổi" : "Thêm tài sản"}
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

function OverviewRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={"text-sm " + valueClass}>{value}</span>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  color = "blue",
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  color?: "blue" | "emerald" | "rose";
}) {
  const activeClass =
    color === "emerald"
      ? "border-emerald-300 bg-emerald-600 text-white shadow-sm"
      : color === "rose"
        ? "border-rose-300 bg-rose-500 text-white shadow-sm"
        : "border-blue-300 bg-blue-600 text-white shadow-sm";

  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-bold transition-all " +
        (active
          ? activeClass
          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50")
      }
    >
      {label}
      {count !== undefined && (
        <span
          className={
            "rounded-full px-1.5 py-0.5 text-[9px] font-black " +
            (active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

function AssetIcon({
  type,
  size = 18,
}: {
  type: InvestmentType;
  size?: number;
}) {
  const icons: Record<InvestmentType, React.ReactNode> = {
    crypto: <Bitcoin size={size} />,
    fund: <CircleDollarSign size={size} />,
    gold: <Gem size={size} />,
    other: <Coins size={size} />,
    stock: <TrendingUp size={size} />,
  };
  return <>{icons[type]}</>;
}

function InvestmentIcon({ type }: { type: InvestmentType }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <div
      className={
        "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm " +
        cfg.gradientFrom +
        " " +
        cfg.gradientTo
      }
    >
      <AssetIcon type={type} size={20} />
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-black text-slate-700">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </div>
  );
}
