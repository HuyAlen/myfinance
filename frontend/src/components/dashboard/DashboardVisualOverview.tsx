"use client";

import { useMemo, type ReactNode } from "react";
import {
  getDashboardBudgetBand,
  getDashboardBudgetScale,
  getDashboardExpenseMosaicColumns,
  getDashboardWalletDistribution,
} from "./DashboardVisualMetrics";
import type { Category, Transaction, Wallet } from "@/src/types/finance";
import {
  buildCategorySpendingData,
  formatVND,
  type BudgetSpending,
} from "@/src/services/finance/financeCalculations";

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
    .map((row) => ({ ...row, fillPercent: Math.min(100, row.percent) }))
    .sort((a, b) => b.percent - a.percent || b.spent - a.spent);
}

export function getDashboardWalletVisualRows(wallets: Wallet[]) {
  const positive = wallets.filter((wallet) => Number.isFinite(wallet.balance) && wallet.balance > 0);
  const total = positive.reduce((sum, wallet) => sum + wallet.balance, 0);
  return positive
    .map((wallet) => ({ ...wallet, sharePercent: total > 0 ? (wallet.balance / total) * 100 : 0 }))
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
        "min-w-0 overflow-hidden rounded-[22px] border border-[#D9E5EF] bg-white/95 p-4 shadow-[0_8px_30px_-20px_rgba(28,75,120,0.26)] transition-shadow duration-200 hover:shadow-[0_16px_36px_-24px_rgba(28,75,120,0.30)] sm:p-5 " +
        className
      }
    >
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#EFF3F8] pb-2.5">
        <h3 className="text-[13px] font-extrabold tracking-tight text-[#294A66] sm:text-[15px]">{title}</h3>
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
  const mosaic = getDashboardExpenseMosaicColumns(expenses);
  const budgetRows = useMemo(
    () => getDashboardBudgetVisualRows(budgetSpending, categories),
    [budgetSpending, categories],
  );
  const walletRows = useMemo(() => getDashboardWalletVisualRows(wallets), [wallets]);
  const displayedWallets = getDashboardWalletDistribution(walletRows);
  const budgetScale = getDashboardBudgetScale(budgetRows.slice(0, 5));
  const positiveWalletTotal = walletRows.reduce((sum, item) => sum + item.balance, 0);
  
  const negativeWalletCount = wallets.filter(
    (wallet) => Number.isFinite(wallet.balance) && wallet.balance < 0,
  ).length;

  return (
    <div
      data-dashboard-chart-first-grid="true"
      className="grid min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-12 lg:gap-4"
    >
      <ChartCard title={"Thu – chi năm " + year} hint="Dòng tiền hoạt động" className="flex flex-col lg:col-span-7">
        {cashFlowReady && cashFlowChart ? (
          <div data-dashboard-visual-chart="cash-flow" className="flex min-h-[275px] flex-1 flex-col">
            {cashFlowChart}
          </div>
        ) : (
          <div className="mt-4"><LoadingChart height="h-64" /></div>
        )}
      </ChartCard>

      <ChartCard title="Chi tiêu theo danh mục" hint="Kỳ đang chọn" className="lg:col-span-5">
        {!spendingReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : totalExpense <= 0 ? (
          <div className="mt-4"><EmptyChart>Chưa có khoản chi thực tế trong kỳ</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="expenses" className="mt-4 flex min-h-[260px] flex-1 flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#8A9FB2]">Tổng chi thực tế</p>
                <p className="mt-1 break-words text-xl font-extrabold tracking-tight tabular-nums text-[#183C5A] sm:text-2xl">{formatVND(totalExpense)}</p>
              </div>
              <p className="text-right text-[11px] font-semibold text-[#6A8298]">{expenses.length} nhóm chi tiêu</p>
            </div>
            <div role="img" aria-label={"Cơ cấu chi tiêu: " + expenses.map((item) => item.name + " " + Math.round(item.value / totalExpense * 100) + "%").join(", ")} className="flex h-[206px] min-h-0 w-full gap-1.5 overflow-hidden rounded-2xl sm:h-[228px]">
              {mosaic.map((column, columnIndex) => (
                <div key={columnIndex} className="flex min-w-0 flex-col gap-1.5" style={{ width: column.widthPercent + "%" }}>
                  {column.tiles.map((item, index) => {
                    const colorIndex = columnIndex === 0 ? index : index + 2;
                    return (
                      <div key={item.name + index} title={item.name + ": " + formatVND(item.value)} className="relative flex min-h-0 flex-col justify-end overflow-hidden rounded-xl p-2.5 text-white sm:p-3" style={{ flex: item.value, backgroundColor: EXPENSE_COLORS[colorIndex % EXPENSE_COLORS.length] }}>
                        <div className="absolute inset-0 bg-gradient-to-t from-[#102C49]/25 to-transparent" />
                        <span className="relative truncate text-[10px] font-semibold leading-4 drop-shadow-sm sm:text-[11px]" title={item.name}>{item.name}</span>
                        <strong className="relative mt-0.5 text-base font-extrabold tabular-nums drop-shadow-sm sm:text-lg">{Math.round(item.sharePercent)}%</strong>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Mức dùng ngân sách" hint={monthMode ? "Tháng " + month + "/" + year : "Theo tháng"} className="lg:col-span-7">
        {!monthMode ? (
          <div className="mt-4"><EmptyChart>Chọn bộ lọc Tháng để xem ngân sách</EmptyChart></div>
        ) : !budgetReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : budgetRows.length === 0 ? (
          <div className="mt-4"><EmptyChart>Tháng này chưa có ngân sách</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="budgets" className="mt-4 flex flex-1 flex-col justify-center gap-3.5">
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[#8298AB]">
              <span>Tỷ lệ chi so với hạn mức</span>
              <span className="inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-[#83B6DD]" />Trong hạn</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-[#EB7184]" />Vượt mức</span></span>
            </div>
            {budgetRows.slice(0, 5).map((item) => {
              const band = getDashboardBudgetBand(item, budgetScale);
              return (
                <div key={item.budgetId} className="min-w-0">
                  <div className="mb-1.5 flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-[11px] font-bold text-[#45647D]" title={item.name}>{item.name}</span>
                    <span className="min-w-0 text-right text-[11px] font-bold tabular-nums">
                      <span className={item.percent > 100 ? "text-[#D94F6A]" : "text-[#426780]"}>{item.percent}%</span>
                      <span className="ml-2 inline-block text-[#93A4B5]">{formatVND(item.spent)} / {formatVND(item.limit)}</span>
                    </span>
                  </div>
                  <div role="progressbar" aria-label={item.name + ": đã sử dụng " + item.percent + "% ngân sách"} aria-valuemin={0} aria-valuemax={Math.max(100, item.percent)} aria-valuenow={Math.min(Math.max(item.percent, 0), Math.max(100,item.percent))} className="relative h-3.5 overflow-hidden rounded-md bg-[#EEF3F8]">
                    {band.hasLimit ? <div aria-hidden="true" className="absolute inset-y-0 z-10 w-[2px] bg-[#486981]/70" style={{ left: Math.min(99.7, band.markerPercent) + "%" }} /> : null}
                    <div aria-hidden="true" className="flex h-full overflow-hidden rounded-md" style={{ width: Math.min(100,band.basePercent + band.excessPercent) + "%" }}>
                      <div className="h-full shrink-0 bg-[#8EBFE3]" style={{ width: band.basePercent / Math.max(band.basePercent + band.excessPercent, 1) * 100 + "%" }} />
                      <div className="h-full flex-1 bg-[#EE7389]" />
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-[#8B9EAF]">{budgetScale}% là mốc cao nhất trên cùng thang đo{budgetRows.length > 5 ? " · Hiển thị 5/" + budgetRows.length + " mục" : ""}</p>
          </div>
        )}
      </ChartCard>

      <ChartCard title="Số dư theo ví" hint="Số dư hiện tại" className="lg:col-span-5">
        {!walletsReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : walletRows.length === 0 ? (
          <div className="mt-4"><EmptyChart>Chưa có ví với số dư dương</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="wallets" className="mt-4 flex flex-1 flex-col justify-center">
            <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#8A9FB2]">Tổng số dư dương</p>
            <p className="mt-1 break-words text-xl font-extrabold tracking-tight tabular-nums text-[#183C5A] sm:text-[24px]">{formatVND(positiveWalletTotal)}</p>
            <div role="img" aria-label={"Phân bổ số dư dương: " + displayedWallets.map((w) => w.name + " " + Math.round(w.sharePercent) + "%").join(", ")} className="mt-4 flex h-[31px] w-full gap-1 overflow-hidden rounded-xl bg-[#EDF4FA] p-[3px]">
              {displayedWallets.map((wallet, index) => (
                <div key={wallet.id} title={wallet.name + ": " + formatVND(wallet.balance)} className="h-full min-w-0 rounded-md" style={{ width: wallet.sharePercent + "%", backgroundColor: WALLET_COLORS[index % WALLET_COLORS.length] }} />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {displayedWallets.map((wallet, index) => (
                <div key={wallet.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[#E8EFF6] bg-[#F9FBFE] px-2.5 py-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[4px]" style={{ backgroundColor: WALLET_COLORS[index % WALLET_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#5C7389]" title={wallet.name}>{wallet.name}</span>
                  <span className="min-w-0 shrink-0 text-right">
                    <strong className="block text-[10px] font-extrabold tabular-nums text-[#244C68] sm:text-[11px]">{formatVND(wallet.balance)}</strong>
                    <span className="block text-[10px] font-semibold tabular-nums text-[#94A5B6]">{Math.round(wallet.sharePercent)}%</span>
                  </span>
                </div>
              ))}
            </div>
            {negativeWalletCount > 0 ? <p className="mt-3 text-[10px] font-semibold text-amber-700">{negativeWalletCount} ví số dư âm không nằm trong tổng số dư dương</p> : null}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
