"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  Download,
  FileText,
  PieChart as PieChartIcon,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  Transaction,
  Wallet,
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
import { computeHealthScoreV2 } from "@/src/services/finance/analytics/healthScore";
import { computeRiskScore } from "@/src/services/finance/analytics/riskAnalytics";
import { computeFinancialForecast } from "@/src/services/finance/analytics/forecastEngine";
import { computeSmartBudget } from "@/src/services/finance/analytics/smartBudget";

// ─── Colours ─────────────────────────────────────────────────────────────────
const COLORS = [
  "#2563eb",
  "#10b981",
  "#f43f5e",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#94a3b8",
];

// ─── Period helpers ───────────────────────────────────────────────────────────
type PeriodMode = "month" | "quarter" | "year" | "custom";

function filterByPeriod(
  txns: Transaction[],
  mode: PeriodMode,
  year: string,
  month: string,
  quarter: string,
  customStart: string,
  customEnd: string,
): Transaction[] {
  switch (mode) {
    case "month":
      return txns.filter((t) => t.date.startsWith(`${year}-${month}`));
    case "quarter": {
      const q = Number(quarter);
      const months = [
        String((q - 1) * 3 + 1).padStart(2, "0"),
        String((q - 1) * 3 + 2).padStart(2, "0"),
        String((q - 1) * 3 + 3).padStart(2, "0"),
      ];
      return txns.filter((t) =>
        months.some((m) => t.date.startsWith(`${year}-${m}`)),
      );
    }
    case "year":
      return txns.filter((t) => t.date.startsWith(year));
    case "custom":
      return txns.filter((t) => t.date >= customStart && t.date <= customEnd);
  }
}

