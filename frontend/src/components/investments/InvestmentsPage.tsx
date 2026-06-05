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
  Bitcoin,
  BriefcaseBusiness,
  CircleDollarSign,
  Coins,
  Edit3,
  Gem,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
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

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  { label: string; color: string; gradientFrom: string; gradientTo: string }
> = {
  stock: {
    label: "Cá»• phiáº¿u",
    color: "#10b981",
    gradientFrom: "from-emerald-500",
    gradientTo: "to-teal-400",
  },
  crypto: {
    label: "Crypto",
    color: "#f97316",
    gradientFrom: "from-orange-400",
    gradientTo: "to-yellow-500",
  },
  fund: {
    label: "Quá»¹ Ä‘áº§u tÆ°",
    color: "#2563eb",
    gradientFrom: "from-blue-600",
    gradientTo: "to-cyan-500",
  },
  gold: {
    label: "VÃ ng",
    color: "#f59e0b",
    gradientFrom: "from-amber-400",
    gradientTo: "to-orange-500",
  },
  other: {
    label: "KhÃ¡c",
    color: "#64748b",
    gradientFrom: "from-slate-500",
    gradientTo: "to-slate-700",
  },
};

// â”€â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function InvestmentsPage() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [typeFilter, setTypeFilter] = useState<InvestmentType | "all">("all");

  async function reloadData() {
    setInvestments(await getInvestments());
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);

  useRealtimeTable(["investments"], reloadData);

  // â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ By-type breakdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const byType = useMemo(() => {
    return ALL_TYPES.map((type) => {
      const items = investments.filter((i) => i.type === type);
      const invested = items.reduce((s, i) => s + i.investedAmount, 0);
      const current = items.reduce((s, i) => s + i.currentValue, 0);
      const pl = current - invested;
      const plPct = invested > 0 ? Math.round((pl / invested) * 1000) / 10 : 0;
      const allocationPct =
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
        allocationPct,
      };
    }).filter((g) => g.count > 0);
  }, [investments, summary.currentValue]);

  // â”€â”€ Chart data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const pieData = useMemo(
    () =>
      byType.map((g) => ({
        name: g.label,
        value: g.allocationPct,
        color: g.color,
      })),
    [byType],
  );

  const barData = useMemo(
    () =>
      investments.map((i) => ({
        name: i.symbol || i.name.slice(0, 8),
        "Vá»‘n Ä‘áº§u tÆ°": +(i.investedAmount / 1_000_000).toFixed(1),
        "GiÃ¡ trá»‹ HT": +(i.currentValue / 1_000_000).toFixed(1),
      })),
    [investments],
  );

  // â”€â”€ Filtered list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const filtered = useMemo(
    () =>
      typeFilter === "all"
        ? investments
        : investments.filter((i) => i.type === typeFilter),
    [investments, typeFilter],
  );

  // â”€â”€ CRUD handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      alert("Vui lÃ²ng nháº­p tÃªn tÃ i sáº£n Ä‘áº§u tÆ°");
      return;
    }
    if (!investedAmount || investedAmount <= 0) {
      alert("Vui lÃ²ng nháº­p sá»‘ vá»‘n Ä‘áº§u tÆ° há»£p lá»‡");
      return;
    }
    if (Number.isNaN(currentValue) || currentValue < 0) {
      alert("Vui lÃ²ng nháº­p giÃ¡ trá»‹ hiá»‡n táº¡i há»£p lá»‡");
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

    if (form.id) {
      await updateInvestment(investment);
    } else {
      await addInvestment(investment);
    }
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    if (!confirm("Báº¡n cÃ³ cháº¯c muá»‘n xÃ³a tÃ i sáº£n Ä‘áº§u tÆ° nÃ y?"))
      return;
    await deleteInvestment(id);
    await reloadData();
  }

  const isProfit = summary.profitLoss >= 0;

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="space-y-6">
      {/* â”€â”€ Hero â”€â”€ */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[1.5fr_1fr]">
          {/* Left: portfolio stats */}
          <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-8">
            <p className="text-sm font-bold text-blue-600">Äáº§u tÆ°</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900">
              Danh má»¥c Ä‘áº§u tÆ°
            </h1>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <p className="text-5xl font-black tracking-tight text-blue-600">
                {formatVND(summary.currentValue)}
              </p>
              <span
                className={`mb-2 rounded-full px-4 py-2 text-sm font-bold ring-1 ${
                  isProfit
                    ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
                    : "bg-rose-50 text-rose-500 ring-rose-100"
                }`}
              >
                {isProfit ? "â–²" : "â–¼"}{" "}
                {formatVND(Math.abs(summary.profitLoss))} (
                {summary.returnPercent}%)
              </span>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <HeroMini
                label="Vá»‘n Ä‘áº§u tÆ°"
                value={formatVND(summary.investedAmount)}
              />
              <HeroMini
                label="LÃ£i / Lá»—"
                value={formatVND(summary.profitLoss)}
                valueClass={isProfit ? "text-emerald-600" : "text-rose-500"}
              />
              <HeroMini
                label="Tá»· suáº¥t sinh lá»i"
                value={`${summary.returnPercent}%`}
                valueClass={isProfit ? "text-emerald-600" : "text-rose-500"}
              />
            </div>

            {/* Overall progress bar */}
            <div className="mt-8">
              <div className="mb-2 flex justify-between text-xs text-slate-500">
                <span>Vá»‘n gá»‘c</span>
                <span
                  className={`font-black ${
                    isProfit ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {isProfit ? "+" : ""}
                  {summary.returnPercent}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full transition-all ${
                    isProfit
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-rose-500 to-orange-400"
                  }`}
                  style={{
                    width: `${Math.min(Math.abs(summary.returnPercent) * 2, 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right: allocation pie */}
          <div className="flex flex-col items-center justify-center border-t border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-5 sm:p-8 xl:border-l xl:border-t-0">
            <p className="mb-4 text-sm font-bold text-slate-600">
              PhÃ¢n bá»• theo loáº¡i
            </p>

            {pieData.length > 0 ? (
              <>
                <PieChart width={200} height={200}>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={4}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
                  />
                </PieChart>

                <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
                  {byType.map((g) => (
                    <span
                      key={g.type}
                      className="flex items-center gap-1.5 text-xs text-slate-600"
                    >
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: g.color }}
                      />
                      {g.label} {g.allocationPct}%
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-48 items-center justify-center text-sm text-slate-400">
                ChÆ°a cÃ³ dá»¯ liá»‡u
              </div>
            )}
          </div>
        </div>
      </section>

      {/* â”€â”€ By-type KPI cards â”€â”€ */}
      {byType.length > 0 && (
        <section className="grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {byType.map((g) => (
            <TypeCard key={g.type} {...g} />
          ))}
        </section>
      )}

      {/* â”€â”€ Performance bar chart â”€â”€ */}
      {investments.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-black text-slate-900">
            Hiá»‡u suáº¥t tá»«ng tÃ i sáº£n
          </p>
          <p className="mt-1 text-sm text-slate-500">
            So sÃ¡nh vá»‘n Ä‘áº§u tÆ° vÃ  giÃ¡ trá»‹ hiá»‡n táº¡i (Ä‘Æ¡n vá»‹:
            triá»‡u Ä‘á»“ng)
          </p>

          <div className="mt-6 overflow-x-auto">
            <BarChart
              width={Math.max(680, investments.length * 130)}
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
                dataKey="Vá»‘n Ä‘áº§u tÆ°"
                fill="#94a3b8"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="GiÃ¡ trá»‹ HT"
                fill="#2563eb"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </div>

          <div className="mt-4 flex gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-5 rounded-full bg-slate-400" />
              Vá»‘n Ä‘áº§u tÆ°
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-5 rounded-full bg-blue-600" />
              GiÃ¡ trá»‹ hiá»‡n táº¡i
            </span>
          </div>
        </section>
      )}

      {/* â”€â”€ Filter tabs + Add button + Grid â”€â”€ */}
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterTab
              label="Táº¥t cáº£"
              count={investments.length}
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
            />
            {ALL_TYPES.map((t) => {
              const count = investments.filter((i) => i.type === t).length;
              if (count === 0) return null;
              return (
                <FilterTab
                  key={t}
                  label={TYPE_CONFIG[t].label}
                  count={count}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(t)}
                />
              );
            })}
          </div>

          <button
            onClick={openCreateForm}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
          >
            <Plus size={18} />
            ThÃªm tÃ i sáº£n
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((inv) => {
            const pl = inv.currentValue - inv.investedAmount;
            const plPct =
              inv.investedAmount > 0
                ? Math.round((pl / inv.investedAmount) * 1000) / 10
                : 0;
            const cfg = TYPE_CONFIG[inv.type];
            const profit = pl >= 0;

            return (
              <div
                key={inv.id}
                className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <InvestmentIcon type={inv.type} />
                    <div>
                      <h3 className="font-black text-slate-900">{inv.name}</h3>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                          style={{ background: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        {inv.symbol && (
                          <span className="text-xs font-bold text-slate-400">
                            {inv.symbol}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditForm(inv)}
                      className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Value */}
                <div className="mt-6">
                  <p className="text-sm text-slate-500">
                    GiÃ¡ trá»‹ hiá»‡n táº¡i
                  </p>
                  <p className="mt-1 text-3xl font-black text-blue-600">
                    {formatVND(inv.currentValue)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Vá»‘n: {formatVND(inv.investedAmount)}
                    {inv.purchaseDate && <> Â· {inv.purchaseDate}</>}
                  </p>
                </div>

                {/* P&L stats */}
                <div className="mt-4 rounded-3xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">LÃ£i / Lá»—</span>
                    <span
                      className={`inline-flex items-center gap-1 font-black ${
                        profit ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {profit ? (
                        <TrendingUp size={15} />
                      ) : (
                        <TrendingDown size={15} />
                      )}
                      {formatVND(pl)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Tá»· suáº¥t</span>
                    <span
                      className={`font-black ${
                        profit ? "text-emerald-600" : "text-rose-500"
                      }`}
                    >
                      {profit ? "+" : ""}
                      {plPct}%
                    </span>
                  </div>

                  {inv.notes && (
                    <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
                      {inv.notes}
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        profit
                          ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                          : "bg-gradient-to-r from-rose-500 to-orange-400"
                      }`}
                      style={{
                        width: `${Math.min(
                          inv.investedAmount > 0
                            ? (inv.currentValue / inv.investedAmount) * 50
                            : 0,
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              {typeFilter === "all"
                ? "ChÆ°a cÃ³ tÃ i sáº£n Ä‘áº§u tÆ° nÃ o. Báº¥m Â«ThÃªm tÃ i sáº£nÂ» Ä‘á»ƒ báº¯t Ä‘áº§u."
                : `ChÆ°a cÃ³ tÃ i sáº£n loáº¡i ${TYPE_CONFIG[typeFilter as InvestmentType].label}.`}
            </div>
          )}
        </div>
      </section>

      {/* â”€â”€ Modal â”€â”€ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-y-auto max-h-[90dvh] rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {form.id
                    ? "Sá»­a tÃ i sáº£n Ä‘áº§u tÆ°"
                    : "ThÃªm tÃ i sáº£n Ä‘áº§u tÆ°"}
                </h2>
                <p className="text-sm text-slate-500">
                  Nháº­p vá»‘n ban Ä‘áº§u vÃ  giÃ¡ trá»‹ hiá»‡n táº¡i Ä‘á»ƒ
                  tÃ­nh lÃ£i/lá»—.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded-2xl bg-slate-100 p-3 text-slate-500 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <FormInput
                label="TÃªn tÃ i sáº£n *"
                value={form.name}
                onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder="VD: Cá»• phiáº¿u FPT, Bitcoin..."
              />

              <FormInput
                label="MÃ£ / Symbol"
                value={form.symbol}
                onChange={(v) => setForm((p) => ({ ...p, symbol: v }))}
                placeholder="VD: FPT, BTC, VNM..."
              />

              <FormInput
                label="Vá»‘n Ä‘áº§u tÆ° *"
                type="number"
                value={form.investedAmount}
                onChange={(v) => setForm((p) => ({ ...p, investedAmount: v }))}
                placeholder="VD: 10000000"
              />

              <FormInput
                label="GiÃ¡ trá»‹ hiá»‡n táº¡i *"
                type="number"
                value={form.currentValue}
                onChange={(v) => setForm((p) => ({ ...p, currentValue: v }))}
                placeholder="VD: 12500000"
              />

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Loáº¡i tÃ i sáº£n
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
                label="NgÃ y mua"
                type="date"
                value={form.purchaseDate}
                onChange={(v) => setForm((p) => ({ ...p, purchaseDate: v }))}
              />

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Ghi chÃº
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, notes: e.target.value }))
                  }
                  placeholder="Ghi chÃº thÃªm vá» tÃ i sáº£n nÃ y..."
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
                        <span className="text-sm font-bold text-slate-600">
                          Xem trÆ°á»›c LÃ£i / Lá»—
                        </span>
                        <span
                          className={`font-black ${
                            profit ? "text-emerald-600" : "text-rose-500"
                          }`}
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

              <div className="flex justify-end gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600"
                >
                  Há»§y
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
                >
                  {form.id ? "LÆ°u thay Ä‘á»•i" : "ThÃªm tÃ i sáº£n"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HeroMini({
  label,
  value,
  valueClass = "text-slate-900",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/70 px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function TypeCard({
  label,
  color,
  gradientFrom,
  gradientTo,
  count,
  current,
  pl,
  plPct,
  allocationPct,
}: {
  label: string;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  count: number;
  current: number;
  pl: number;
  plPct: number;
  allocationPct: number;
}) {
  const profit = pl >= 0;
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex size-8 items-center justify-center rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} text-white shadow`}
        >
          <BriefcaseBusiness size={14} />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-700">{label}</p>
          <p className="text-xs text-slate-400">
            {count} tÃ i sáº£n Â· {allocationPct}%
          </p>
        </div>
      </div>

      <p className="mt-4 text-xl font-black text-blue-600">
        {formatVND(current)}
      </p>

      <p
        className={`mt-1 text-sm font-bold ${
          profit ? "text-emerald-600" : "text-rose-500"
        }`}
      >
        {profit ? "+" : ""}
        {plPct}%
      </p>

      <div className="mt-3 h-1.5 rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full"
          style={{
            width: `${allocationPct}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-blue-600 text-white shadow-lg shadow-blue-100"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-xs font-black ${
          active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
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
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-slate-700">
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

function InvestmentIcon({ type }: { type: InvestmentType }) {
  const cfg = TYPE_CONFIG[type];
  const commonClass = `flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${cfg.gradientFrom} ${cfg.gradientTo} text-white shadow-lg`;

  const icons: Record<InvestmentType, React.ReactNode> = {
    crypto: <Bitcoin size={22} />,
    fund: <CircleDollarSign size={22} />,
    gold: <Gem size={22} />,
    other: <Coins size={22} />,
    stock: <TrendingUp size={22} />,
  };

  return <div className={commonClass}>{icons[type]}</div>;
}
