"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  getTransactions,
  getWallets,
  resetFinanceDemoData,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getDebtRatio,
  getGoalScore,
  getSavingRate,
  getSpendingByCategory,
  getTotalAssets,
  getTotalDebt,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet as WalletType,
} from "@/src/types/finance";

const ASSET_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#38bdf8", "#6366f1"];
const SPEND_COLORS = [
  "#fb7185",
  "#f97316",
  "#0ea5e9",
  "#6366f1",
  "#10b981",
  "#94a3b8",
];
const INV_TYPE_COLORS: Record<string, string> = {
  stock: "#2563eb",
  fund: "#10b981",
  crypto: "#f59e0b",
  gold: "#f97316",
  other: "#6366f1",
};
const INV_TYPE_LABELS: Record<string, string> = {
  stock: "Cổ phiếu",
  fund: "Quỹ ETF",
  crypto: "Crypto",
  gold: "Vàng",
  other: "Khác",
};
const SPARK = [30, 44, 38, 58, 52, 70, 63];

export default function DashboardPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  async function reloadData() {
    const [w, inv, cat, txn, dbt, gls, bdg] = await Promise.all([
      getWallets(),
      getInvestments(),
      getCategories(),
      getTransactions(),
      getDebts(),
      getGoals(),
      getBudgets(),
    ]);
    setWallets(w);
    setInvestments(inv);
    setCategories(cat);
    setTransactions(txn);
    setDebts(dbt);
    setGoals(gls);
    setBudgets(bdg);
  }

  useEffect(() => {
    reloadData();
  }, []);

  useRealtimeTable(
    ["wallets", "transactions", "investments", "debts", "goals", "budgets"],
    reloadData,
  );

  // ── Core summary ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const walletAssets = getTotalAssets(wallets);
    const investmentAssets = investments.reduce(
      (s, i) => s + i.currentValue,
      0,
    );
    const totalAssets = walletAssets + investmentAssets;
    const totalDebt = getTotalDebt(debts);
    const netWorth = totalAssets - totalDebt;
    const income = getTotalIncome(transactions);
    const expense = getTotalExpense(transactions);
    const saving = income - expense;
    const savingRate = getSavingRate(income, expense);
    const debtRatio = getDebtRatio(totalDebt, totalAssets);
    const goalScore = getGoalScore(goals);
    const investedAmount = investments.reduce(
      (s, i) => s + i.investedAmount,
      0,
    );
    const investmentPL = investmentAssets - investedAmount;
    const investmentReturn =
      investedAmount > 0
        ? Math.round((investmentPL / investedAmount) * 1000) / 10
        : 0;
    const liquidBalance = wallets
      .filter((w) => w.type !== "investment")
      .reduce((s, w) => s + w.balance, 0);
    const emergencyMonths = Math.floor(liquidBalance / (expense || 1));
    return {
      walletAssets,
      investmentAssets,
      investedAmount,
      investmentPL,
      investmentReturn,
      totalAssets,
      totalDebt,
      netWorth,
      liquidBalance,
      income,
      expense,
      saving,
      savingRate,
      debtRatio,
      goalScore,
      emergencyMonths,
    };
  }, [wallets, investments, debts, transactions, goals]);

  // ── Net-worth trend (real base + proportional seeds) ─────────────────────
  const netWorthTrend = useMemo(() => {
    const base = summary.netWorth;
    return ["T7", "T8", "T9", "T10", "T11", "T12"].map((m, i) => ({
      month: m,
      value: Math.round(base * [0.74, 0.8, 0.85, 0.91, 0.96, 1.0][i]),
    }));
  }, [summary.netWorth]);

  // ── Cash-flow trend ───────────────────────────────────────────────────────
  const cashFlowTrend = useMemo(() => {
    const [ci, ce, cs] = [
      Math.round(summary.income / 1e6),
      Math.round(summary.expense / 1e6),
      Math.round(summary.saving / 1e6),
    ];
    return ["T7", "T8", "T9", "T10", "T11", "T12"].map((m, i) => ({
      month: m,
      thu: Math.round(ci * [0.75, 0.82, 0.88, 0.93, 0.97, 1.0][i]),
      chi: Math.round(ce * [0.75, 0.82, 0.88, 0.93, 0.97, 1.0][i]),
      tietKiem: Math.round(cs * [0.75, 0.82, 0.88, 0.93, 0.97, 1.0][i]),
    }));
  }, [summary.income, summary.expense, summary.saving]);

  // ── Asset pie ─────────────────────────────────────────────────────────────
  const assetPieData = useMemo(() => {
    const total = summary.totalAssets || 1;
    const items = wallets.map((w, i) => ({
      name: w.name,
      value: Math.round((w.balance / total) * 100),
      color: ASSET_COLORS[i % ASSET_COLORS.length],
    }));
    if (summary.investmentAssets > 0)
      items.push({
        name: "Đầu tư",
        value: Math.round((summary.investmentAssets / total) * 100),
        color: "#10b981",
      });
    return items;
  }, [wallets, summary.totalAssets, summary.investmentAssets]);

  // ── Spending ──────────────────────────────────────────────────────────────
  const spendingByCategory = useMemo(
    () => getSpendingByCategory(transactions, categories),
    [transactions, categories],
  );
  const spendingPieData = useMemo(
    () =>
      spendingByCategory.map((item, i) => ({
        name: item.name,
        value: item.percent,
        color: SPEND_COLORS[i % SPEND_COLORS.length],
      })),
    [spendingByCategory],
  );

  // ── 50/30/20 ─────────────────────────────────────────────────────────────
  const allocation5030 = useMemo(() => {
    const needIds = ["food", "housing", "transport"];
    const income = summary.income || 1;
    const needs = transactions
      .filter((t) => t.type === "expense")
      .filter((t) => {
        const cat = categories.find((c) => c.id === t.categoryId);
        return cat && needIds.some((n) => cat.id.includes(n));
      })
      .reduce((s, t) => s + t.amount, 0);
    const savings = Math.max(summary.saving, 0);
    return {
      needs: Math.round((needs / income) * 100),
      wants: Math.round((Math.max(summary.expense - needs, 0) / income) * 100),
      savings: Math.round((savings / income) * 100),
    };
  }, [transactions, categories, summary]);

  // ── Investment rows ───────────────────────────────────────────────────────
  const investmentRows = useMemo(
    () =>
      investments.map((inv) => {
        const pl = inv.currentValue - inv.investedAmount;
        return {
          ...inv,
          pl,
          plPct:
            inv.investedAmount > 0
              ? Math.round((pl / inv.investedAmount) * 1000) / 10
              : 0,
        };
      }),
    [investments],
  );
  const investPieData = useMemo(() => {
    const total = summary.investmentAssets || 1;
    return investments.map((inv, i) => ({
      name: inv.name,
      value: Math.round((inv.currentValue / total) * 100),
      color: INV_TYPE_COLORS[inv.type] ?? ASSET_COLORS[i % ASSET_COLORS.length],
    }));
  }, [investments, summary.investmentAssets]);

  // ── Goal rows with estimate ───────────────────────────────────────────────
  const goalRows = useMemo(
    () =>
      goals.map((g) => {
        const percent = Math.min(
          Math.round((g.currentAmount / g.targetAmount) * 100),
          100,
        );
        const remaining = g.targetAmount - g.currentAmount;
        return {
          ...g,
          percent,
          remaining,
          monthsLeft:
            summary.saving > 0 ? Math.ceil(remaining / summary.saving) : null,
        };
      }),
    [goals, summary.saving],
  );

  // ── Recent transactions ───────────────────────────────────────────────────
  const recentTxns = useMemo(
    () =>
      transactions.slice(0, 5).map((t) => ({
        ...t,
        categoryName:
          categories.find((c) => c.id === t.categoryId)?.name ?? "Khác",
        walletName: wallets.find((w) => w.id === t.walletId)?.name ?? "Ví",
      })),
    [transactions, categories, wallets],
  );

  // ── Risk score ────────────────────────────────────────────────────────────
  const riskScore = useMemo(
    () =>
      Math.round(
        Math.min(summary.debtRatio, 100) * 0.4 +
          Math.max(0, 40 - summary.savingRate) * 2.5 * 0.35 +
          Math.max(0, 80 - summary.goalScore) * 0.25,
      ),
    [summary],
  );
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
  const healthScore = 100 - riskScore;
  const healthLabel =
    healthScore >= 80
      ? "Xuất sắc"
      : healthScore >= 60
        ? "Tốt"
        : healthScore >= 40
          ? "Trung bình"
          : "Cần cải thiện";

  // ── AI actions ────────────────────────────────────────────────────────────
  const aiActions = useMemo(() => {
    const actions: {
      icon: React.ReactNode;
      title: string;
      body: string;
      tone: "danger" | "warning" | "good";
    }[] = [];
    if (summary.savingRate < 20) {
      actions.push({
        icon: <AlertTriangle size={18} />,
        title: "Tỷ lệ tiết kiệm thấp",
        body: `Bạn đang tiết kiệm ${summary.savingRate}% thu nhập. Mục tiêu tối thiểu là 20%. Xem xét cắt giảm chi tiêu không thiết yếu.`,
        tone: "danger",
      });
    } else if (summary.savingRate < 40) {
      actions.push({
        icon: <PiggyBank size={18} />,
        title: "Tăng thêm tiết kiệm",
        body: `Tỷ lệ tiết kiệm ${summary.savingRate}% — tốt nhưng còn dư địa. Thêm ${formatVND(summary.income * 0.4 - summary.saving)} nữa để đạt mục tiêu 40%.`,
        tone: "warning",
      });
    } else {
      actions.push({
        icon: <ShieldCheck size={18} />,
        title: "Tiết kiệm xuất sắc",
        body: `Bạn đang tiết kiệm ${summary.savingRate}% — vượt mục tiêu 40%. Hãy phân bổ phần thặng dư vào đầu tư.`,
        tone: "good",
      });
    }
    if (summary.debtRatio > 50) {
      actions.push({
        icon: <CreditCard size={18} />,
        title: "Tỷ lệ nợ cần chú ý",
        body: `Nợ chiếm ${summary.debtRatio}% tổng tài sản (an toàn < 40%). Ưu tiên trả nhanh ${formatVND(summary.totalDebt)} còn lại.`,
        tone: "danger",
      });
    } else if (summary.debtRatio > 30) {
      actions.push({
        icon: <Landmark size={18} />,
        title: "Kiểm soát nợ tốt",
        body: `Tỷ lệ nợ ${summary.debtRatio}% — trong vùng an toàn. Tiếp tục trả đúng hạn để giải phóng dòng tiền.`,
        tone: "warning",
      });
    }
    if (summary.emergencyMonths < 3) {
      actions.push({
        icon: <Zap size={18} />,
        title: "Quỹ khẩn cấp thiếu",
        body: `Quỹ khẩn cấp đủ dùng ${summary.emergencyMonths} tháng. Mục tiêu tối thiểu: 3 tháng (${formatVND(summary.expense * 3)}).`,
        tone: "danger",
      });
    }
    if (summary.investmentReturn < 0 && investments.length > 0) {
      actions.push({
        icon: <TrendingDown size={18} />,
        title: "Danh mục đầu tư âm",
        body: `Danh mục đang lỗ ${Math.abs(summary.investmentReturn)}% (${formatVND(Math.abs(summary.investmentPL))}). Đánh giá lại phân bổ tài sản.`,
        tone: "warning",
      });
    }
    if (actions.length < 3 && goalRows.length > 0) {
      const slow = [...goalRows].sort((a, b) => a.percent - b.percent)[0];
      if (slow && slow.percent < 50)
        actions.push({
          icon: <Target size={18} />,
          title: `Đẩy nhanh: ${slow.name}`,
          body: `Mới đạt ${slow.percent}%. ${slow.monthsLeft ? `Còn ~${slow.monthsLeft} tháng nếu giữ tốc độ hiện tại.` : "Tăng khoản góp hàng tháng."}`,
          tone: "warning",
        });
    }
    return actions.slice(0, 3);
  }, [summary, investments, goalRows]);

  // ── KPI bar ───────────────────────────────────────────────────────────────
  const kpiCards = [
    {
      title: "Dòng tiền",
      value: formatVND(summary.saving),
      valueClass: summary.saving >= 0 ? "text-emerald-600" : "text-rose-500",
      note: `Thu ${formatVND(summary.income)}`,
      icon: TrendingUp,
      iconClass: "from-blue-600 to-sky-500",
      barClass: "from-blue-500 to-sky-400",
    },
    {
      title: "Tiết kiệm",
      value: `${summary.savingRate}%`,
      valueClass:
        summary.savingRate >= 20 ? "text-emerald-600" : "text-rose-500",
      note: "Mục tiêu: 40%",
      icon: PiggyBank,
      iconClass: "from-emerald-500 to-teal-400",
      barClass: "from-emerald-500 to-teal-400",
    },
    {
      title: "Tỷ lệ nợ",
      value: `${summary.debtRatio}%`,
      valueClass: summary.debtRatio <= 40 ? "text-violet-600" : "text-rose-500",
      note: summary.debtRatio <= 40 ? "An toàn" : "Cần giảm",
      icon: Landmark,
      iconClass: "from-violet-500 to-indigo-500",
      barClass: "from-violet-500 to-indigo-400",
    },
    {
      title: "Đầu tư",
      value: `${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}%`,
      valueClass:
        summary.investmentReturn >= 0 ? "text-emerald-600" : "text-rose-500",
      note: `${investments.length} tài sản`,
      icon: Briefcase,
      iconClass: "from-emerald-500 to-teal-400",
      barClass: "from-emerald-500 to-teal-400",
    },
    {
      title: "Mục tiêu",
      value: `${summary.goalScore}%`,
      valueClass: "text-blue-600",
      note: `${goals.length} mục tiêu`,
      icon: Target,
      iconClass: "from-blue-500 to-cyan-400",
      barClass: "from-blue-500 to-sky-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── 1. Executive Strip ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  Personal CFO Dashboard
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  Tài sản ròng
                </h1>
              </div>
              <button
                onClick={async () => {
                  await resetFinanceDemoData();
                  await reloadData();
                }}
                className="rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-100"
              >
                Reset demo
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <p className="text-3xl font-black tracking-tight text-blue-600 sm:text-5xl">
                {formatVND(summary.netWorth)}
              </p>
              <span className="mb-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-600 ring-1 ring-emerald-100">
                Tài sản − Nợ
              </span>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <HeroMini
                icon={<Wallet size={16} />}
                label="Thanh khoản"
                value={formatVND(summary.liquidBalance)}
                valueClass="text-blue-600"
              />
              <HeroMini
                icon={<Briefcase size={16} />}
                label="Đầu tư"
                value={formatVND(summary.investmentAssets)}
                valueClass="text-emerald-600"
              />
              <HeroMini
                icon={<CreditCard size={16} />}
                label="Nợ"
                value={formatVND(summary.totalDebt)}
                valueClass="text-rose-500"
              />
            </div>
            <div className="mt-6 h-[160px]">
              <ResponsiveContainer width="100%" height={160} minWidth={0}>
                <AreaChart
                  data={netWorthTrend}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
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
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => [
                      formatVND(Number(v ?? 0)),
                      "Tài sản ròng",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#2563eb"
                    strokeWidth={3}
                    fill="url(#nwGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-slate-200 bg-gradient-to-br from-emerald-50 via-sky-50 to-blue-50 p-5 sm:p-8 xl:border-l xl:border-t-0">
            <div>
              <p className="text-sm font-bold text-slate-600">
                Sức khoẻ tài chính
              </p>
              <div className="mt-5 flex items-center gap-5">
                <div
                  className={`flex size-28 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${riskBg} p-2 shadow-lg`}
                >
                  <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                    <span className={`text-3xl font-black ${riskColor}`}>
                      {healthScore}
                    </span>
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                </div>
                <div>
                  <p className={`text-xl font-black ${riskColor}`}>
                    {healthLabel}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Rủi ro: {riskLevel}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <ScoreLine
                label="Tiết kiệm"
                value={Math.min(Math.round(summary.savingRate * 2.5), 100)}
              />
              <ScoreLine
                label="An toàn nợ"
                value={Math.max(100 - Math.round(summary.debtRatio), 0)}
              />
              <ScoreLine label="Mục tiêu" value={summary.goalScore} />
              <ScoreLine
                label="Quỹ khẩn cấp"
                value={Math.min(
                  Math.round((summary.emergencyMonths / 6) * 100),
                  100,
                )}
              />
            </div>
            <div className="mt-6 rounded-2xl bg-white/70 p-4 text-sm text-slate-600 backdrop-blur">
              <span className="font-bold text-slate-900">Quỹ khẩn cấp: </span>
              {summary.emergencyMonths} tháng chi tiêu
              {summary.emergencyMonths < 3 ? (
                <span className="ml-2 font-bold text-rose-500">⚠ Thiếu</span>
              ) : (
                <span className="ml-2 font-bold text-emerald-600">
                  ✓ An toàn
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. KPI Strip ───────────────────────────────────────────────── */}
      <section className="-mx-4 sm:mx-0">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scroll-smooth no-scrollbar md:hidden">
          {kpiCards.map((item) => (
            <div key={item.title} className="shrink-0 w-[200px] snap-start">
              <KpiCard {...item} />
            </div>
          ))}
        </div>
        <div className="hidden md:grid md:grid-cols-3 xl:grid-cols-5 gap-4">
          {kpiCards.map((item) => (
            <KpiCard key={item.title} {...item} />
          ))}
        </div>
      </section>

      {/* ── 3. Wealth Growth + Cash Flow ───────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Tăng trưởng tài sản"
          subtitle="Xu hướng tài sản ròng và phân bổ 6 tháng"
        >
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MiniStat
              label="Tổng tài sản"
              value={formatVND(summary.totalAssets)}
              color="text-blue-600"
            />
            <MiniStat
              label="Lợi nhuận ĐT"
              value={`${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}%`}
              color={
                summary.investmentReturn >= 0
                  ? "text-emerald-600"
                  : "text-rose-500"
              }
            />
            <MiniStat
              label="Tiết kiệm/tháng"
              value={formatVND(summary.saving)}
              color={summary.saving >= 0 ? "text-emerald-600" : "text-rose-500"}
            />
          </div>
          <div className="mt-5 h-[220px]">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <AreaChart
                data={netWorthTrend}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="wealthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
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
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`}
                />
                <Tooltip
                  formatter={(v) => [formatVND(Number(v ?? 0)), "Tài sản ròng"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#wealthGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-[140px_1fr] sm:items-center">
            <div className="relative mx-auto h-36 w-36">
              <PieChart width={144} height={144}>
                <Pie
                  data={assetPieData}
                  dataKey="value"
                  innerRadius={42}
                  outerRadius={64}
                  paddingAngle={3}
                >
                  {assetPieData.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-blue-600">
                  {Math.round(summary.totalAssets / 1_000_000)}M
                </span>
                <span className="text-[10px] text-slate-500">Tổng</span>
              </div>
            </div>
            <div className="space-y-3">
              {assetPieData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ background: item.color }}
                  />
                  <span className="flex-1 text-sm text-slate-600 truncate">
                    {item.name}
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {item.value}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Dòng tiền & Chi tiêu"
          subtitle="Xu hướng 6 tháng và phân bổ thu nhập"
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
              label="Tiết kiệm"
              value={`${summary.savingRate}%`}
              color={
                summary.savingRate >= 20 ? "text-emerald-600" : "text-rose-500"
              }
            />
          </div>
          <div className="mt-5 h-[220px]">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <BarChart
                data={cashFlowTrend}
                barGap={2}
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
                <YAxis axisLine={false} tickLine={false} fontSize={11} />
                <Tooltip />
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
          </div>
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
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-700">
              Quy tắc 50/30/20
            </p>
            <AllocationRow
              label="Thiết yếu (50%)"
              actual={allocation5030.needs}
              target={50}
              color="bg-blue-500"
            />
            <AllocationRow
              label="Muốn (30%)"
              actual={allocation5030.wants}
              target={30}
              color="bg-violet-500"
            />
            <AllocationRow
              label="Tiết kiệm (20%)"
              actual={allocation5030.savings}
              target={20}
              color="bg-emerald-500"
            />
          </div>
        </Panel>
      </section>

      {/* ── 4. Goals + Investments + Risk ──────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* Goals */}
        <Panel
          title="Mục tiêu tài chính"
          subtitle="Tiến độ và thời gian dự kiến"
        >
          <div className="mt-5 space-y-4">
            {goalRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Chưa có mục tiêu nào.
              </p>
            ) : (
              goalRows.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-slate-900 text-sm">
                      {g.name}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${g.percent >= 100 ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
                    >
                      {g.percent}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatVND(g.currentAmount)} / {formatVND(g.targetAmount)}
                  </p>
                  <div className="mt-3 h-2.5 rounded-full bg-white">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                      style={{ width: `${g.percent}%` }}
                    />
                  </div>
                  {g.monthsLeft !== null && g.percent < 100 && (
                    <p className="mt-2 text-xs text-slate-400">
                      {g.monthsLeft <= 0
                        ? "Sắp đạt!"
                        : `~${g.monthsLeft} tháng nữa`}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
          {/* Spending breakdown */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-3 text-sm font-black text-slate-700">
              Chi tiêu theo danh mục
            </p>
            <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-center">
              <div className="relative mx-auto h-32 w-32">
                <PieChart width={128} height={128}>
                  <Pie
                    data={spendingPieData}
                    dataKey="value"
                    innerRadius={36}
                    outerRadius={56}
                    paddingAngle={3}
                  >
                    {spendingPieData.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-sm font-black text-rose-500">
                    {Math.round(summary.expense / 1_000_000)}M
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {spendingByCategory.slice(0, 4).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: SPEND_COLORS[i % SPEND_COLORS.length],
                      }}
                    />
                    <span className="flex-1 truncate text-xs text-slate-600">
                      {item.name}
                    </span>
                    <span className="text-xs font-bold text-slate-800">
                      {item.percent}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* Investments */}
        <Panel
          title="Danh mục đầu tư"
          subtitle={`${investments.length} tài sản · ${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}% tổng lợi nhuận`}
        >
          {investments.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              Chưa có tài sản đầu tư.
            </p>
          ) : (
            <>
              <div className="mt-5 flex items-center gap-5">
                <div className="relative shrink-0 h-36 w-36">
                  <PieChart width={144} height={144}>
                    <Pie
                      data={investPieData}
                      dataKey="value"
                      innerRadius={42}
                      outerRadius={64}
                      paddingAngle={3}
                    >
                      {investPieData.map((e) => (
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span
                      className={`text-base font-black ${summary.investmentReturn >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                    >
                      {summary.investmentReturn >= 0 ? "+" : ""}
                      {summary.investmentReturn}%
                    </span>
                    <span className="text-[10px] text-slate-500">ROI</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-500">Hiệu suất</p>
                  <p
                    className={`text-xl font-black ${summary.investmentPL >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                  >
                    {summary.investmentPL >= 0 ? "+" : ""}
                    {formatVND(summary.investmentPL)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Vốn: {formatVND(summary.investedAmount)}
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {investmentRows.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="shrink-0 rounded-xl px-2 py-0.5 text-[10px] font-black text-white"
                        style={{
                          background: INV_TYPE_COLORS[inv.type] ?? "#6366f1",
                        }}
                      >
                        {INV_TYPE_LABELS[inv.type] ?? inv.type}
                      </span>
                      <span className="flex-1 truncate text-sm font-bold text-slate-800">
                        {inv.name}
                      </span>
                      <span
                        className={`text-sm font-black ${inv.plPct >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                      >
                        {inv.plPct >= 0 ? "+" : ""}
                        {inv.plPct}%
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-slate-400">
                      <span>Hiện tại: {formatVND(inv.currentValue)}</span>
                      <span>Vốn: {formatVND(inv.investedAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* Risk Analysis */}
        <Panel
          title="Phân tích rủi ro"
          subtitle="Đánh giá 3 chiều: Nợ · Tiết kiệm · Mục tiêu"
        >
          <div className="mt-5 flex items-center gap-5">
            <div
              className={`flex size-28 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${riskBg} p-2 shadow-lg`}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                <span className={`text-3xl font-black ${riskColor}`}>
                  {riskScore}
                </span>
                <span className="text-[10px] text-slate-500">rủi ro</span>
              </div>
            </div>
            <div>
              <p className={`text-xl font-black ${riskColor}`}>{riskLevel}</p>
              <p className="mt-1 text-sm text-slate-500">
                {riskScore <= 25
                  ? "Tài chính rất lành mạnh"
                  : riskScore <= 50
                    ? "Có thể cải thiện"
                    : riskScore <= 75
                      ? "Cần chú ý sớm"
                      : "Cần hành động ngay"}
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <RiskDimension
              label="Rủi ro nợ"
              score={Math.min(summary.debtRatio, 100)}
              description={`Tỷ lệ nợ: ${summary.debtRatio}%`}
            />
            <RiskDimension
              label="Rủi ro tiết kiệm"
              score={Math.max(0, 40 - summary.savingRate) * 2.5}
              description={`Tiết kiệm: ${summary.savingRate}%`}
            />
            <RiskDimension
              label="Rủi ro mục tiêu"
              score={Math.max(0, 80 - summary.goalScore)}
              description={`Tiến độ: ${summary.goalScore}%`}
            />
          </div>
          {debts.length > 0 && (
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="mb-3 text-sm font-black text-slate-700">
                Chi tiết khoản nợ
              </p>
              <div className="space-y-3">
                {debts.map((d) => {
                  const paidPct = Math.round(
                    ((d.totalAmount - d.remainingAmount) / d.totalAmount) * 100,
                  );
                  return (
                    <div
                      key={d.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-bold text-slate-800 truncate">
                          {d.name}
                        </span>
                        <span className="shrink-0 font-black text-rose-500">
                          {formatVND(d.remainingAmount)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Đã trả {paidPct}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </section>

      {/* ── 5. AI Action Center + Recent Transactions ───────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
              <Bot size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">
                AI Action Center
              </h3>
              <p className="text-sm text-slate-500">
                Hành động ưu tiên từ phân tích dữ liệu của bạn
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-4">
            {aiActions.map((action, i) => (
              <ActionCard key={i} rank={i + 1} {...action} />
            ))}
            {aiActions.length === 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-center">
                <p className="text-2xl">🎉</p>
                <p className="mt-2 font-black text-emerald-700">
                  Tình hình tài chính rất tốt!
                </p>
                <p className="mt-1 text-sm text-emerald-600">
                  Không có điểm cảnh báo nào.
                </p>
              </div>
            )}
          </div>
        </div>

        <Panel title="Giao dịch gần đây" subtitle="5 khoản thu chi mới nhất">
          <div className="mt-4 divide-y divide-slate-100">
            {recentTxns.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex shrink-0 size-9 items-center justify-center rounded-xl ${t.type === "income" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}
                  >
                    {t.type === "income" ? (
                      <ArrowUpRight size={16} />
                    ) : (
                      <ArrowDownRight size={16} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {t.note}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {t.categoryName} · {t.walletName}
                    </p>
                  </div>
                </div>
                <p
                  className={`ml-3 shrink-0 text-sm font-black ${t.type === "income" ? "text-emerald-600" : "text-rose-500"}`}
                >
                  {t.type === "income" ? "+" : "−"}
                  {formatVND(t.amount)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
  valueClass,
  iconClass,
  barClass,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ElementType;
  valueClass: string;
  iconClass: string;
  barClass: string;
}) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${iconClass} text-white shadow-lg`}
        >
          <Icon size={20} />
        </div>
      </div>
      <p className={`mt-5 text-2xl font-black ${valueClass}`}>{value}</p>
      <div className="mt-4 flex h-8 items-end gap-1">
        {SPARK.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-lg bg-gradient-to-t ${barClass}`}
            style={{ height: `${h}%` }}
          />
        ))}
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
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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
          className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 transition-all"
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
  color,
}: {
  label: string;
  actual: number;
  target: number;
  color: string;
}) {
  const over = actual > target;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span
          className={`font-bold ${over ? "text-rose-500" : "text-emerald-600"}`}
        >
          {actual}%{over ? ` (+${actual - target}%)` : ""}
        </span>
      </div>
      <div className="flex h-2.5 rounded-full bg-white overflow-hidden">
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
          className={`h-2.5 rounded-full bg-gradient-to-r ${barColor} transition-all`}
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
}: {
  rank: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "danger" | "warning" | "good";
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
        </div>
      </div>
    </div>
  );
}
