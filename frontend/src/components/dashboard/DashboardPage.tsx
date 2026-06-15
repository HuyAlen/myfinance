"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/src/services/finance/financeStorage";

import {
  buildCategorySpendingData,
  buildMonthlyCashFlowData,
  buildMonthlyNetWorthData,
  calculateDashboardSummary,
  calculateFinancialStructureSummary,
  calculateFinancialStabilitySummary,
  calculateFinancialIndependenceSummary,
  calculateAiCfoInsightSummary,
  calculateRule503020,
  formatVND,
  generateDashboardActions,
  getFinancialGrade,
} from "@/src/services/finance/financeCalculations";

import type {
  CategorySpending,
  DashboardActionIcon,
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

function formatOneDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(Math.round(value * 10) / 10);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(Math.round(value), 100));
}

export default function DashboardPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isHealthDrawerOpen, setIsHealthDrawerOpen] = useState(false);
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const reloadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [reloadData]);

  useRealtimeTable(
    ["wallets", "transactions", "investments", "debts", "goals", "budgets"],
    reloadData,
  );

  // ── Core summary ──────────────────────────────────────────────────────────
  const summary = useMemo(
    () =>
      calculateDashboardSummary({
        wallets,
        investments,
        debts,
        transactions,
        categories,
        goals,
      }),
    [wallets, investments, debts, transactions, categories, goals],
  );

  // ── Net-worth trend (real monthly reconstruction) ─────────────────────────
  const netWorthTrend = useMemo(
    () =>
      buildMonthlyNetWorthData({
        wallets,
        investments,
        debts,
        transactions,
        categories,
        months: 6,
      }),
    [wallets, investments, debts, transactions, categories],
  );

  // ── Cash-flow trend (real monthly transaction data) ───────────────────────
  const cashFlowTrend = useMemo(
    () => buildMonthlyCashFlowData(transactions, categories, 6),
    [transactions, categories],
  );

  // ── Asset pie ─────────────────────────────────────────────────────────────
  const assetPieData = useMemo(() => {
    const items = wallets.map((w, i) => ({
      name: w.name,
      value: w.balance,
      color: ASSET_COLORS[i % ASSET_COLORS.length],
    }));
    if (summary.investmentAssets > 0)
      items.push({
        name: "Đầu tư",
        value: summary.investmentAssets,
        color: "#10b981",
      });
    return items;
  }, [wallets, summary.investmentAssets]);

  // ── Spending ──────────────────────────────────────────────────────────────
  const spendingByCategory = useMemo(
    () => buildCategorySpendingData(transactions, categories),
    [transactions, categories],
  );
  const spendingPieData = useMemo(
    () =>
      spendingByCategory.map((item, i) => ({
        id: item.id,
        name: item.name,
        value: item.value, // VND amount drives slice size
        percent: item.percent,
        color: SPEND_COLORS[i % SPEND_COLORS.length],
      })),
    [spendingByCategory],
  );

  // ── 50/30/20 ─────────────────────────────────────────────────────────────
  const allocation5030 = useMemo(() => {
    const allocation = calculateRule503020({
      transactions,
      categories,
      month: currentMonth,
      income: summary.income,
    });

    return {
      needs: allocation.needsPercentOfIncome,
      wants: allocation.wantsPercentOfIncome,
      savings: allocation.savingsPercentOfIncome,
      needsAmount: allocation.needsAmount,
      wantsAmount: allocation.wantsAmount,
      savingsAmount: allocation.savingsAmount,
      unclassifiedAmount: allocation.unclassifiedAmount,
    };
  }, [transactions, categories, currentMonth, summary.income]);

  const cashFlowData = useMemo(
    () =>
      cashFlowTrend.map((item) => ({
        ...item,
        dongTienRong: item.thu - item.chi,
      })),
    [cashFlowTrend],
  );

  const cashFlowMonthsWithData = useMemo(
    () => cashFlowTrend.filter((item) => item.thu > 0 || item.chi > 0).length,
    [cashFlowTrend],
  );

  const cashFlowSubtitle =
    cashFlowMonthsWithData <= 1
      ? "Dữ liệu tháng hiện tại; chưa đủ lịch sử 6 tháng"
      : "Xu hướng 6 tháng và phân bổ thu nhập";

  const netCashFlow = summary.income - summary.expense;

  const netWorthForecast = useMemo(() => {
    const monthlyGrowth = Number.isFinite(summary.saving) ? summary.saving : 0;
    const project = (months: number) =>
      summary.netWorth + monthlyGrowth * months;

    return [
      { label: "3 tháng", value: project(3) },
      { label: "6 tháng", value: project(6) },
      { label: "12 tháng", value: project(12) },
    ];
  }, [summary.netWorth, summary.saving]);

  const emergencyMonthsExact = useMemo(() => {
    if (summary.monthlyExpense <= 0) return 0;
    return summary.liquidBalance / summary.monthlyExpense;
  }, [summary.liquidBalance, summary.monthlyExpense]);

  // ── V11.1 Financial Structure ───────────────────────────────────────────
  const financialStructure = useMemo(
    () =>
      calculateFinancialStructureSummary({
        transactions,
        categories,
      }),
    [transactions, categories],
  );

  const financialStructureCards = useMemo(
    () => [
      {
        title: "Chi phí cố định",
        value: `${financialStructure.fixedCostRatio}%`,
        amount: `${formatVND(financialStructure.fixedCost)} / ${formatVND(financialStructure.income)}`,
        note:
          financialStructure.fixedCostRatio < 40
            ? "Tốt · dưới 40% thu nhập"
            : financialStructure.fixedCostRatio <= 60
              ? "Cần theo dõi · 40–60% thu nhập"
              : "Rủi ro · trên 60% thu nhập",
        tone:
          financialStructure.fixedCostRatio < 40
            ? "good"
            : financialStructure.fixedCostRatio <= 60
              ? "warning"
              : "danger",
        bar: Math.min(financialStructure.fixedCostRatio, 100),
      },
      {
        title: "Chi phí biến đổi",
        value: `${financialStructure.variableCostRatio}%`,
        amount: `${formatVND(financialStructure.variableCost)} / ${formatVND(financialStructure.income)}`,
        note:
          financialStructure.variableCostRatio <= 30
            ? "Gọn nhẹ · dễ kiểm soát"
            : financialStructure.variableCostRatio <= 50
              ? "Trung bình · nên theo dõi"
              : "Cao · cần tối ưu",
        tone:
          financialStructure.variableCostRatio <= 30
            ? "good"
            : financialStructure.variableCostRatio <= 50
              ? "warning"
              : "danger",
        bar: Math.min(financialStructure.variableCostRatio, 100),
      },
      {
        title: "Tỷ lệ tiết kiệm",
        value: `${financialStructure.planningSavingRate}%`,
        amount: `${formatVND(financialStructure.savingAmount)} / ${formatVND(financialStructure.income)}`,
        note:
          financialStructure.planningSavingRate >= 20
            ? "Xuất sắc · trên 20% thu nhập"
            : financialStructure.planningSavingRate >= 10
              ? "Tốt · 10–20% thu nhập"
              : "Thấp · nên tăng dần",
        tone:
          financialStructure.planningSavingRate >= 20
            ? "good"
            : financialStructure.planningSavingRate >= 10
              ? "warning"
              : "danger",
        bar: Math.min(financialStructure.planningSavingRate, 100),
      },
      {
        title: "Tỷ lệ đầu tư",
        value: `${financialStructure.investmentRate}%`,
        amount: `${formatVND(financialStructure.investmentAmount)} / ${formatVND(financialStructure.income)}`,
        note:
          financialStructure.investmentRate >= 15
            ? "Tích cực xây tài sản"
            : financialStructure.investmentRate >= 5
              ? "Đang bắt đầu"
              : "Cần tăng đầu tư",
        tone:
          financialStructure.investmentRate >= 15
            ? "good"
            : financialStructure.investmentRate >= 5
              ? "warning"
              : "danger",
        bar: Math.min(financialStructure.investmentRate, 100),
      },
    ],
    [financialStructure],
  );

  const financialStability = useMemo(
    () =>
      calculateFinancialStabilitySummary({
        financialStructure,
        emergencyMonths: emergencyMonthsExact,
      }),
    [financialStructure, emergencyMonthsExact],
  );

  const financialIndependence = useMemo(
    () =>
      calculateFinancialIndependenceSummary({
        investments,
        monthlyExpense: summary.monthlyExpense,
        monthlyInvestment: financialStructure.investmentAmount,
      }),
    [investments, summary.monthlyExpense, financialStructure.investmentAmount],
  );

  const aiCfoInsight = useMemo(
    () =>
      calculateAiCfoInsightSummary({
        financialStructure,
        financialStability,
        financialIndependence,
        emergencyMonths: emergencyMonthsExact,
      }),
    [
      financialStructure,
      financialStability,
      financialIndependence,
      emergencyMonthsExact,
    ],
  );

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
  const investPieData = useMemo(
    () =>
      investments.map((inv, i) => ({
        name: inv.name,
        value: inv.currentValue,
        color:
          INV_TYPE_COLORS[inv.type] ?? ASSET_COLORS[i % ASSET_COLORS.length],
      })),
    [investments],
  );

  // ── Goal rows with estimate ───────────────────────────────────────────────
  const goalRows = useMemo(
    () =>
      goals.map((g) => {
        const percent = Math.min(
          g.targetAmount > 0
            ? Math.round((g.currentAmount / g.targetAmount) * 100)
            : 0,
          100,
        );
        const remaining = Math.max(g.targetAmount - g.currentAmount, 0);
        return {
          ...g,
          percent,
          remaining,
          monthsLeft:
            remaining > 0 && summary.saving > 0
              ? Math.max(0, Math.ceil(remaining / summary.saving))
              : null,
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

  // ── Financial health score v2 ─────────────────────────────────────────────
  const healthMetrics = useMemo(() => {
    const savingScore = Math.max(
      0,
      Math.min(Math.round(summary.savingRate * 2.5), 100),
    );
    const debtSafetyScore = Math.max(
      0,
      Math.min(100 - Math.round(summary.debtRatio), 100),
    );
    const goalScore = Math.max(0, Math.min(Math.round(summary.goalScore), 100));
    const emergencyScore = Math.max(
      0,
      Math.min(Math.round((emergencyMonthsExact / 6) * 100), 100),
    );

    const totalScore = Math.round(
      savingScore * 0.3 +
        debtSafetyScore * 0.3 +
        emergencyScore * 0.25 +
        goalScore * 0.15,
    );

    return {
      savingScore,
      debtSafetyScore,
      goalScore,
      emergencyScore,
      totalScore,
    };
  }, [
    summary.savingRate,
    summary.debtRatio,
    summary.goalScore,
    emergencyMonthsExact,
  ]);

  const healthScore = healthMetrics.totalScore;
  const financialGrade = getFinancialGrade(healthScore);
  const healthBreakdown = useMemo(
    () => [
      {
        label: "Tiết kiệm",
        score: healthMetrics.savingScore,
        weight: 30,
        points: Math.round(healthMetrics.savingScore * 0.3),
        note: `Tỷ lệ tiết kiệm hiện tại ${summary.savingRate}%`,
      },
      {
        label: "An toàn nợ",
        score: healthMetrics.debtSafetyScore,
        weight: 30,
        points: Math.round(healthMetrics.debtSafetyScore * 0.3),
        note:
          summary.debtRatio <= 0
            ? "Không có nợ, rủi ro thấp"
            : `Tỷ lệ nợ ${summary.debtRatio}%`,
      },
      {
        label: "Quỹ khẩn cấp",
        score: healthMetrics.emergencyScore,
        weight: 25,
        points: Math.round(healthMetrics.emergencyScore * 0.25),
        note: `${formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu`,
      },
      {
        label: "Mục tiêu",
        score: healthMetrics.goalScore,
        weight: 15,
        points: Math.round(healthMetrics.goalScore * 0.15),
        note: `${goals.length} mục tiêu · tiến độ trung bình ${summary.goalScore}%`,
      },
    ],
    [
      healthMetrics,
      summary.savingRate,
      summary.debtRatio,
      summary.goalScore,
      emergencyMonthsExact,
      goals.length,
    ],
  );

  const healthStrengths = useMemo(() => {
    const items: string[] = [];
    if (healthMetrics.debtSafetyScore >= 90)
      items.push("Không có nợ hoặc tỷ lệ nợ rất an toàn.");
    if (healthMetrics.savingScore >= 70)
      items.push(`Tỷ lệ tiết kiệm tốt (${summary.savingRate}%).`);
    if (healthMetrics.emergencyScore >= 50)
      items.push(
        `Quỹ khẩn cấp đạt ${formatOneDecimal(emergencyMonthsExact)} tháng.`,
      );
    if (healthMetrics.goalScore >= 50)
      items.push("Mục tiêu tài chính có tiến độ tốt.");
    return items.length > 0
      ? items
      : ["Bạn đã có dữ liệu tài chính để bắt đầu tối ưu."];
  }, [healthMetrics, summary.savingRate, emergencyMonthsExact]);

  const healthImprovements = useMemo(() => {
    const items: string[] = [];
    if (emergencyMonthsExact < 3)
      items.push(`Tăng quỹ khẩn cấp lên tối thiểu 3 tháng chi tiêu.`);
    if (healthMetrics.goalScore < 30 && goals.length > 0)
      items.push(
        `Đẩy nhanh tiến độ mục tiêu tài chính, hiện mới đạt ${summary.goalScore}%.`,
      );
    if (summary.savingRate < 20)
      items.push("Nâng tỷ lệ tiết kiệm lên ít nhất 20% thu nhập.");
    if (summary.debtRatio > 40)
      items.push("Giảm tỷ lệ nợ xuống dưới 40% tổng tài sản.");
    return items.length > 0
      ? items
      : ["Duy trì nhịp hiện tại và cân nhắc tăng đầu tư dài hạn."];
  }, [
    healthMetrics.goalScore,
    emergencyMonthsExact,
    goals.length,
    summary.goalScore,
    summary.savingRate,
    summary.debtRatio,
  ]);

  const riskScore = Math.max(0, 100 - healthScore);

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
  const healthLabel =
    healthScore >= 90
      ? "Xuất sắc"
      : healthScore >= 75
        ? "Tốt"
        : healthScore >= 60
          ? "Khá"
          : healthScore >= 40
            ? "Trung bình"
            : "Cần cải thiện";

  // ── AI actions ────────────────────────────────────────────────────────────
  const aiActions = useMemo(
    () =>
      generateDashboardActions({
        transactions,
        wallets,
        budgets,
        goals,
        debts,
        investments,
        categories,
        summary,
      }),
    [
      transactions,
      wallets,
      budgets,
      goals,
      debts,
      investments,
      categories,
      summary,
    ],
  );
  const actionIcons: Record<DashboardActionIcon, React.ReactNode> = {
    alert: <AlertTriangle size={18} />,
    savings: <PiggyBank size={18} />,
    shield: <ShieldCheck size={18} />,
    debt: <CreditCard size={18} />,
    bank: <Landmark size={18} />,
    emergency: <Zap size={18} />,
    investment: <TrendingDown size={18} />,
    goal: <Target size={18} />,
    budget: <AlertTriangle size={18} />,
  };

  const v3AdvisorActions = useMemo(() => {
    const actions: {
      icon: React.ReactNode;
      title: string;
      body: string;
      tone: "danger" | "warning" | "good";
      ctaLabel?: string;
      ctaRoute?: string;
    }[] = [];

    const emergencyTarget = (summary.monthlyExpense || summary.expense) * 3;
    const emergencyGap = Math.max(emergencyTarget - summary.liquidBalance, 0);

    if (emergencyMonthsExact < 3) {
      actions.push({
        icon: <Zap size={18} />,
        title: "Ưu tiên tạo quỹ khẩn cấp",
        body: `Hiện tại bạn có khoảng ${formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu. Mục tiêu tối thiểu là 3 tháng, cần bổ sung khoảng ${formatVND(emergencyGap)}.`,
        tone: emergencyMonthsExact < 1 ? "danger" : "warning",
        ctaLabel: "Tạo mục tiêu",
        ctaRoute: "/goals",
      });
    }

    if (goals.length > 0 && healthMetrics.goalScore < 30) {
      actions.push({
        icon: <Target size={18} />,
        title: "Mục tiêu tài chính đang chậm",
        body: `${goals.length} mục tiêu hiện đạt trung bình ${summary.goalScore}%. Hãy chọn 1 mục tiêu ưu tiên và đặt khoản góp cố định hàng tháng.`,
        tone: "warning",
        ctaLabel: "Xem mục tiêu",
        ctaRoute: "/goals",
      });
    }

    if (summary.savingRate >= 30) {
      actions.push({
        icon: <PiggyBank size={18} />,
        title: "Tỷ lệ tiết kiệm rất tốt",
        body: `Bạn đang tiết kiệm ${summary.savingRate}% thu nhập, cao hơn mốc 20%. Có thể phân bổ phần dư vào quỹ khẩn cấp hoặc đầu tư dài hạn.`,
        tone: "good",
        ctaLabel: "Phân bổ mục tiêu",
        ctaRoute: "/goals",
      });
    }

    if (summary.debtRatio <= 0) {
      actions.push({
        icon: <ShieldCheck size={18} />,
        title: "Không có nợ",
        body: "Đây là điểm mạnh lớn của hồ sơ tài chính. Hãy tận dụng dòng tiền dương để tăng tài sản thanh khoản và mục tiêu dài hạn.",
        tone: "good",
        ctaLabel: "Xem báo cáo",
        ctaRoute: "/reports",
      });
    }

    return actions.slice(0, 4);
  }, [
    emergencyMonthsExact,
    goals.length,
    healthMetrics.goalScore,
    summary.monthlyExpense,
    summary.expense,
    summary.liquidBalance,
    summary.goalScore,
    summary.savingRate,
    summary.debtRatio,
  ]);

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
    <div className="space-y-5 overflow-x-hidden pb-24 md:space-y-6 md:pb-0">
      {/* ── 1. Executive Strip ─────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="bg-linear-to-br from-blue-50 via-white to-sky-50 p-5 sm:p-8">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Personal CFO Dashboard
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Tài sản ròng
              </h1>
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <p className="text-3xl font-black tracking-tight text-blue-600 sm:text-5xl">
                {formatVND(summary.netWorth)}
              </p>
              <span className="mb-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-600 ring-1 ring-emerald-100">
                Tài sản − Nợ
              </span>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            <div className="mt-6 h-40">
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
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    fontSize={11}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                      padding: "8px 12px",
                      fontSize: "12px",
                    }}
                    labelStyle={{ fontWeight: 700, color: "#475569" }}
                    itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                    formatter={(v) => [
                      v == null ? "Không có dữ liệu" : formatVND(Number(v)),
                      "Tài sản ròng",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    connectNulls={false}
                    stroke="#2563eb"
                    strokeWidth={3}
                    fill="url(#nwGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-slate-200 bg-linear-to-br from-emerald-50 via-sky-50 to-blue-50 p-5 sm:p-8 xl:border-l xl:border-t-0">
            <div>
              <p className="text-sm font-bold text-slate-600">
                Sức khoẻ tài chính
              </p>
              <div className="mt-5 flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => setIsHealthDrawerOpen(true)}
                  className={`flex size-28 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${financialGrade.gradient} p-2 shadow-lg transition hover:scale-[1.03] focus:outline-none focus:ring-4 ${financialGrade.ring}`}
                  title="Xem giải thích điểm sức khỏe tài chính"
                >
                  <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                    <span
                      className={`text-3xl font-black ${financialGrade.color}`}
                    >
                      {healthScore}
                    </span>
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                </button>
                <div>
                  <div
                    className={`mb-2 inline-flex items-center rounded-full border px-3 py-1 text-xs font-black ${financialGrade.bg} ${financialGrade.border} ${financialGrade.color}`}
                  >
                    Grade {financialGrade.grade}
                  </div>
                  <p className={`text-xl font-black ${financialGrade.color}`}>
                    {financialGrade.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {healthLabel} · Rủi ro: {riskLevel}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsHealthDrawerOpen(true)}
                    className="mt-3 text-xs font-black text-blue-600 hover:text-blue-700"
                  >
                    Xem giải thích điểm →
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <ScoreLine label="Tiết kiệm" value={healthMetrics.savingScore} />
              <ScoreLine
                label="An toàn nợ"
                value={healthMetrics.debtSafetyScore}
              />
              <ScoreLine label="Mục tiêu" value={healthMetrics.goalScore} />
              <ScoreLine
                label="Quỹ khẩn cấp"
                value={healthMetrics.emergencyScore}
              />
            </div>
            <div className="mt-6 rounded-2xl bg-white/70 p-4 text-sm text-slate-600 backdrop-blur">
              <span className="font-bold text-slate-900">Quỹ khẩn cấp: </span>
              {formatOneDecimal(emergencyMonthsExact)} tháng chi tiêu
              {emergencyMonthsExact < 3 ? (
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
            <div key={item.title} className="shrink-0 w-50 snap-start">
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

      {/* ── 3. Financial Structure V11.1 ───────────────────────────────── */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Financial Structure
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Cấu trúc tài chính
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Phân tách dòng tiền theo chi phí cố định, biến đổi, tiết kiệm và
              đầu tư.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-bold text-slate-500">Dòng tiền ròng</p>
            <p
              className={`text-xl font-black ${
                financialStructure.cashFlow >= 0
                  ? "text-emerald-600"
                  : "text-rose-500"
              }`}
            >
              {financialStructure.cashFlow >= 0 ? "+" : ""}
              {formatVND(financialStructure.cashFlow)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {financialStructureCards.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-500">
                    {item.title}
                  </p>
                  <p
                    className={`mt-2 text-3xl font-black ${
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
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                    item.tone === "good"
                      ? "bg-emerald-50 text-emerald-600"
                      : item.tone === "warning"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {item.tone === "good"
                    ? "Tốt"
                    : item.tone === "warning"
                      ? "Theo dõi"
                      : "Rủi ro"}
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {item.amount}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full ${
                    item.tone === "good"
                      ? "bg-emerald-500"
                      : item.tone === "warning"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(4, Math.min(item.bar, 100))}%` }}
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-600">
                {item.note}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div
            className={`rounded-3xl border p-5 ${
              financialStability.tone === "good"
                ? "border-emerald-100 bg-emerald-50/70"
                : financialStability.tone === "warning"
                  ? "border-amber-100 bg-amber-50/70"
                  : "border-rose-100 bg-rose-50/70"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
              Financial Stability
            </p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p
                  className={`text-5xl font-black ${
                    financialStability.tone === "good"
                      ? "text-emerald-600"
                      : financialStability.tone === "warning"
                        ? "text-amber-600"
                        : "text-rose-600"
                  }`}
                >
                  {financialStability.score}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-500">/ 100</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-slate-900">
                  {financialStability.label}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Dựa trên chi phí cố định, tiết kiệm, đầu tư, dòng tiền và quỹ
                  khẩn cấp.
                </p>
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
              <div
                className={`h-full rounded-full ${
                  financialStability.tone === "good"
                    ? "bg-emerald-500"
                    : financialStability.tone === "warning"
                      ? "bg-amber-400"
                      : "bg-rose-500"
                }`}
                style={{ width: `${Math.max(6, financialStability.score)}%` }}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {financialStability.breakdown.map((item) => (
                <div key={item.key} className="rounded-2xl bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item.detail}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-black ${
                        item.status === "good"
                          ? "bg-emerald-50 text-emerald-600"
                          : item.status === "warning"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      +{item.weightedScore}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full ${
                        item.status === "good"
                          ? "bg-emerald-500"
                          : item.status === "warning"
                            ? "bg-amber-400"
                            : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.max(4, item.score)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`mt-5 rounded-3xl border p-5 ${
            financialIndependence.tone === "good"
              ? "border-emerald-100 bg-emerald-50/70"
              : financialIndependence.tone === "warning"
                ? "border-amber-100 bg-amber-50/70"
                : "border-rose-100 bg-rose-50/70"
          }`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Financial Independence Tracker
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                Tự do tài chính
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Dựa trên quy tắc 4%: mục tiêu tài sản đầu tư ≈ 25 lần chi tiêu
                năm.
              </p>
              <p className="mt-3 text-sm font-bold text-slate-700">
                {financialIndependence.insight}
              </p>
            </div>

            <div className="rounded-3xl bg-white/80 p-5 text-right shadow-sm lg:min-w-65">
              <p
                className={`text-5xl font-black ${
                  financialIndependence.tone === "good"
                    ? "text-emerald-600"
                    : financialIndependence.tone === "warning"
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              >
                {financialIndependence.progressPercent}%
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {financialIndependence.label}
              </p>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    financialIndependence.tone === "good"
                      ? "bg-emerald-500"
                      : financialIndependence.tone === "warning"
                        ? "bg-amber-400"
                        : "bg-rose-500"
                  }`}
                  style={{
                    width: `${Math.max(4, financialIndependence.progressPercent)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MiniStat
              label="Tài sản đầu tư"
              value={formatVND(financialIndependence.investmentAssets)}
              color="text-blue-600"
            />
            <MiniStat
              label="Mục tiêu FI"
              value={formatVND(financialIndependence.targetAssets)}
              color="text-slate-900"
            />
            <MiniStat
              label="Còn thiếu"
              value={formatVND(financialIndependence.remainingAmount)}
              color="text-amber-600"
            />
            <MiniStat
              label="Thời gian ước tính"
              value={
                financialIndependence.yearsToFI === null
                  ? "Chưa đủ dữ liệu"
                  : financialIndependence.yearsToFI === 0
                    ? "Đã đạt"
                    : `${financialIndependence.yearsToFI} năm`
              }
              color="text-emerald-600"
            />
          </div>
        </div>

        <div
          className={`mt-5 rounded-3xl border p-5 ${
            aiCfoInsight.tone === "good"
              ? "border-emerald-100 bg-emerald-50/70"
              : aiCfoInsight.tone === "warning"
                ? "border-amber-100 bg-amber-50/70"
                : "border-rose-100 bg-rose-50/70"
          }`}
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                AI CFO Insight
              </p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">
                {aiCfoInsight.headline}
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {aiCfoInsight.summary}
              </p>
              {aiCfoInsight.warning && (
                <div className="mt-4 rounded-2xl border border-rose-100 bg-white/70 p-3 text-sm font-bold text-rose-600">
                  ⚠ {aiCfoInsight.warning}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white/80 p-5 text-right shadow-sm lg:min-w-55">
              <p
                className={`text-5xl font-black ${
                  aiCfoInsight.tone === "good"
                    ? "text-emerald-600"
                    : aiCfoInsight.tone === "warning"
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}
              >
                {aiCfoInsight.score}
              </p>
              <p className="mt-1 text-sm font-black text-slate-900">
                {aiCfoInsight.label}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                CFO Score
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-slate-900">
                Ưu tiên hành động
              </p>
              <div className="mt-3 space-y-3">
                {aiCfoInsight.priorityActions.map((action, index) => (
                  <div
                    key={`${action.title}-${index}`}
                    className="rounded-2xl bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                          Ưu tiên #{index + 1}
                        </p>
                        <p className="mt-1 font-black text-slate-900">
                          {action.title}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-black ${
                          action.tone === "good"
                            ? "bg-emerald-50 text-emerald-600"
                            : action.tone === "warning"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {action.tone === "good"
                          ? "Tốt"
                          : action.tone === "warning"
                            ? "Theo dõi"
                            : "Cần xử lý"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      {action.body}
                    </p>
                    {action.ctaLabel && action.ctaRoute && (
                      <button
                        type="button"
                        onClick={() => router.push(action.ctaRoute!)}
                        className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700"
                      >
                        {action.ctaLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
                  <Zap size={18} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">
                    FI Acceleration
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    Mô phỏng tăng tốc tự do tài chính
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm font-bold leading-6 text-slate-700">
                {aiCfoInsight.accelerationInsight}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MiniStat
                  label="Stability"
                  value={`${financialStability.score}/100`}
                  color="text-emerald-600"
                />
                <MiniStat
                  label="FI Progress"
                  value={`${financialIndependence.progressPercent}%`}
                  color="text-blue-600"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Wealth Growth + Cash Flow ───────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Tăng trưởng tài sản"
          subtitle="Xu hướng tài sản ròng và phân bổ 6 tháng"
        >
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <div className="mt-5 h-55">
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
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: 700, color: "#475569" }}
                  itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                  formatter={(v) => [
                    v == null ? "Không có dữ liệu" : formatVND(Number(v)),
                    "Tài sản ròng",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  connectNulls={false}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#wealthGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-blue-700">
                  Dự báo tài sản ròng
                </p>
                <p className="text-xs text-blue-600/80">
                  Ước tính nếu giữ dòng tiền hiện tại
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${summary.saving >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
              >
                {summary.saving >= 0 ? "+" : ""}
                {formatVND(summary.saving)}/tháng
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {netWorthForecast.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl bg-white p-3 ring-1 ring-blue-100"
                >
                  <p className="text-[11px] font-bold text-slate-500">
                    {item.label}
                  </p>
                  <p
                    className={`mt-1 text-sm font-black ${item.value >= summary.netWorth ? "text-emerald-600" : "text-rose-500"}`}
                  >
                    {formatVND(item.value)}
                  </p>
                </div>
              ))}
            </div>
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
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: 700, color: "#475569" }}
                  itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                  formatter={(v, name) => [
                    formatVND(Number(v ?? 0)),
                    String(name),
                  ]}
                />
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
                    {summary.totalAssets > 0
                      ? Math.round((item.value / summary.totalAssets) * 100)
                      : 0}
                    %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Dòng tiền & Chi tiêu" subtitle={cashFlowSubtitle}>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MiniStat
              label="Thu nhập"
              value={formatVND(summary.income)}
              color="text-emerald-600"
            />
            <MiniStat
              label="Chi tiêu thật"
              value={formatVND(summary.expense)}
              color="text-rose-500"
            />
            <MiniStat
              label="Dòng tiền ròng"
              value={`${netCashFlow >= 0 ? "+" : ""}${formatVND(netCashFlow)}`}
              color={netCashFlow >= 0 ? "text-emerald-600" : "text-rose-500"}
            />
            <MiniStat
              label="Tỷ lệ tích lũy"
              value={`${summary.savingRate}%`}
              color={
                summary.savingRate >= 20 ? "text-emerald-600" : "text-rose-500"
              }
            />
          </div>
          <div className="mt-5 h-55">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <BarChart
                data={cashFlowData}
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
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={11}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                    padding: "8px 12px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ fontWeight: 700, color: "#475569" }}
                  itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                  formatter={(v, name) => [
                    formatVND(Number(v ?? 0)),
                    String(name),
                  ]}
                />
                <Bar
                  dataKey="thu"
                  name="Thu nhập"
                  fill="#10b981"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="chi"
                  name="Chi tiêu thật"
                  fill="#f43f5e"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="tichLuy"
                  name="Tiết kiệm + Đầu tư"
                  fill="#14b8a6"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="dongTienRong"
                  name="Dòng tiền ròng"
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
              Chi tiêu thật
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-teal-500" />
              Tiết kiệm + Đầu tư
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-600" />
              Dòng tiền ròng
            </span>
          </div>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="mb-3 text-sm font-black text-slate-700">
              Quy tắc 50/30/20
            </p>
            <AllocationRow
              label="Thiết yếu"
              actual={allocation5030.needs}
              target={50}
              amount={allocation5030.needsAmount}
              color="bg-blue-500"
            />
            <AllocationRow
              label="Muốn"
              actual={allocation5030.wants}
              target={30}
              amount={allocation5030.wantsAmount}
              color="bg-violet-500"
            />
            <AllocationRow
              label="Tiết kiệm"
              actual={allocation5030.savings}
              target={20}
              amount={allocation5030.savingsAmount}
              color="bg-emerald-500"
            />
            {allocation5030.unclassifiedAmount > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Có {formatVND(allocation5030.unclassifiedAmount)} chi tiêu chưa
                map rõ danh mục, tạm tính vào nhóm “Muốn”.
              </p>
            )}
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
                      className="h-2.5 rounded-full bg-linear-to-r from-blue-500 to-cyan-400 transition-all duration-500"
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
            <p className="mb-4 text-sm font-black text-slate-700">
              Chi tiêu theo danh mục
            </p>
            {spendingByCategory.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                Chưa có chi tiêu nào.
              </p>
            ) : (
              <div className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
                {/* Donut */}
                <div className="relative mx-auto h-45 w-45 shrink-0 md:mx-0">
                  <PieChart width={180} height={180}>
                    <Pie
                      data={spendingPieData}
                      dataKey="value"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={3}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {spendingPieData.map((e) => (
                        <Cell key={e.id} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CategorySpendingTooltip />} />
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
                    <span className="max-w-22.5 truncate text-xl font-black text-rose-500">
                      {formatCompactVND(summary.expense)}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium text-slate-400">
                      Tổng chi
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="min-w-0 space-y-2">
                  {spendingPieData.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className="grid min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"
                      style={{ gridTemplateColumns: "10px minmax(0,1fr) 44px" }}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ background: item.color }}
                      />
                      <span
                        className="min-w-0 truncate text-xs font-medium text-slate-600"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <span className="text-right text-xs font-bold text-slate-800 tabular-nums">
                        {item.percent}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Investments */}
        <Panel
          title="Danh mục đầu tư"
          subtitle={`${investments.length} tài sản · ${summary.investmentReturn >= 0 ? "+" : ""}${summary.investmentReturn}% tổng lợi nhuận`}
        >
          {investments.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                <Briefcase size={22} />
              </div>
              <p className="mt-3 text-base font-black text-slate-800">
                Bắt đầu danh mục đầu tư
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                Thêm cổ phiếu, vàng, crypto hoặc quỹ ETF để theo dõi lợi nhuận,
                tỷ trọng và rủi ro đầu tư.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-bold text-emerald-700">
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Cổ phiếu
                </span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Vàng
                </span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Crypto
                </span>
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-emerald-100">
                  Quỹ ETF
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/investments")}
                className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
              >
                Thêm tài sản đầu tư
              </button>
            </div>
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
                    <Tooltip
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
                        padding: "8px 12px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ fontWeight: 700, color: "#475569" }}
                      itemStyle={{ color: "#1e293b", fontWeight: 600 }}
                      formatter={(v, name) => [
                        formatVND(Number(v ?? 0)),
                        String(name),
                      ]}
                    />
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
          subtitle="Đánh giá 4 chiều: Nợ · Tiết kiệm · Quỹ khẩn cấp · Mục tiêu"
        >
          <div className="mt-5 flex items-center gap-5">
            <div
              className={`flex size-28 shrink-0 items-center justify-center rounded-full bg-linear-to-br ${riskBg} p-2 shadow-lg`}
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
              score={100 - healthMetrics.debtSafetyScore}
              description={`Tỷ lệ nợ: ${summary.debtRatio}%`}
            />
            <RiskDimension
              label="Rủi ro tiết kiệm"
              score={100 - healthMetrics.savingScore}
              description={`Tiết kiệm: ${summary.savingRate}%`}
            />
            <RiskDimension
              label="Rủi ro quỹ khẩn cấp"
              score={100 - healthMetrics.emergencyScore}
              description={`Dự phòng: ${summary.emergencyMonths} tháng`}
            />
            <RiskDimension
              label="Rủi ro mục tiêu"
              score={100 - healthMetrics.goalScore}
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
                          className="h-2 rounded-full bg-linear-to-r from-emerald-500 to-teal-400"
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
        <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
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
            {v3AdvisorActions.map((action, i) => (
              <ActionCard
                key={`v3-${action.title}-${i}`}
                rank={i + 1}
                icon={action.icon}
                title={action.title}
                body={action.body}
                tone={action.tone}
                ctaLabel={action.ctaLabel}
                ctaRoute={action.ctaRoute}
                onNavigate={router.push}
              />
            ))}
            {aiActions
              .slice(0, Math.max(0, 3 - v3AdvisorActions.length))
              .map((action, i) => (
                <ActionCard
                  key={`${action.title}-${i}`}
                  rank={v3AdvisorActions.length + i + 1}
                  icon={actionIcons[action.icon]}
                  title={action.title}
                  body={action.body}
                  tone={action.tone}
                  ctaLabel={action.ctaLabel}
                  ctaRoute={action.ctaRoute}
                  onNavigate={router.push}
                />
              ))}
            {v3AdvisorActions.length === 0 && aiActions.length === 0 && (
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

      <FinancialHealthDrawer
        open={isHealthDrawerOpen}
        onClose={() => setIsHealthDrawerOpen(false)}
        score={healthScore}
        grade={financialGrade.grade}
        healthLabel={healthLabel}
        riskLevel={riskLevel}
        breakdown={healthBreakdown}
        strengths={healthStrengths}
        improvements={healthImprovements}
      />
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FinancialHealthDrawer({
  open,
  onClose,
  score,
  grade,
  healthLabel,
  riskLevel,
  breakdown,
  strengths,
  improvements,
}: {
  open: boolean;
  onClose: () => void;
  score: number;
  grade: string;
  healthLabel: string;
  riskLevel: string;
  breakdown: {
    label: string;
    score: number;
    weight: number;
    points: number;
    note: string;
  }[];
  strengths: string[];
  improvements: string[];
}) {
  if (!open) return null;

  const totalPoints = breakdown.reduce((sum, item) => sum + item.points, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-500">
              AI Explain Score
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              Giải thích sức khỏe tài chính
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Cách hệ thống chấm điểm hồ sơ tài chính hiện tại của bạn.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-xl font-black text-slate-500 hover:bg-slate-200"
          >
            ×
          </button>
        </div>

        <div className="mt-6 rounded-4xl border border-slate-200 bg-linear-to-br from-blue-50 via-white to-emerald-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">Tổng điểm</p>
              <p className="mt-1 text-5xl font-black text-blue-600">
                {score}
                <span className="text-base text-slate-400">/100</span>
              </p>
            </div>
            <div className="rounded-2xl border border-white bg-white/80 px-5 py-4 text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400">Grade</p>
              <p className="text-3xl font-black text-slate-900">{grade}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {healthLabel} · Rủi ro {riskLevel}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {breakdown.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.note}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-blue-600">
                    +{item.points} điểm
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Trọng số {item.weight}%
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2.5 rounded-full bg-white">
                <div
                  className="h-2.5 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"
                  style={{ width: `${clampScore(item.score)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                <span>Score {clampScore(item.score)}/100</span>
                <span>Đóng góp tối đa {item.weight} điểm</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="font-black text-emerald-700">Điểm mạnh</p>
            <ul className="mt-3 space-y-2 text-sm text-emerald-700">
              {strengths.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="font-black text-amber-700">Cần cải thiện</p>
            <ul className="mt-3 space-y-2 text-sm text-amber-700">
              {improvements.map((item) => (
                <li key={item}>⚠ {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          Tổng điểm hiện tại được tính từ các phần trên:{" "}
          <span className="font-black">{totalPoints}/100</span>. Khi quỹ khẩn
          cấp và mục tiêu tăng lên, điểm sức khỏe tài chính sẽ tự cải thiện.
        </div>
      </aside>
    </div>
  );
}

function formatCompactVND(value: number) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  if (Math.abs(rounded) >= 1_000_000) {
    return `${Math.round(rounded / 1_000_000)}M`;
  }
  if (Math.abs(rounded) >= 1_000) {
    return `${Math.round(rounded / 1_000)}K`;
  }
  return `${rounded}`;
}

function CategorySpendingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: CategorySpending & { color?: string };
    value?: number;
  }>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full"
          style={{ background: item.color }}
        />
        <span className="max-w-45 truncate font-bold text-slate-700">
          {item.name}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="font-black text-slate-900">
          {formatVND(Number(item.value ?? 0))}
        </span>
        <span className="font-bold text-rose-500">{item.percent}%</span>
      </div>
    </div>
  );
}

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
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${iconClass} text-white shadow-lg`}
        >
          <Icon size={20} />
        </div>
      </div>
      <p className={`mt-5 text-2xl font-black ${valueClass}`}>{value}</p>
      <div className="mt-4 flex h-8 items-end gap-1">
        {SPARK.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-lg bg-linear-to-t ${barClass}`}
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
    <div className="rounded-4xl border border-slate-200 bg-white p-6 shadow-sm">
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
          className="h-2 rounded-full bg-linear-to-r from-emerald-400 to-blue-500 transition-all"
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
  amount,
  color,
}: {
  label: string;
  actual: number;
  target: number;
  amount: number;
  color: string;
}) {
  const over = actual > target;
  const diff = actual - target;
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between gap-3 text-xs">
        <span className="font-medium text-slate-600">
          {label}: {actual}% / {target}%
          <span className="ml-1 text-slate-400">({formatVND(amount)})</span>
        </span>
        <span
          className={`shrink-0 font-bold ${over ? "text-rose-500" : "text-emerald-600"}`}
        >
          {over ? `Vượt ${diff}%` : `Còn ${Math.max(target - actual, 0)}%`}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white">
        <div
          className="absolute left-0 top-0 h-full border-l border-slate-400/60"
          style={{ left: `${Math.min(target, 100)}%` }}
        />
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
          className={`h-2.5 rounded-full bg-linear-to-r ${barColor} transition-all`}
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
  ctaLabel,
  ctaRoute,
  onNavigate,
}: {
  rank: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "danger" | "warning" | "good";
  ctaLabel?: string;
  ctaRoute?: string;
  onNavigate?: (href: string) => void;
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
          {ctaLabel && ctaRoute && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate(ctaRoute)}
              className="mt-3 inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-700"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