function periodLabel(
  mode: PeriodMode,
  year: string,
  month: string,
  quarter: string,
  customStart: string,
  customEnd: string,
): string {
  switch (mode) {
    case "month":
      return `T${Number(month)}/${year}`;
    case "quarter":
      return `Q${quarter}/${year}`;
    case "year":
      return `Năm ${year}`;
    case "custom":
      return `${customStart} → ${customEnd}`;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);

  // Period filter state
  const [periodMode, setPeriodMode] = useState<PeriodMode>("year");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("06");
  const [quarter, setQuarter] = useState("2");
  const [customStart, setCustomStart] = useState("2026-01-01");
  const [customEnd, setCustomEnd] = useState("2026-12-31");

  // Statement tab
  const [stmtTab, setStmtTab] = useState<"income" | "cashflow" | "networth">(
    "income",
  );

  useEffect(() => {
    async function load() {
      await initFinanceDemoData();
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
    load();
  }, []);

  // ── Filtered transactions ─────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      filterByPeriod(
        transactions,
        periodMode,
        year,
        month,
        quarter,
        customStart,
        customEnd,
      ),
    [transactions, periodMode, year, month, quarter, customStart, customEnd],
  );

  // ── Core summary ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const income = getTotalIncome(filtered);
    const expense = getTotalExpense(filtered);
    const saving = income - expense;
    const savingRate = getSavingRate(income, expense);
    const investmentAssets = investments.reduce(
      (s, i) => s + i.currentValue,
      0,
    );
    const walletAssets = getTotalAssets(wallets);
    const totalAssets = walletAssets + investmentAssets;
    const totalDebt = getTotalDebt(debts);
    const netWorth = totalAssets - totalDebt;
    const debtRatio = getDebtRatio(totalDebt, totalAssets);
    const goalScore = getGoalScore(goals);
    return {
      income,
      expense,
      saving,
      savingRate,
      totalAssets,
      totalDebt,
      netWorth,
      investmentAssets,
      debtRatio,
      goalScore,
    };
  }, [filtered, wallets, investments, debts, goals]);

  // ── Monthly breakdown (always full year for charts) ───────────────────────
  const yearTxns = useMemo(
    () => transactions.filter((t) => t.date.startsWith(year)),
    [transactions, year],
  );

  const monthly = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = String(i + 1).padStart(2, "0");
        const mx = yearTxns.filter((t) => t.date.startsWith(`${year}-${m}`));
        const inc = getTotalIncome(mx);
        const exp = getTotalExpense(mx);
        return {
          month: `T${i + 1}`,
          thu: inc / 1e6,
          chi: exp / 1e6,
          tietKiem: (inc - exp) / 1e6,
          income: inc,
          expense: exp,
        };
      }),
    [yearTxns, year],
  );

  // ── Running net-worth for cash-flow statement ─────────────────────────────
  const cashFlowRows = useMemo(() => {
    let running =
      summary.netWorth -
      monthly.reduce((s, m) => s + m.income - m.expense * 1e6, 0);
    return monthly.map((m) => {
      running += (m.thu - m.chi) * 1e6;
      return { ...m, balance: running };
    });
  }, [monthly, summary.netWorth]);

  // ── Spending breakdown ────────────────────────────────────────────────────
  const spendingByCategory = useMemo(
    () => getSpendingByCategory(filtered, categories),
    [filtered, categories],
  );
  const spendingPieData = useMemo(
    () =>
      spendingByCategory.map((item, i) => ({
        ...item,
        color: COLORS[i % COLORS.length],
      })),
    [spendingByCategory],
  );

  // ── Comparisons: MoM / QoQ / YoY ─────────────────────────────────────────
  const comparisons = useMemo(() => {
    const now = new Date();
    const curM = String(now.getMonth() + 1).padStart(2, "0");
    const prevM = String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(
      2,
      "0",
    );
    const prevMYear =
      now.getMonth() === 0 ? String(now.getFullYear() - 1) : year;

    const curMonthTxns = transactions.filter((t) =>
      t.date.startsWith(`${year}-${curM}`),
    );
    const prevMonthTxns = transactions.filter((t) =>
      t.date.startsWith(`${prevMYear}-${prevM}`),
    );

    const curQ = Math.floor(now.getMonth() / 3) + 1;
    const prevQ = curQ === 1 ? 4 : curQ - 1;
    const curQMonths = [0, 1, 2].map((x) =>
      String((curQ - 1) * 3 + 1 + x).padStart(2, "0"),
    );
    const prevQMonths = [0, 1, 2].map((x) =>
      String((prevQ - 1) * 3 + 1 + x).padStart(2, "0"),
    );
    const curQYear = year;
    const prevQYear = curQ === 1 ? String(Number(year) - 1) : year;

    const curQTxns = transactions.filter((t) =>
      curQMonths.some((m) => t.date.startsWith(`${curQYear}-${m}`)),
    );
    const prevQTxns = transactions.filter((t) =>
      prevQMonths.some((m) => t.date.startsWith(`${prevQYear}-${m}`)),
    );

    const prevYearTxns = transactions.filter((t) =>
      t.date.startsWith(String(Number(year) - 1)),
    );

    function delta(cur: number, prev: number) {
      if (prev === 0) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    }

    return {
      mom: {
        income: delta(
          getTotalIncome(curMonthTxns),
          getTotalIncome(prevMonthTxns),
        ),
        expense: delta(
          getTotalExpense(curMonthTxns),
          getTotalExpense(prevMonthTxns),
        ),
        saving: delta(
          getTotalIncome(curMonthTxns) - getTotalExpense(curMonthTxns),
          getTotalIncome(prevMonthTxns) - getTotalExpense(prevMonthTxns),
        ),
      },
      qoq: {
        income: delta(getTotalIncome(curQTxns), getTotalIncome(prevQTxns)),
        expense: delta(getTotalExpense(curQTxns), getTotalExpense(prevQTxns)),
        saving: delta(
          getTotalIncome(curQTxns) - getTotalExpense(curQTxns),
          getTotalIncome(prevQTxns) - getTotalExpense(prevQTxns),
        ),
      },
      yoy: {
        income: delta(getTotalIncome(yearTxns), getTotalIncome(prevYearTxns)),
        expense: delta(
          getTotalExpense(yearTxns),
          getTotalExpense(prevYearTxns),
        ),
        saving: delta(
          getTotalIncome(yearTxns) - getTotalExpense(yearTxns),
          getTotalIncome(prevYearTxns) - getTotalExpense(prevYearTxns),
        ),
      },
    };
  }, [transactions, year, yearTxns]);

  // ── Analytics engine ─────────────────────────────────────────────────────
  const healthV2 = useMemo(
    () =>
      computeHealthScoreV2(
        wallets,
        debts,
        goals,
        investments,
        transactions,
        budgets,
        categories,
      ),
    [wallets, debts, goals, investments, transactions, budgets, categories],
  );
  const riskData = useMemo(
    () => computeRiskScore(wallets, debts, goals, transactions, investments),
    [wallets, debts, goals, transactions, investments],
  );
  const forecast = useMemo(
    () => computeFinancialForecast(wallets, debts, investments, transactions),
    [wallets, debts, investments, transactions],
  );
  const smartBudget = useMemo(
    () => computeSmartBudget(transactions, categories, budgets),
    [transactions, categories, budgets],
  );

  // ── Export helpers ────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ["Tháng", "Thu nhập (đ)", "Chi tiêu (đ)", "Tiết kiệm (đ)"],
      ...monthly.map((m) => [
        m.month,
        String(Math.round(m.thu * 1e6)),
        String(Math.round(m.chi * 1e6)),
        String(Math.round(m.tietKiem * 1e6)),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `myfinance-report-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    window.print();
  }

  const label = periodLabel(
    periodMode,
    year,
    month,
    quarter,
    customStart,
    customEnd,
  );
  const YEARS = ["2024", "2025", "2026", "2027", "2028"];
  const MONTHS = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: `Tháng ${i + 1}`,
  }));
  const QUARTERS = [
    { value: "1", label: "Q1 (T1-T3)" },
    { value: "2", label: "Q2 (T4-T6)" },
    { value: "3", label: "Q3 (T7-T9)" },
    { value: "4", label: "Q4 (T10-T12)" },
  ];

  return (
    <div className="space-y-6 print:space-y-4">
      {/* ── Hero + Filters ─────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-600 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-blue-200" />
                <p className="text-sm font-bold text-blue-200">
                  Personal CFO Report Center
                </p>
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">
                Báo cáo tài chính
              </h1>
              <p className="mt-1 text-sm text-blue-200">{label}</p>
            </div>
            {/* Export buttons */}
            <div className="flex gap-2 print:hidden">
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 rounded-2xl bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur hover:bg-white/30"
              >
                <Download size={15} />
                CSV
              </button>
              <button
                onClick={exportPDF}
                className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"
              >
                <FileText size={15} />
                PDF
              </button>
            </div>
          </div>

          {/* 5 KPI cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <HeroKpi
              label="Tài sản ròng"
              value={formatVND(summary.netWorth)}
              sub="Tài sản − Nợ"
              accent="text-white"
            />
            <HeroKpi
              label="Tổng tài sản"
              value={formatVND(summary.totalAssets)}
              sub="Ví + Đầu tư"
              accent="text-blue-200"
            />
            <HeroKpi
              label="Tổng nợ"
              value={formatVND(summary.totalDebt)}
              sub="Còn phải trả"
              accent="text-rose-300"
            />
            <HeroKpi
              label="Đầu tư"
              value={formatVND(summary.investmentAssets)}
              sub={`${investments.length} tài sản`}
              accent="text-emerald-300"
            />
            <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center rounded-2xl bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold text-blue-200">Điểm sức khoẻ</p>
              <p className="mt-1 text-4xl font-black text-white">
                {healthV2.total}
              </p>
              <span
                className={`mt-1 rounded-full px-3 py-0.5 text-xs font-black ${healthV2.grade === "A" ? "bg-emerald-400/30 text-emerald-200" : healthV2.grade === "B" ? "bg-sky-400/30 text-sky-200" : healthV2.grade === "C" ? "bg-amber-400/30 text-amber-200" : "bg-rose-400/30 text-rose-200"}`}
              >
                {healthV2.grade} — {healthV2.label}
              </span>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 print:hidden">
          <span className="text-xs font-bold text-slate-500">Kỳ báo cáo:</span>
          {(["month", "quarter", "year", "custom"] as PeriodMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setPeriodMode(m)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${periodMode === m ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-blue-300"}`}
            >
              {m === "month"
                ? "Tháng"
                : m === "quarter"
                  ? "Quý"
                  : m === "year"
                    ? "Năm"
                    : "Tuỳ chọn"}
            </button>
          ))}
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {periodMode === "month" && (
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            {periodMode === "quarter" && (
              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
              >
                {QUARTERS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            )}
            {periodMode === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none"
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Financial Statements ───────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Báo cáo tài chính
            </h2>
            <p className="text-sm text-slate-500">
              Income Statement · Cash Flow · Net Worth
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mt-5 flex gap-2 border-b border-slate-100 pb-0 print:hidden">
          {(
            [
              ["income", "Kết quả kinh doanh"],
              ["cashflow", "Dòng tiền"],
              ["networth", "Tài sản ròng"],
            ] as [typeof stmtTab, string][]
          ).map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => setStmtTab(id)}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-bold transition ${stmtTab === id ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700"}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Income Statement */}
        {stmtTab === "income" && (
          <div className="mt-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-left font-black text-slate-700">
                      Khoản mục
                    </th>
                    <th className="pb-3 text-right font-black text-slate-700">
                      Số tiền
                    </th>
                    <th className="pb-3 text-right font-black text-slate-700">
                      %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  <tr className="bg-emerald-50/40">
                    <td className="py-3 font-black text-slate-900">
                      Tổng thu nhập
                    </td>
                    <td className="py-3 text-right font-black text-emerald-600">
                      {formatVND(summary.income)}
                    </td>
                    <td className="py-3 text-right text-emerald-600">100%</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="py-3 font-black text-slate-900">
                      Tổng chi tiêu
                    </td>
                    <td className="py-3 text-right font-black text-rose-500">
                      {formatVND(summary.expense)}
                    </td>
                    <td className="py-3 text-right text-rose-500">
                      {summary.income > 0
                        ? Math.round((summary.expense / summary.income) * 100)
                        : 0}
                      %
                    </td>
                  </tr>
                  <tr className="font-black">
                    <td className="py-3 text-slate-900">Lợi nhuận ròng</td>
                    <td
                      className={`py-3 text-right ${summary.saving >= 0 ? "text-blue-600" : "text-rose-500"}`}
                    >
                      {formatVND(summary.saving)}
                    </td>
                    <td
                      className={`py-3 text-right ${summary.saving >= 0 ? "text-blue-600" : "text-rose-500"}`}
                    >
                      {summary.savingRate}%
                    </td>
                  </tr>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td className="py-3 text-slate-500" colSpan={3}>
                      <p className="font-bold mb-1">Chi tiết theo danh mục</p>
                    </td>
                  </tr>
                  {spendingByCategory.map((item, i) => (
                    <tr key={item.name}>
                      <td className="py-2 pl-4 text-slate-600 flex items-center gap-2">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        {item.name}
                      </td>
                      <td className="py-2 text-right text-slate-700">
                        {formatVND(item.value)}
                      </td>
                      <td className="py-2 text-right text-slate-400">
                        {item.percent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Cash Flow Statement */}
        {stmtTab === "cashflow" && (
          <div className="mt-5">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height={280} minWidth={0}>
                <BarChart
                  data={monthly}
                  barGap={3}
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
                    name="Thu nhập (M)"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="chi"
                    name="Chi tiêu (M)"
                    fill="#f43f5e"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="tietKiem"
                    name="Tiết kiệm (M)"
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
            {/* Running balance mini-table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Tháng", "Thu (M)", "Chi (M)", "Tiết kiệm (M)"].map(
                      (h) => (
                        <th
                          key={h}
                          className="pb-2 text-right font-bold text-slate-500 first:text-left"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {monthly
                    .filter((m) => m.thu > 0 || m.chi > 0)
                    .map((m) => (
                      <tr key={m.month}>
                        <td className="py-1.5 font-bold text-slate-700">
                          {m.month}
                        </td>
                        <td className="py-1.5 text-right text-emerald-600">
                          {m.thu.toFixed(1)}
                        </td>
                        <td className="py-1.5 text-right text-rose-500">
                          {m.chi.toFixed(1)}
                        </td>
                        <td
                          className={`py-1.5 text-right font-bold ${m.tietKiem >= 0 ? "text-blue-600" : "text-rose-500"}`}
                        >
                          {m.tietKiem.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Net Worth Statement */}
        {stmtTab === "networth" && (
          <div className="mt-5">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Assets */}
              <div>
                <p className="mb-3 text-sm font-black text-slate-700">
                  Tài sản
                </p>
                <div className="space-y-2">
                  {wallets.map((w) => (
                    <div
                      key={w.id}
                      className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                    >
                      <span className="text-slate-600">{w.name}</span>
                      <span className="font-black text-blue-600">
                        {formatVND(w.balance)}
                      </span>
                    </div>
                  ))}
                  {investments.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                    >
                      <span className="text-slate-600">{inv.name}</span>
                      <span className="font-black text-emerald-600">
                        {formatVND(inv.currentValue)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black">
                    <span className="text-blue-700">Tổng tài sản</span>
                    <span className="text-blue-700">
                      {formatVND(summary.totalAssets)}
                    </span>
                  </div>
                </div>
              </div>
              {/* Liabilities + Net Worth */}
              <div>
                <p className="mb-3 text-sm font-black text-slate-700">
                  Nợ phải trả
                </p>
                <div className="space-y-2">
                  {debts.map((d) => (
                    <div
                      key={d.id}
                      className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"
                    >
                      <span className="text-slate-600">{d.name}</span>
                      <span className="font-black text-rose-500">
                        {formatVND(d.remainingAmount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black">
                    <span className="text-rose-700">Tổng nợ</span>
                    <span className="text-rose-700">
                      {formatVND(summary.totalDebt)}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-4 text-sm font-black text-white">
                    <span>Tài sản ròng</span>
                    <span>{formatVND(summary.netWorth)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Trend Analytics ────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<TrendingUp size={20} />}
          title="Phân tích xu hướng"
          subtitle={`12 tháng năm ${year}`}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <TrendCard
            title="Thu nhập"
            color="#10b981"
            data={monthly.map((m) => ({ v: m.thu }))}
            unit="M"
            positive
          />
          <TrendCard
            title="Chi tiêu"
            color="#f43f5e"
            data={monthly.map((m) => ({ v: m.chi }))}
            unit="M"
            positive={false}
          />
          <TrendCard
            title="Tiết kiệm"
            color="#2563eb"
            data={monthly.map((m) => ({ v: m.tietKiem }))}
            unit="M"
            positive
          />
          <TrendCard
            title="Đầu tư"
            color="#10b981"
            data={investments.map((inv, i) => ({ v: inv.currentValue / 1e6 }))}
            unit="M"
            positive
          />
          <TrendCard
            title="Nợ phải trả"
            color="#f97316"
            data={debts.map((d) => ({ v: d.remainingAmount / 1e6 }))}
            unit="M"
            positive={false}
          />
          <TrendCard
            title="Mục tiêu"
            color="#6366f1"
            data={goals.map((g) => ({
              v: Math.round((g.currentAmount / g.targetAmount) * 100),
            }))}
            unit="%"
            positive
          />
        </div>
      </section>

      {/* ── Monthly bar chart (full) ────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          icon={<BarChart3 size={20} />}
          title="Thu chi theo tháng"
          subtitle={`Đơn vị: triệu đồng — Năm ${year}`}
        />
        <div className="mt-5 h-[300px]">
          <ResponsiveContainer width="100%" height={300} minWidth={0}>
            <BarChart
              data={monthly}
              barGap={3}
              barCategoryGap={12}
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
      </section>

      {/* ── Spending breakdown ──────────────────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={<PieChartIcon size={20} />}
            title="Chi tiêu theo danh mục"
            subtitle="Tỷ trọng từng nhóm"
          />
          <div className="relative mx-auto mt-5 h-56 w-56">
            <PieChart width={224} height={224}>
              <Pie
                data={spendingPieData}
                dataKey="value"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={4}
              >
                {spendingPieData.map((e) => (
                  <Cell key={e.name} fill={e.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [formatVND(Number(v ?? 0)), "Chi tiêu"]}
              />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-rose-500">
                {Math.round(summary.expense / 1e6)}M
              </span>
              <span className="text-xs text-slate-500">Tổng chi</span>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {spendingPieData.map((item) => (
              <div key={item.name}>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="flex items-center gap-2 font-bold text-slate-700">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ background: item.color }}
                    />
                    {item.name}
                  </span>
                  <span className="text-slate-500">
                    {formatVND(item.value)}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full transition-all"
                    style={{
                      width: `${item.percent}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">{item.percent}%</p>
              </div>
            ))}
            {spendingPieData.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-6">
                Không có dữ liệu chi tiêu cho kỳ này.
              </p>
            )}
          </div>
        </div>

        {/* Comparisons */}
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader
            icon={<BarChart3 size={20} />}
            title="So sánh kỳ"
            subtitle="Month · Quarter · Year over Year"
          />
          <div className="mt-5 space-y-6">
            <CompareSection
              title="Month over Month (MoM)"
              data={comparisons.mom}
            />
            <CompareSection
              title="Quarter over Quarter (QoQ)"
              data={comparisons.qoq}
            />
            <CompareSection
              title="Year over Year (YoY)"
              data={comparisons.yoy}
            />
          </div>
        </div>
      </section>

      {/* ── AI Insights ─────────────────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-lg shadow-violet-100">
            <Bot size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">AI Insights</h2>
            <p className="text-sm text-slate-500">
              Phân tích thông minh từ dữ liệu thực tế
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Spending Analysis */}
          <InsightBlock
            icon={<PieChartIcon size={18} />}
            title="Phân tích chi tiêu"
            tone={
              smartBudget.adherenceScore >= 80
                ? "good"
                : smartBudget.adherenceScore >= 60
                  ? "warning"
                  : "danger"
            }
          >
            <p className="text-xs leading-5 opacity-80">
              Điểm tuân thủ ngân sách:{" "}
              <strong>{smartBudget.adherenceScore}/100</strong>.{" "}
              {smartBudget.violations.length > 0
                ? `Có ${smartBudget.violations.length} danh mục vượt ngân sách. ${smartBudget.violations.map((v) => v.categoryName).join(", ")}.`
                : "Tất cả danh mục trong giới hạn ngân sách."}
            </p>
          </InsightBlock>

          {/* Financial Health */}
          <InsightBlock
            icon={<Sparkles size={18} />}
            title="Sức khoẻ tài chính"
            tone={
              healthV2.grade === "A" || healthV2.grade === "B"
                ? "good"
                : healthV2.grade === "C"
                  ? "warning"
                  : "danger"
            }
          >
            <p className="text-xs leading-5 opacity-80">
              Điểm: <strong>{healthV2.total}/100</strong> · Xếp hạng{" "}
              <strong>{healthV2.grade}</strong> ({healthV2.label}).{" "}
              {healthV2.factors
                .slice(0, 2)
                .map((f) => f.note)
                .join(" ")}
            </p>
          </InsightBlock>

          {/* Forecast */}
          <InsightBlock
            icon={<Brain size={18} />}
            title="Dự báo tài chính"
            tone={forecast.expected.projectedSaving >= 0 ? "good" : "danger"}
          >
            <p className="text-xs leading-5 opacity-80">
              Tháng tới (kịch bản kỳ vọng): Thu{" "}
              <strong>{formatVND(forecast.expected.projectedIncome)}</strong> ·
              Chi{" "}
              <strong>{formatVND(forecast.expected.projectedExpense)}</strong>.
              Dự kiến tiết kiệm{" "}
              <strong>{formatVND(forecast.expected.projectedSaving)}</strong>.
              Độ tin cậy: <strong>{forecast.confidenceLabel}</strong>.
            </p>
          </InsightBlock>

          {/* Risk */}
          <InsightBlock
            icon={<ShieldCheck size={18} />}
            title="Phân tích rủi ro"
            tone={
              riskData.level === "low"
                ? "good"
                : riskData.level === "medium"
                  ? "warning"
                  : "danger"
            }
          >
            <p className="text-xs leading-5 opacity-80">
              Rủi ro tổng thể: <strong>{riskData.total}/100</strong> (
              {riskData.label}). {riskData.recommendations.slice(0, 1).join("")}
            </p>
          </InsightBlock>
        </div>

        {/* Health score factors */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="mb-3 text-sm font-black text-slate-700">
            Chi tiết điểm sức khoẻ tài chính
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {healthV2.factors.map((f) => (
              <div key={f.label} className="rounded-2xl bg-slate-50 p-4">
                <div className="mb-2 flex justify-between text-xs">
                  <span className="font-bold text-slate-700">{f.label}</span>
                  <span className="font-black text-slate-900">
                    {f.score * f.weight}/{10 * f.weight}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full transition-all ${f.score >= 7 ? "bg-emerald-500" : f.score >= 4 ? "bg-amber-400" : "bg-rose-500"}`}
                    style={{ width: `${(f.score / 10) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">{f.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Goal Progress ───────────────────────────────────────────────── */}
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader
          icon={<Target size={20} />}
          title="Tiến độ mục tiêu"
          subtitle="Trạng thái từng mục tiêu tài chính"
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.length === 0 ? (
            <p className="col-span-3 py-6 text-center text-sm text-slate-400">
              Chưa có mục tiêu nào.
            </p>
          ) : (
            goals.map((g) => {
              const pct = Math.min(
                Math.round((g.currentAmount / g.targetAmount) * 100),
                100,
              );
              return (
                <div
                  key={g.id}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black text-slate-900">{g.name}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${pct >= 100 ? "bg-emerald-100 text-emerald-700" : pct >= 60 ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatVND(g.currentAmount)} / {formatVND(g.targetAmount)}
                  </p>
                  <div className="mt-3 h-3 rounded-full bg-white">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeroKpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
      <p className="text-xs font-bold text-blue-200">{label}</p>
      <p className={`mt-1 text-lg font-black ${accent} truncate`}>{value}</p>
      <p className="mt-0.5 text-xs text-blue-300">{sub}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function TrendCard({
  title,
  color,
  data,
  unit,
  positive,
}: {
  title: string;
  color: string;
  data: { v: number }[];
  unit: string;
  positive: boolean;
}) {
  const last = data.at(-1)?.v ?? 0;
  const prev = data.at(-2)?.v ?? 0;
  const delta =
    prev !== 0 ? Math.round(((last - prev) / prev) * 1000) / 10 : null;
  const up = delta !== null && delta > 0;
  const chartData = data.map((d, i) => ({ i, v: d.v }));
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{title}</p>
        {delta !== null && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${up === positive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}
          >
            {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-black" style={{ color }}>
        {last.toFixed(1)}
        {unit}
      </p>
      <div className="mt-3 h-16">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={64} minWidth={0}>
            <LineChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Không đủ dữ liệu
          </div>
        )}
      </div>
    </div>
  );
}

function CompareSection({
  title,
  data,
}: {
  title: string;
  data: {
    income: number | null;
    expense: number | null;
    saving: number | null;
  };
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black text-slate-500">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        <DeltaChip label="Thu nhập" delta={data.income} positive />
        <DeltaChip label="Chi tiêu" delta={data.expense} positive={false} />
        <DeltaChip label="Tiết kiệm" delta={data.saving} positive />
      </div>
    </div>
  );
}

function DeltaChip({
  label,
  delta,
  positive,
}: {
  label: string;
  delta: number | null;
  positive: boolean;
}) {
  if (delta === null)
    return (
      <div className="rounded-2xl bg-slate-50 p-3 text-center">
        <p className="text-xs font-bold text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-black text-slate-400">—</p>
      </div>
    );
  const up = delta > 0;
  const good = up === positive;
  return (
    <div
      className={`rounded-2xl p-3 text-center ${good ? "bg-emerald-50" : "bg-rose-50"}`}
    >
      <p
        className={`text-xs font-bold ${good ? "text-emerald-600" : "text-rose-500"}`}
      >
        {label}
      </p>
      <p
        className={`mt-1 flex items-center justify-center gap-0.5 text-sm font-black ${good ? "text-emerald-600" : "text-rose-500"}`}
      >
        {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {up ? "+" : ""}
        {delta}%
      </p>
    </div>
  );
}

function InsightBlock({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "good" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const styles = {
    good: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warning: "border-amber-100 bg-amber-50 text-amber-700",
    danger: "border-rose-100 bg-rose-50 text-rose-700",
  };
  return (
    <div className={`rounded-2xl border p-4 ${styles[tone]}`}>
      <div className="mb-2 flex items-center gap-2">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <p className="text-sm font-black">{title}</p>
      </div>
      {children}
    </div>
  );
}
