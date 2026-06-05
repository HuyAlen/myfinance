"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Brain,
  CheckCircle2,
  Flame,
  Lightbulb,
  PiggyBank,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet as WalletData,
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

import { formatVND } from "@/src/services/finance/financeCalculations";

import {
  runAdvisor,
  type InsightData,
  type InsightIconType,
} from "@/src/services/finance/analytics";

// InsightTone is re-exported from the engine; alias it locally for JSX use.
type InsightTone = InsightData["tone"];

// UI-only: Insight enriches InsightData with a React node icon.
type Insight = InsightData & { icon: React.ReactNode };

// Map engine icon-type tokens → React nodes (kept in UI layer intentionally).
const INSIGHT_ICON_MAP: Record<InsightIconType, React.ReactNode> = {
  "trending-up": <TrendingUp size={20} />,
  "trending-down": <TrendingDown size={20} />,
  "piggy-bank": <PiggyBank size={20} />,
  "shield-check": <ShieldCheck size={20} />,
  "alert-triangle": <AlertTriangle size={20} />,
  lightbulb: <Lightbulb size={20} />,
  target: <Target size={20} />,
  flame: <Flame size={20} />,
  "bar-chart": <BarChart2 size={20} />,
  wallet: <Wallet size={20} />,
};

export default function AIInsightsPage() {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  useEffect(() => {
    async function load() {
      await initFinanceDemoData();
      const [
        wallets,
        categories,
        transactions,
        debts,
        goals,
        investments,
        budgets,
      ] = await Promise.all([
        getWallets(),
        getCategories(),
        getTransactions(),
        getDebts(),
        getGoals(),
        getInvestments(),
        getBudgets(),
      ]);
      setWallets(wallets);
      setCategories(categories);
      setTransactions(transactions);
      setDebts(debts);
      setGoals(goals);
      setInvestments(investments);
      setBudgets(budgets);
    }
    load();
  }, []);

  // ─── Single engine call — all analytics run here, no logic in the UI ────────

  const advisor = useMemo(
    () =>
      runAdvisor({
        wallets,
        categories,
        transactions,
        debts,
        goals,
        investments,
        budgets,
      }),
    [wallets, categories, transactions, debts, goals, investments, budgets],
  );

  // Aliases that keep the JSX references unchanged
  const analysis = advisor;
  const {
    actionItems,
    healthV2,
    riskScore,
    emergencyFund,
    fire,
    smartBudget,
    financialForecast,
    anomalies,
    forecast,
    goalPredictions,
  } = advisor;

  // Map engine InsightData (no React nodes) → UI Insight (with icon)
  const insights: Insight[] = advisor.insights.map((d) => ({
    ...d,
    icon: INSIGHT_ICON_MAP[d.iconType],
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-bold text-blue-600">
              AI Cố vấn tài chính
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Phân tích tài chính cá nhân
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Dựa trên giao dịch, ví tiền, mục tiêu và khoản nợ thực tế.
            </p>
          </div>

          <div className="rounded-3xl bg-white/80 px-5 py-4 shadow-sm">
            <p className="text-xs font-bold text-slate-500">Điểm sức khỏe V2</p>
            <p className="mt-1 text-4xl font-black text-blue-600">
              {healthV2.total}/100
            </p>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {healthV2.grade} — {healthV2.label}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Thu nhập"
          value={formatVND(analysis.income)}
          tone="good"
        />
        <MetricCard
          title="Chi tiêu"
          value={formatVND(analysis.expense)}
          tone="danger"
        />
        <MetricCard
          title="Tiết kiệm"
          value={formatVND(analysis.saving)}
          tone={analysis.saving >= 0 ? "good" : "danger"}
        />
        <MetricCard
          title="Tỷ lệ nợ"
          value={`${analysis.debtRatio}%`}
          tone="info"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
              <Brain size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Nhận xét thông minh
              </h2>
              <p className="text-sm text-slate-500">
                Các điểm đáng chú ý từ dữ liệu tài chính của bạn.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {insights.map((insight) => (
              <InsightCard key={insight.title} insight={insight} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">
              Việc nên làm tiếp theo
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Gợi ý hành động đơn giản, dễ thực hiện.
            </p>

            <div className="mt-6 space-y-3">
              {actionItems.map((item, index) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-3xl bg-slate-50 p-4"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm font-medium leading-6 text-slate-700">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-emerald-50 to-blue-50 p-6 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Tóm tắt nhanh</h2>

            <div className="mt-5 space-y-4">
              <SummaryRow
                label="Tỷ lệ tiết kiệm"
                value={`${analysis.savingRate}%`}
              />
              <SummaryRow label="Tỷ lệ nợ" value={`${analysis.debtRatio}%`} />
              <SummaryRow
                label="Tiến độ mục tiêu"
                value={`${analysis.goalScore}%`}
              />
              <SummaryRow
                label="Danh mục chi lớn nhất"
                value={analysis.topSpending?.name ?? "Chưa có"}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Health Score V2 ──────────────────────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-100">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Điểm sức khỏe V2
              </h2>
              <p className="text-sm text-slate-500">
                Phân tích 10 yếu tố từ dữ liệu thực tế.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-5">
            <div
              className={`flex size-24 flex-col items-center justify-center rounded-full p-1 shadow-lg ${
                healthV2.grade === "A"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-100"
                  : healthV2.grade === "B"
                    ? "bg-gradient-to-br from-blue-400 to-cyan-500 shadow-blue-100"
                    : healthV2.grade === "C"
                      ? "bg-gradient-to-br from-amber-400 to-orange-400 shadow-amber-100"
                      : "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-100"
              }`}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                <span className="text-3xl font-black text-slate-900">
                  {healthV2.total}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {healthV2.grade}
                </span>
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {healthV2.label}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Dựa trên 10 yếu tố tài chính
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {healthV2.factors.map((f) => (
              <div key={f.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">{f.label}</span>
                  <span className="text-slate-500">{f.note}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      f.score >= 8
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : f.score >= 5
                          ? "bg-gradient-to-r from-blue-500 to-cyan-400"
                          : f.score >= 3
                            ? "bg-gradient-to-r from-amber-400 to-orange-400"
                            : "bg-gradient-to-r from-rose-500 to-rose-400"
                    }`}
                    style={{ width: `${f.score * 10}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Score */}
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-400 text-white shadow-lg shadow-rose-100">
              <Zap size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Điểm rủi ro tài chính
              </h2>
              <p className="text-sm text-slate-500">
                5 yếu tố — thấp hơn là tốt hơn.
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-5">
            <div
              className={`flex size-24 flex-col items-center justify-center rounded-full p-1 shadow-lg ${
                riskScore.level === "low"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-100"
                  : riskScore.level === "medium"
                    ? "bg-gradient-to-br from-amber-400 to-orange-400 shadow-amber-100"
                    : "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-100"
              }`}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                <span className="text-3xl font-black text-slate-900">
                  {riskScore.total}
                </span>
                <span className="text-xs font-bold text-slate-500">/100</span>
              </div>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-900">
                {riskScore.label}
              </p>
              <p className="mt-1 text-sm text-slate-500">Mức rủi ro tổng thể</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {riskScore.factors.map((f) => (
              <div key={f.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-700">{f.label}</p>
                  <p className="text-xs text-slate-500">{f.note}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    f.riskScore <= 5
                      ? "bg-emerald-50 text-emerald-700"
                      : f.riskScore <= 12
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {f.riskScore}/20
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Emergency Fund Intelligence ───────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-400 text-white shadow-lg shadow-teal-100">
            <PiggyBank size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Quỹ khẩn cấp</h2>
            <p className="text-sm text-slate-500">
              Phân tích mức độ dự phòng tài chính khi gặp rủi ro.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Score dial */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div
              className={`flex size-24 flex-col items-center justify-center rounded-full p-1 shadow-lg ${
                emergencyFund.status === "excellent"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-100"
                  : emergencyFund.status === "good"
                    ? "bg-gradient-to-br from-blue-400 to-cyan-500 shadow-blue-100"
                    : emergencyFund.status === "low"
                      ? "bg-gradient-to-br from-amber-400 to-orange-400 shadow-amber-100"
                      : "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-100"
              }`}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                <span className="text-3xl font-black text-slate-900">
                  {emergencyFund.score}
                </span>
                <span className="text-xs font-bold text-slate-500">/100</span>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                emergencyFund.status === "excellent"
                  ? "bg-emerald-50 text-emerald-700"
                  : emergencyFund.status === "good"
                    ? "bg-blue-50 text-blue-700"
                    : emergencyFund.status === "low"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-rose-50 text-rose-700"
              }`}
            >
              {emergencyFund.statusLabel}
            </span>
          </div>

          {/* Detail column */}
          <div className="flex-1 space-y-4">
            {/* Coverage progress bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Độ bao phủ</span>
                <span>
                  {emergencyFund.monthsCovered} / {emergencyFund.targetMonths}{" "}
                  tháng
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full transition-all ${
                    emergencyFund.status === "excellent"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : emergencyFund.status === "good"
                        ? "bg-gradient-to-r from-blue-500 to-cyan-400"
                        : emergencyFund.status === "low"
                          ? "bg-gradient-to-r from-amber-400 to-orange-400"
                          : "bg-gradient-to-r from-rose-500 to-rose-400"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (emergencyFund.monthsCovered /
                        emergencyFund.targetMonths) *
                        100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* 3 metric tiles */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Hiện có</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatVND(emergencyFund.liquidCash)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Mục tiêu (6 tháng)</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatVND(emergencyFund.targetAmount)}
                </p>
              </div>
              <div
                className={`rounded-2xl p-3 text-center ${
                  emergencyFund.shortfall > 0 ? "bg-rose-50" : "bg-emerald-50"
                }`}
              >
                <p
                  className={`text-xs ${emergencyFund.shortfall > 0 ? "text-rose-500" : "text-emerald-600"}`}
                >
                  {emergencyFund.shortfall > 0 ? "Còn thiếu" : "Vượt mục tiêu"}
                </p>
                <p
                  className={`mt-1 text-sm font-black ${emergencyFund.shortfall > 0 ? "text-rose-700" : "text-emerald-700"}`}
                >
                  {formatVND(emergencyFund.shortfall)}
                </p>
              </div>
            </div>

            {/* Recommendation row */}
            {emergencyFund.recommendedMonthlyContribution > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                <CheckCircle2 size={18} className="shrink-0 text-amber-600" />
                <p className="text-xs font-medium text-amber-700">
                  Đóng góp{" "}
                  <span className="font-black">
                    {formatVND(emergencyFund.recommendedMonthlyContribution)}
                    /tháng
                  </span>{" "}
                  trong 12 tháng để đủ quỹ khẩn cấp 6 tháng.
                </p>
              </div>
            )}

            {/* Chi tiêu trung bình */}
            <p className="text-xs text-slate-400">
              Chi tiêu trung bình:{" "}
              <span className="font-bold text-slate-600">
                {formatVND(emergencyFund.monthlyAvgExpense)}/tháng
              </span>{" "}
              (6 tháng gần nhất)
            </p>
          </div>
        </div>
      </section>

      {/* ── Spending Anomalies ────────────────────────────────────────────── */}
      {anomalies.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-lg shadow-orange-100">
              <Activity size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Phát hiện chi tiêu bất thường
              </h2>
              <p className="text-sm text-slate-500">
                Các tháng có mức chi vượt ngưỡng thống kê thông thường (1.5× độ
                lệch chuẩn).
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {anomalies.slice(0, 6).map((a) => (
              <div
                key={`${a.categoryId}-${a.month}`}
                className={`rounded-3xl border p-4 ${
                  a.severity === "high"
                    ? "border-rose-100 bg-rose-50"
                    : "border-orange-100 bg-orange-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p
                      className={`font-black text-sm ${
                        a.severity === "high"
                          ? "text-rose-700"
                          : "text-orange-700"
                      }`}
                    >
                      {a.categoryName}
                    </p>
                    <p
                      className={`mt-0.5 text-xs ${
                        a.severity === "high"
                          ? "text-rose-500"
                          : "text-orange-500"
                      }`}
                    >
                      Tháng {a.month}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                      a.severity === "high"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    +{a.deviationPercent}%
                  </span>
                </div>
                <p
                  className={`mt-2 text-xs ${
                    a.severity === "high" ? "text-rose-600" : "text-orange-600"
                  }`}
                >
                  {formatVND(a.amount)} vs trung bình{" "}
                  {formatVND(a.averageAmount)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Monthly Forecast ──────────────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
            <TrendingUp size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Dự báo tháng tới
            </h2>
            <p className="text-sm text-slate-500">
              Hồi quy tuyến tính từ dữ liệu 6 tháng gần nhất.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <ForecastCard
            label="Thu nhập dự kiến"
            value={formatVND(forecast.projectedIncome)}
            confidence={forecast.incomeConfidence}
            positive
          />
          <ForecastCard
            label="Chi tiêu dự kiến"
            value={formatVND(forecast.projectedExpense)}
            confidence={forecast.expenseConfidence}
            positive={false}
          />
          <ForecastCard
            label="Tiết kiệm dự kiến"
            value={formatVND(forecast.projectedSaving)}
            confidence={
              forecast.incomeConfidence === "high" &&
              forecast.expenseConfidence === "high"
                ? "high"
                : "medium"
            }
            positive={forecast.projectedSaving >= 0}
          />
        </div>

        {/* ── Forecast Confidence Score ── */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">
              Độ tin cậy dự báo
            </span>
            <span
              className={`rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                financialForecast.confidenceScore >= 70
                  ? "bg-emerald-100 text-emerald-700"
                  : financialForecast.confidenceScore >= 40
                    ? "bg-amber-100 text-amber-700"
                    : "bg-rose-100 text-rose-700"
              }`}
            >
              {financialForecast.confidenceScore}/100 —{" "}
              {financialForecast.confidenceLabel}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-2.5 rounded-full transition-all ${
                financialForecast.confidenceScore >= 70
                  ? "bg-emerald-500"
                  : financialForecast.confidenceScore >= 40
                    ? "bg-amber-400"
                    : "bg-rose-400"
              }`}
              style={{ width: `${financialForecast.confidenceScore}%` }}
            />
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-slate-400">
            <span>
              Biến động thu nhập:{" "}
              {Math.round(financialForecast.incomeVolatility * 100)}%
            </span>
            <span>
              Biến động chi tiêu:{" "}
              {Math.round(financialForecast.expenseVolatility * 100)}%
            </span>
          </div>
        </div>

        {/* ── Scenario Comparison Table ── */}
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            Ba kịch bản dự báo — Tháng {financialForecast.forecastMonth}
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Kịch bản</th>
                  <th className="px-4 py-3 text-right">Thu nhập</th>
                  <th className="px-4 py-3 text-right">Chi tiêu</th>
                  <th className="px-4 py-3 text-right">Tiết kiệm</th>
                  <th className="px-4 py-3 text-right">Số dư cuối tháng</th>
                  <th className="px-4 py-3 text-right">Tăng trưởng NW</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    {
                      s: financialForecast.best,
                      bg: "bg-emerald-50",
                      badge: "bg-emerald-100 text-emerald-700",
                      icon: <TrendingUp size={12} className="inline" />,
                    },
                    {
                      s: financialForecast.expected,
                      bg: "bg-white",
                      badge: "bg-blue-100 text-blue-700",
                      icon: null,
                    },
                    {
                      s: financialForecast.worst,
                      bg: "bg-rose-50",
                      badge: "bg-rose-100 text-rose-700",
                      icon: <TrendingDown size={12} className="inline" />,
                    },
                  ] as const
                ).map(({ s, bg, badge, icon }) => (
                  <tr key={s.scenarioKey} className={bg}>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold ${
                          badge
                        }`}
                      >
                        {icon}
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {formatVND(s.projectedIncome)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {formatVND(s.projectedExpense)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        s.projectedSaving >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {s.projectedSaving >= 0 ? "+" : ""}
                      {formatVND(s.projectedSaving)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {formatVND(s.endOfMonthBalance)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right text-xs font-bold ${
                        s.netWorthGrowthPercent !== null &&
                        s.netWorthGrowthPercent >= 0
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    >
                      {s.netWorthGrowthPercent !== null
                        ? `${s.netWorthGrowthPercent >= 0 ? "+" : ""}${s.netWorthGrowthPercent}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Số dư hiện tại (tiền mặt / ngân hàng / ví):{" "}
            {formatVND(financialForecast.currentLiquidBalance)} — Tài sản ròng:{" "}
            {formatVND(financialForecast.currentNetWorth)}
          </p>
        </div>
      </section>

      {/* ── Goal Predictions ──────────────────────────────────────────────── */}
      {goalPredictions.length > 0 && (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-100">
              <Target size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Dự đoán đạt mục tiêu
              </h2>
              <p className="text-sm text-slate-500">
                Ước tính dựa trên tốc độ tiết kiệm hiện tại.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {goalPredictions.map((p) => (
              <div
                key={p.goalId}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-black text-slate-900">{p.goalName}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatVND(p.currentAmount)} / {formatVND(p.targetAmount)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      p.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : p.status === "on-track"
                          ? "bg-blue-50 text-blue-700"
                          : p.status === "at-risk"
                            ? "bg-orange-50 text-orange-700"
                            : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {p.status === "completed"
                      ? "Đã hoàn thành"
                      : p.status === "on-track"
                        ? `~${p.estimatedMonthsLeft} tháng`
                        : p.status === "at-risk"
                          ? `~${p.estimatedMonthsLeft} tháng (chậm)`
                          : "Chưa đủ dữ liệu"}
                  </span>
                </div>

                <div className="mt-3 h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      p.status === "completed"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : p.status === "on-track"
                          ? "bg-gradient-to-r from-blue-500 to-cyan-400"
                          : "bg-gradient-to-r from-orange-400 to-amber-400"
                    }`}
                    style={{ width: `${p.progressPercent}%` }}
                  />
                </div>

                {p.projectedCompletionMonth && p.status !== "completed" && (
                  <p className="mt-2 text-xs text-slate-400">
                    Dự kiến hoàn thành: {p.projectedCompletionMonth} · Đóng góp{" "}
                    {formatVND(p.monthlyContribution)}/tháng
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Smart Budget AI ───────────────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-100">
            <BarChart2 size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Phân tích ngân sách thông minh
            </h2>
            <p className="text-sm text-slate-500">
              Tháng {smartBudget.currentMonth} — Tuân thủ ngân sách:{" "}
              <span
                className={
                  smartBudget.adherenceScore >= 80
                    ? "font-bold text-emerald-600"
                    : smartBudget.adherenceScore >= 60
                      ? "font-bold text-amber-600"
                      : "font-bold text-rose-600"
                }
              >
                {smartBudget.adherenceScore}%
              </span>
            </p>
          </div>
        </div>

        {/* ── 50/30/20 Allocation ── */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            Phân bổ thu nhập (50 / 30 / 20)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                {
                  bucket: smartBudget.allocation.needs,
                  color: "bg-blue-500",
                  bg: "bg-blue-50",
                  ring: "ring-blue-200",
                },
                {
                  bucket: smartBudget.allocation.wants,
                  color: "bg-amber-500",
                  bg: "bg-amber-50",
                  ring: "ring-amber-200",
                },
                {
                  bucket: smartBudget.allocation.savings,
                  color: "bg-emerald-500",
                  bg: "bg-emerald-50",
                  ring: "ring-emerald-200",
                },
              ] as const
            ).map(({ bucket, color, bg, ring }) => (
              <div
                key={bucket.label}
                className={`rounded-2xl p-4 ring-1 ${bg} ${ring}`}
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-slate-700">
                    {bucket.label}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      bucket.status === "over"
                        ? "text-rose-600"
                        : bucket.status === "under"
                          ? "text-slate-400"
                          : "text-emerald-600"
                    }`}
                  >
                    {bucket.actualPercent}% / {bucket.targetPercent}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
                  <div
                    className={`h-2 rounded-full transition-all ${color}`}
                    style={{
                      width: `${Math.min(100, (bucket.actualPercent / bucket.targetPercent) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>Thực tế: {formatVND(bucket.actualAmount)}</span>
                  <span>Mục tiêu: {formatVND(bucket.targetAmount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Budget Violations ── */}
        {smartBudget.violations.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
              Vượt ngân sách tháng này ({smartBudget.violations.length})
            </h3>
            <div className="space-y-2">
              {smartBudget.violations.map((v) => (
                <div
                  key={v.categoryId}
                  className="flex flex-col justify-between gap-1 rounded-xl border border-rose-100 bg-rose-50 p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      {v.categoryName}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      Ngân sách: {formatVND(v.budgetLimit)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">
                      Thực tế: {formatVND(v.actualSpend)}
                    </span>
                    <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                      +{v.overagePercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Category Analysis Table ── */}
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            Chi tiết danh mục
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Danh mục</th>
                  <th className="px-4 py-3 text-right">Ngân sách</th>
                  <th className="px-4 py-3 text-right">Thực tế</th>
                  <th className="px-4 py-3 text-center">Sử dụng</th>
                  <th className="px-4 py-3 text-center">Xu hướng</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {smartBudget.categoryAnalysis
                  .filter((c) => c.actualSpend > 0 || c.budgetLimit > 0)
                  .sort((a, b) => b.actualSpend - a.actualSpend)
                  .slice(0, 8)
                  .map((c, i) => (
                    <tr
                      key={c.categoryId}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {c.categoryName}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {c.budgetLimit > 0 ? formatVND(c.budgetLimit) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        {formatVND(c.actualSpend)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.budgetLimit > 0 ? (
                          <div className="flex items-center gap-1">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-1.5 rounded-full ${
                                  c.usagePercent > 100
                                    ? "bg-rose-500"
                                    : c.usagePercent >= 85
                                      ? "bg-amber-400"
                                      : "bg-emerald-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, c.usagePercent)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">
                              {c.usagePercent}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Chưa đặt
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.trend === "increasing" ? (
                          <span className="inline-flex items-center gap-0.5 rounded-lg bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                            <TrendingUp size={11} /> Tăng
                          </span>
                        ) : c.trend === "decreasing" ? (
                          <span className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                            <TrendingDown size={11} /> Giảm
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            Ổn định
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.status === "over" ? (
                          <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                            Vượt
                          </span>
                        ) : c.status === "near" ? (
                          <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            Gần giới hạn
                          </span>
                        ) : c.status === "on-track" ? (
                          <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            Tốt
                          </span>
                        ) : c.status === "no-budget" ? (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            Chưa ngân sách
                          </span>
                        ) : (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                            Không chi
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Recommended Budgets ── */}
        {smartBudget.recommendedBudgets.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
              Đề xuất ngân sách từ AI
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {smartBudget.recommendedBudgets.map((rec) => (
                <div
                  key={rec.categoryId}
                  className="rounded-2xl border border-violet-100 bg-violet-50 p-4"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      {rec.categoryName}
                    </span>
                    <span className="whitespace-nowrap rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                      {formatVND(rec.recommended)}
                    </span>
                  </div>
                  {rec.currentLimit > 0 && (
                    <p className="mb-1 text-xs text-slate-400">
                      Hiện tại: {formatVND(rec.currentLimit)}
                    </p>
                  )}
                  <p className="text-xs text-slate-600">{rec.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── FIRE Calculator ───────────────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-lg shadow-orange-100">
            <Flame size={22} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">
              FIRE Calculator
            </h2>
            <p className="text-sm text-slate-500">
              Financial Independence, Retire Early — SWR{" "}
              {(fire.safeWithdrawalRate * 100).toFixed(0)}%, lợi suất{" "}
              {(fire.annualReturn * 100).toFixed(0)}%/năm.
            </p>
          </div>
        </div>

        {/* Score + Status */}
        <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div
              className={`flex size-24 flex-col items-center justify-center rounded-full p-1 shadow-lg ${
                fire.status === "achieved"
                  ? "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-100"
                  : fire.status === "close"
                    ? "bg-gradient-to-br from-blue-400 to-cyan-500 shadow-blue-100"
                    : fire.status === "near"
                      ? "bg-gradient-to-br from-violet-400 to-indigo-500 shadow-violet-100"
                      : fire.status === "mid"
                        ? "bg-gradient-to-br from-amber-400 to-orange-400 shadow-amber-100"
                        : "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-100"
              }`}
            >
              <div className="flex size-full flex-col items-center justify-center rounded-full bg-white">
                <span className="text-2xl font-black text-slate-900">
                  {fire.score}%
                </span>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                fire.status === "achieved"
                  ? "bg-emerald-50 text-emerald-700"
                  : fire.status === "close"
                    ? "bg-blue-50 text-blue-700"
                    : fire.status === "near"
                      ? "bg-violet-50 text-violet-700"
                      : fire.status === "mid"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-rose-50 text-rose-700"
              }`}
            >
              {fire.statusLabel}
            </span>
          </div>

          {/* Key metrics */}
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Tài sản ròng</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatVND(fire.netWorth)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Mục tiêu FIRE</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatVND(fire.fireTarget)}
                </p>
              </div>
              <div
                className={`rounded-2xl p-3 text-center ${
                  fire.gap > 0 ? "bg-rose-50" : "bg-emerald-50"
                }`}
              >
                <p
                  className={`text-xs ${fire.gap > 0 ? "text-rose-500" : "text-emerald-600"}`}
                >
                  {fire.gap > 0 ? "Còn thiếu" : "Đạt mục tiêu"}
                </p>
                <p
                  className={`mt-1 text-sm font-black ${fire.gap > 0 ? "text-rose-700" : "text-emerald-700"}`}
                >
                  {formatVND(fire.gap)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">Thời gian</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {fire.estimatedYearsToFire !== null
                    ? `${fire.estimatedYearsToFire} năm`
                    : "—"}
                </p>
              </div>
            </div>

            {/* FIRE progress bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Tiến độ đến FIRE</span>
                <span>{fire.progressPercent}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div
                  className={`h-3 rounded-full transition-all ${
                    fire.status === "achieved"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : fire.status === "close"
                        ? "bg-gradient-to-r from-blue-500 to-cyan-400"
                        : fire.status === "near"
                          ? "bg-gradient-to-r from-violet-500 to-indigo-400"
                          : fire.status === "mid"
                            ? "bg-gradient-to-r from-amber-400 to-orange-400"
                            : "bg-gradient-to-r from-rose-500 to-rose-400"
                  }`}
                  style={{ width: `${fire.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Milestone timeline */}
        <div className="mt-6">
          <p className="mb-3 text-sm font-bold text-slate-600">
            Các cột mốc trên hành trình FIRE
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fire.milestones.map((m) => (
              <div
                key={m.targetPercent}
                className={`rounded-3xl border p-4 text-center transition-all ${
                  m.achieved
                    ? "border-emerald-100 bg-emerald-50"
                    : "border-slate-100 bg-slate-50"
                }`}
              >
                <p
                  className={`text-lg font-black ${
                    m.achieved ? "text-emerald-700" : "text-slate-700"
                  }`}
                >
                  {m.label}
                </p>
                <p
                  className={`mt-1 text-xs font-bold ${
                    m.achieved ? "text-emerald-600" : "text-slate-500"
                  }`}
                >
                  {m.achieved
                    ? "Đã đạt ✓"
                    : m.yearsFromNow !== null
                      ? `~${m.yearsFromNow} năm`
                      : "Chưa xác định"}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {formatVND(m.projectedNetWorth)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly contribution info */}
        {fire.monthlyContribution > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3">
            <TrendingUp size={18} className="shrink-0 text-blue-600" />
            <p className="text-xs font-medium text-blue-700">
              Đầu tư{" "}
              <span className="font-black">
                {formatVND(fire.monthlyContribution)}/tháng
              </span>{" "}
              (tiết kiệm hiện tại) với lợi suất{" "}
              {(fire.annualReturn * 100).toFixed(0)}%/năm.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "good" | "danger" | "info";
}) {
  const color =
    tone === "good"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-rose-500"
        : "text-blue-600";

  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className={`mt-3 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const className =
    insight.tone === "good"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : insight.tone === "danger"
        ? "border-rose-100 bg-rose-50 text-rose-700"
        : insight.tone === "warning"
          ? "border-orange-100 bg-orange-50 text-orange-700"
          : "border-blue-100 bg-blue-50 text-blue-700";

  return (
    <div className={`rounded-3xl border p-5 ${className}`}>
      <div className="flex gap-4">
        <div className="mt-0.5">{insight.icon}</div>

        <div>
          <h3 className="font-black">{insight.title}</h3>
          <p className="mt-2 text-sm leading-6 opacity-85">{insight.text}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="font-black text-slate-900">{value}</span>
    </div>
  );
}

function ForecastCard({
  label,
  value,
  confidence,
  positive,
}: {
  label: string;
  value: string;
  confidence: "low" | "medium" | "high";
  positive: boolean;
}) {
  const confLabel =
    confidence === "high"
      ? "Độ tin cậy cao"
      : confidence === "medium"
        ? "Độ tin cậy trung bình"
        : "Độ tin cậy thấp";
  const confClass =
    confidence === "high"
      ? "bg-emerald-50 text-emerald-700"
      : confidence === "medium"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-500";
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-black ${positive ? "text-emerald-600" : "text-rose-500"}`}
      >
        {value}
      </p>
      <span
        className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${confClass}`}
      >
        {confLabel}
      </span>
    </div>
  );
}
