"use client";

import { useMemo, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import {
  buildCategorySpendingData,
  formatVND,
  type BudgetSpending,
} from "@/src/services/finance/financeCalculations";
import { usePrefersReducedMotion } from "@/src/lib/ui/usePrefersReducedMotion";
import { formatCompactVND } from "./dashboardFormat";

const EXPENSE_COLORS = ["#3987E8", "#72AFE9", "#F6A76D", "#70C7BF", "#A4B5DD"];
const WALLET_COLORS = ["#3987E8", "#72AFE9", "#91C6EC", "#70C7BF", "#A4B5DD"];

type ExpenseSlice = { name: string; value: number };

type Props = {
  cashFlowChart: ReactNode;
  cashFlowReady: boolean;
  spendingReady: boolean;
  budgetReady: boolean;
  walletsReady: boolean;
  monthMode: boolean;
  year: number;
  month: number;
  categories: Category[];
  transactions: Transaction[];
  budgetSpending: BudgetSpending[];
  wallets: Wallet[];
};

/** Summarize only observed expense amounts; the remainder is never dropped. */
export function groupDashboardExpenseSlices(
  items: ExpenseSlice[],
  maxCategories = 4,
): ExpenseSlice[] {
  const positive = items.filter(
    (item) => Number.isFinite(item.value) && item.value > 0,
  );
  const head = positive.slice(0, maxCategories);
  const remainder = positive
    .slice(maxCategories)
    .reduce((sum, item) => sum + item.value, 0);
  return remainder > 0
    ? [...head, { name: "Danh mục khác", value: remainder }]
    : head;
}

/**
 * Ratios are presentation only. All spend/limit numbers come from the
 * canonical budget spending collection in DashboardPage.
 */
export function getDashboardBudgetVisualRows(
  rows: BudgetSpending[],
  categories: Category[],
) {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return rows
    .filter((row) => Number.isFinite(row.spent) && Number.isFinite(row.limit))
    .map((row) => ({
      ...row,
      name: names.get(row.categoryId) ?? "Chưa phân loại",
      percent:
        row.limit > 0
          ? Math.max(0, Math.round((row.spent / row.limit) * 100))
          : row.spent > 0
            ? 100
            : 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.spent - a.spent);
}

export function getDashboardWalletVisualRows(wallets: Wallet[]) {
  return wallets
    .filter((wallet) => Number.isFinite(wallet.balance) && wallet.balance > 0)
    .slice()
    .sort((a, b) => b.balance - a.balance);
}

function LoadingChart({ height = "h-48" }: { height?: string }) {
  return <div aria-label="Đang tải biểu đồ" className={height + " animate-pulse rounded-2xl bg-[#F0F6FC]"} />;
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-[#DCE8F3] bg-[#F8FBFE] px-4 text-center text-xs font-semibold text-[#71879A]">
      {children}
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={
        "min-w-0 rounded-3xl border border-[#DCE8F3] bg-white p-4 shadow-[0_7px_22px_-13px_rgba(42,95,143,0.24)] sm:p-5 " +
        className
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-extrabold text-[#294A66] sm:text-base">{title}</h3>
        {hint ? (
          <span className="text-[10px] font-semibold text-[#71879A] sm:text-[11px]">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Chart-first summary. All inputs are loaded/readied by DashboardPage. */
export default function DashboardVisualOverview({
  cashFlowChart,
  cashFlowReady,
  spendingReady,
  budgetReady,
  walletsReady,
  monthMode,
  year,
  month,
  categories,
  transactions,
  budgetSpending,
  wallets,
}: Props) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const expenses = useMemo(
    () => groupDashboardExpenseSlices(
      buildCategorySpendingData(transactions, categories).map((item) => ({
        name: item.name,
        value: item.value,
      })),
    ),
    [transactions, categories],
  );
  const totalExpense = expenses.reduce((sum, item) => sum + item.value, 0);
  const budgetRows = useMemo(
    () => getDashboardBudgetVisualRows(budgetSpending, categories),
    [budgetSpending, categories],
  );
  const walletRows = useMemo(() => getDashboardWalletVisualRows(wallets), [wallets]);
  const positiveWalletTotal = walletRows.reduce((sum, item) => sum + item.balance, 0);
  const walletMax = walletRows[0]?.balance ?? 1;
  const negativeWalletCount = wallets.filter(
    (wallet) => Number.isFinite(wallet.balance) && wallet.balance < 0,
  ).length;

  return (
    <div
      data-dashboard-chart-first-grid="true"
      className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-12 xl:gap-4"
    >
      <ChartCard title={"Thu – chi năm " + year} hint="Dòng tiền hoạt động" className="flex flex-col xl:col-span-7">
        {cashFlowReady && cashFlowChart ? (
          <div data-dashboard-visual-chart="cash-flow" className="flex min-h-[275px] flex-1 flex-col">
            {cashFlowChart}
          </div>
        ) : (
          <div className="mt-4"><LoadingChart height="h-64" /></div>
        )}
      </ChartCard>

      <ChartCard title="Chi tiêu theo danh mục" hint="Kỳ đang chọn" className="xl:col-span-5">
        {!spendingReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : totalExpense <= 0 ? (
          <div className="mt-4"><EmptyChart>Chưa có khoản chi thực tế trong kỳ</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="expenses" className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:justify-center xl:flex-col 2xl:flex-row">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={expenses}
                    nameKey="name"
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={81}
                    strokeWidth={0}
                    paddingAngle={2}
                    isAnimationActive={!prefersReducedMotion}
                  >
                    {expenses.map((expense, index) => (
                      <Cell key={expense.name + index} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatVND(Number(value))}
                    contentStyle={{
                      border: "1px solid #DCE8F3",
                      borderRadius: "12px",
                      color: "#294A66",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] font-semibold text-[#71879A]">Tổng chi</span>
                <strong className="mt-0.5 text-base font-extrabold tabular-nums text-[#294A66]">
                  {formatCompactVND(totalExpense)}
                </strong>
              </div>
            </div>
            <div className="grid w-full min-w-0 max-w-xs gap-2.5">
              {expenses.map((expense, index) => (
                <div key={expense.name + index} className="flex min-w-0 items-center gap-2 text-xs">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: EXPENSE_COLORS[index % EXPENSE_COLORS.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-[#60778D]" title={expense.name}>
                    {expense.name}
                  </span>
                  <strong className="shrink-0 tabular-nums text-[#294A66]">
                    {Math.round((expense.value / totalExpense) * 100)}%
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Mức dùng ngân sách" hint={monthMode ? "Tháng " + month + "/" + year : "Theo tháng"} className="xl:col-span-7">
        {!monthMode ? (
          <div className="mt-4"><EmptyChart>Chọn bộ lọc Tháng để xem ngân sách</EmptyChart></div>
        ) : !budgetReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : budgetRows.length === 0 ? (
          <div className="mt-4"><EmptyChart>Tháng này chưa có ngân sách</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="budgets" className="mt-4 space-y-4">
            {budgetRows.slice(0, 5).map((item) => {
              const barColor =
                item.status === "over" ? "#F47487" :
                item.status === "at-limit" ? "#F29C57" :
                item.status === "near" ? "#F2BD6C" : "#65B7D9";
              return (
                <div key={item.budgetId} className="min-w-0">
                  <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs font-bold text-[#506B81]" title={item.name}>
                      {item.name}
                    </span>
                    <span
                      className={
                        "shrink-0 text-xs font-extrabold tabular-nums " +
                        (item.status === "over" ? "text-rose-600" : "text-[#41627C]")
                      }
                      title={formatVND(item.spent) + " / " + formatVND(item.limit)}
                    >
                      {item.percent}%
                      <span className="ml-2 font-semibold text-[#8296A7]">
                        {formatCompactVND(item.spent)} / {formatCompactVND(item.limit)}
                      </span>
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={item.name + ": dùng " + item.percent + "% ngân sách"}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, item.percent)}
                    className="h-2.5 overflow-hidden rounded-full bg-[#EBF2F8]"
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ backgroundColor: barColor, width: Math.min(100, item.percent) + "%" }}
                    />
                  </div>
                </div>
              );
            })}
            {budgetRows.length > 5 ? (
              <p className="text-[10px] font-semibold text-[#8296A7]">
                Hiển thị 5/{budgetRows.length} danh mục
              </p>
            ) : null}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Số dư theo ví" hint="Số dư hiện tại" className="xl:col-span-5">
        {!walletsReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : walletRows.length === 0 ? (
          <div className="mt-4"><EmptyChart>Chưa có ví với số dư dương</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="wallets" className="mt-4 space-y-4">
            {walletRows.slice(0, 5).map((wallet, index) => (
              <div key={wallet.id} className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-bold text-[#506B81]" title={wallet.name}>
                    {wallet.name}
                  </span>
                  <strong className="shrink-0 text-xs font-extrabold tabular-nums text-[#294A66]">
                    {formatCompactVND(wallet.balance)}
                  </strong>
                </div>
                <div
                  role="img"
                  aria-label={wallet.name + ": " + formatVND(wallet.balance)}
                  className="h-2.5 overflow-hidden rounded-full bg-[#EBF2F8]"
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: Math.max(0, (wallet.balance / walletMax) * 100) + "%", backgroundColor: WALLET_COLORS[index % WALLET_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-[#EAF0F6] pt-3 text-xs">
              <span className="font-semibold text-[#71879A]">Tổng số dư dương</span>
              <strong className="tabular-nums text-[#294A66]">{formatCompactVND(positiveWalletTotal)}</strong>
            </div>
            {walletRows.length > 5 ? (
              <p className="text-[10px] font-semibold text-[#8296A7]">
                Hiển thị 5/{walletRows.length} ví
              </p>
            ) : null}
            {negativeWalletCount > 0 ? (
              <p className="text-[10px] font-semibold text-amber-700">
                {negativeWalletCount} ví số dư âm không nằm trong biểu đồ cột dương
              </p>
            ) : null}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
