"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  ChartPie,
  ChevronRight,
  Coins,
  CreditCard,
  Gamepad2,
  House,
  Landmark,
  Layers,
  ReceiptText,
  ShoppingCart,
  UtensilsCrossed,
  Wallet as WalletIcon,
} from "lucide-react";
import {
  buildBudgetsHref,
  buildTransactionsHref,
  buildWalletsHref,
} from "@/src/lib/navigation/financeNavigation";
import {
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


const WALLET_ICON_TONES = [
  "bg-[#E9F9F2] text-[#129C73]",
  "bg-[#FFF0F1] text-[#D95470]",
  "bg-[#EAF4FF] text-[#2F80D9]",
  "bg-[#FFF4E7] text-[#C47A24]",
  "bg-[#F0EDFF] text-[#7561BF]",
];

function BudgetCategoryGlyph({ name }: { name: string }) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d");
  const isShopping = /mua sam|tieu dung|shopping/.test(normalized);
  const isEntertainment = /giai tri|giai khuay|game/.test(normalized);
  const isFood = /an uong|sinh hoat|thuc pham|food/.test(normalized);
  const isFamily = /gia dinh|con cai|family/.test(normalized);
  const Icon = isShopping
    ? ShoppingCart
    : isEntertainment
      ? Gamepad2
      : isFood
        ? UtensilsCrossed
        : isFamily
          ? House
          : ReceiptText;
  const tone = isShopping
    ? "bg-[#FFF0E7] text-[#E98342]"
    : isEntertainment
      ? "bg-[#F3EAFF] text-[#9654CE]"
      : isFood
        ? "bg-[#E2F8EF] text-[#159A6C]"
        : "bg-[#E8F2FF] text-[#337CE0]";

  return (
    <span aria-hidden="true" className={"flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 " + tone}>
      <Icon size={20} strokeWidth={2.1} />
    </span>
  );
}

function WalletCategoryGlyph({ type, index }: { type?: Wallet["type"]; index: number }) {
  const Icon =
    type === "cash" ? Banknote :
    type === "bank" ? Landmark :
    type === "ewallet" ? CreditCard :
    type === "investment" ? Coins : Layers;

  return (
    <span
      aria-hidden="true"
      className={"flex size-10 shrink-0 items-center justify-center rounded-xl " + WALLET_ICON_TONES[index % WALLET_ICON_TONES.length]}
    >
      <Icon size={18} strokeWidth={2.1} />
    </span>
  );
}

function LoadingChart({ height = "h-48" }: { height?: string }) {
  return <div aria-label="Đang tải biểu đồ" className={height + " animate-pulse rounded-2xl bg-[#F0F6FC]"} />;
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-[#DCE8F3] bg-[#F8FBFE] px-4 text-center text-[13px] font-semibold text-[#4F687F]">
      {children}
    </div>
  );
}

function ChartCard({
  title,
  hint,
  subtitle,
  icon,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-dashboard-polish-panel="true"
      className={
        "min-w-0 overflow-hidden rounded-[22px] border border-[#CFDEEA] bg-white p-3.5 shadow-[0_10px_28px_-20px_rgba(28,75,120,0.30)] transition-shadow duration-200 hover:shadow-[0_16px_36px_-24px_rgba(28,75,120,0.32)] sm:p-5 " +
        className
      }
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2.5 border-b border-[#EFF3F8] pb-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {icon ? (
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF2FF] text-[#357DDF]">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold leading-6 tracking-tight text-[#294A66] sm:text-[16px]">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-[11px] font-semibold leading-4 text-[#607A91] sm:text-[12px]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {hint ? (
          <span data-dashboard-polish-hint="true" className="inline-flex min-h-8 max-w-full shrink-0 items-center rounded-lg border border-[#E0EAF3] bg-[#F8FBFE] px-2.5 text-[11px] font-bold text-[#54708A] sm:text-[12px]">
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
  const overBudgetCount = budgetRows.filter((item) => item.limit > 0 && item.spent > item.limit).length;
  const positiveWalletTotal = walletRows.reduce((sum, item) => sum + item.balance, 0);
  
  const negativeWalletCount = wallets.filter(
    (wallet) => Number.isFinite(wallet.balance) && wallet.balance < 0,
  ).length;

  return (
    <div
      data-dashboard-chart-first-grid="true"
      className="grid min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-12 lg:gap-4"
    >
      <ChartCard
        title="Mức dùng ngân sách"
        subtitle="Mỗi thanh thể hiện 0–100% hạn mức"
        hint={monthMode ? "Tháng " + month + "/" + year : "Theo tháng"}
        icon={<BarChart3 size={18} />}
        className="flex flex-col lg:col-span-7"
      >
        {!monthMode ? (
          <div className="mt-4"><EmptyChart>Chọn bộ lọc Tháng để xem ngân sách</EmptyChart></div>
        ) : !budgetReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : budgetRows.length === 0 ? (
          <div className="mt-4"><EmptyChart>Tháng này chưa có ngân sách</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="budgets" className="mt-3 flex min-w-0 flex-1 flex-col gap-2">
            <div data-dashboard-budget-caption="true" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] font-semibold leading-5 text-[#48647B]">
              <span>Ưu tiên các danh mục cần chú ý</span>
              <span className={overBudgetCount > 0 ? "font-bold text-[#B83E57]" : "text-[#37688A]"}>{overBudgetCount}/{budgetRows.length} danh mục vượt mức</span>
            </div>
            {budgetRows.slice(0, 4).map((item) => {
              const hasLimit = item.limit > 0;
              const isOverBudget = hasLimit && item.spent > item.limit;
              const isAtLimit = hasLimit && item.spent === item.limit;
              const badgeTone = isOverBudget
                ? "bg-[#FCE8EC] text-[#B83E57]"
                : isAtLimit
                  ? "bg-[#FFF2D8] text-[#9F671E]"
                  : hasLimit
                    ? "bg-[#EAF4FC] text-[#2F719E]"
                    : "bg-[#E9EFF5] text-[#526A80]";

              return (
                <Link
                  data-dashboard-budget-row="true"
                  data-dashboard-budget-drilldown="transactions"
                  data-dashboard-polish-row="true"
                  key={item.budgetId}
                  href={buildTransactionsHref({ categoryId: item.categoryId, month: item.month, type: "expense" })}
                  aria-label={"Xem giao dịch danh mục " + item.name + " tháng " + item.month.slice(5, 7) + "/" + item.month.slice(0, 4)}
                  className="group grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-2.5 rounded-xl border border-[#DFE9F3] bg-[#F9FCFF] p-3 transition-colors duration-200 hover:border-[#A9CBE8] hover:bg-[#F3F9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3987E8] focus-visible:ring-offset-2 sm:grid-cols-[44px_minmax(0,1fr)_112px] sm:gap-3"
                >
                  <BudgetCategoryGlyph name={item.name} />
                  <div className="min-w-0">
                    <span data-dashboard-budget-name="true" className="block min-w-0 break-words text-[13px] font-extrabold leading-5 text-[#294A66] sm:text-[14px]" title={item.name}>{item.name}</span>
                    <div className="mt-1 grid min-w-0 grid-cols-2 gap-x-2.5 sm:max-w-[350px]">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold leading-4 text-[#587189]">Đã chi</p>
                        <span data-dashboard-budget-value="true" className="block min-w-0 break-words text-[13px] font-extrabold leading-5 tabular-nums text-[#2F506C]">{formatVND(item.spent)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold leading-4 text-[#587189]">Hạn mức</p>
                        <span data-dashboard-budget-limit="true" className="block min-w-0 break-words text-[13px] font-extrabold leading-5 tabular-nums text-[#2F506C]">{hasLimit ? formatVND(item.limit) : "Chưa thiết lập"}</span>
                      </div>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={item.name + ": mức dùng ngân sách"}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={item.fillPercent}
                      aria-valuetext={hasLimit ? item.percent + "% đã dùng, " + (isOverBudget ? "vượt " + formatVND(item.overAmount) : "còn " + formatVND(Math.max(0, item.remaining))) : "Chưa đặt hạn mức"}
                      className="mt-2 h-2 overflow-hidden rounded-full bg-[#E3EDF5]"
                    >
                      <div aria-hidden="true" className={"h-full rounded-full " + (isOverBudget ? "bg-[#DB526B]" : isAtLimit ? "bg-[#E8AD49]" : "bg-[#4298CE]")} style={{ width: item.fillPercent + "%" }} />
                    </div>
                    <p data-dashboard-budget-explanation="true" className={"mt-1 text-[12px] font-bold leading-5 tabular-nums " + (isOverBudget ? "text-[#B83E57]" : isAtLimit ? "text-[#9F671E]" : "text-[#426780]")}>
                      {!hasLimit ? "Chưa có hạn mức để so sánh" : isOverBudget ? "Vượt " + formatVND(item.overAmount) : isAtLimit ? "Đã dùng hết hạn mức" : "Còn " + formatVND(Math.max(0, item.remaining))}
                    </p>
                  </div>
                  <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between">
                    <span data-dashboard-budget-percent="true" className={"inline-flex shrink-0 rounded-lg px-2 py-0.5 text-[12px] font-extrabold tabular-nums " + badgeTone}>
                      {hasLimit ? item.percent + "% đã dùng" : "Chưa đặt hạn mức"}
                    </span>
                    <span aria-hidden="true" className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-[#DCE8F3] bg-white px-2 text-[11px] font-bold text-[#2874BC] transition group-hover:border-[#AFCAE6] group-hover:text-[#125F9D]">
                      Xem giao dịch
                      <ArrowUpRight size={13} />
                    </span>
                  </div>
                </Link>
              );
            })}
            {budgetRows.length > 4 ? (
              <Link
                href={buildBudgetsHref()}
                className="mt-1 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE9F3] bg-white px-3 text-[12px] font-bold text-[#336C9C] transition hover:border-[#B2CEE6] hover:bg-[#F4F9FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                Xem tất cả {budgetRows.length} danh mục ngân sách
                <ArrowUpRight size={14} />
              </Link>
            ) : null}
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Số dư theo ví"
        hint="Số dư hiện tại"
        icon={<WalletIcon size={18} />}
        className="flex flex-col lg:col-span-5"
      >
        {!walletsReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : walletRows.length === 0 ? (
          <div className="mt-4"><EmptyChart>Chưa có ví với số dư dương</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="wallets" className="mt-3 flex min-w-0 flex-1 flex-col gap-3">
            <div data-dashboard-polish-summary="true" className="rounded-2xl border border-[#DAE8F4] bg-[#F5FAFF] p-3 sm:p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E2] text-[#DB8B2E]">
                  <Coins size={21} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#516E86]">Tổng số dư dương</p>
                  <p data-dashboard-polish-amount="true" className="mt-0.5 break-words text-[22px] font-extrabold leading-7 tracking-tight tabular-nums text-[#183C5A] sm:text-[25px]">{formatVND(positiveWalletTotal)}</p>
                </div>
              </div>
              <div
                role="img"
                aria-label={"Phân bổ số dư dương: " + displayedWallets.map((w) => w.name + " " + Math.round(w.sharePercent) + "%").join(", ")}
                className="mt-3 flex h-6 w-full min-w-0 gap-1 overflow-hidden rounded-lg bg-[#E5EEF7] p-[3px]"
              >
                {displayedWallets.map((wallet, index) => (
                  <span
                    key={wallet.id}
                    title={wallet.name + ": " + formatVND(wallet.balance)}
                    className="h-full min-w-0 rounded-[5px]"
                    style={{ flexGrow: wallet.sharePercent, flexBasis: 0, backgroundColor: WALLET_COLORS[index % WALLET_COLORS.length] }}
                  />
                ))}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2">
              {displayedWallets.map((wallet, index) => (
                <Link
                  key={wallet.id}
                  data-dashboard-polish-row="true"
                  data-dashboard-wallet-row="true"
                  href={wallet.id === "dashboard-wallet-other" ? buildWalletsHref() : buildWalletsHref({ walletId: wallet.id })}
                  aria-label={"Xem ví " + wallet.name + ": " + formatVND(wallet.balance)}
                  className="group flex min-h-[62px] min-w-0 items-center gap-2.5 rounded-xl border border-[#DCE8F2] bg-[#FCFEFF] px-2.5 py-2.5 transition-colors duration-200 hover:border-[#B1CEEA] hover:bg-[#F3F9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3987E8] focus-visible:ring-offset-2"
                >
                  <WalletCategoryGlyph type={"type" in wallet ? wallet.type : undefined} index={index} />
                  <span data-dashboard-wallet-name="true" className="min-w-0 flex-1 break-words text-[13px] font-bold leading-[1.3] text-[#324F67]" title={wallet.name}>{wallet.name}</span>
                  <div className="flex min-w-[91px] shrink-0 flex-col items-end gap-0.5">
                    <span data-dashboard-wallet-percent="true" className="text-[12px] font-bold leading-4 tabular-nums text-[#587791]">{Math.round(wallet.sharePercent)}%</span>
                    <strong data-dashboard-wallet-amount="true" className="whitespace-nowrap text-[13px] font-extrabold leading-5 tabular-nums text-[#173E5B]">{formatVND(wallet.balance)}</strong>
                  </div>
                  <ChevronRight aria-hidden="true" size={15} className="shrink-0 text-[#93AFC7] transition-colors group-hover:text-[#2F80D9]" />
                </Link>
              ))}
            </div>
            {negativeWalletCount > 0 ? (
              <p className="text-[12px] font-semibold leading-5 text-amber-700">{negativeWalletCount} ví số dư âm không nằm trong tổng số dư dương</p>
            ) : null}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Dòng tiền hoạt động" subtitle={"Thu – chi năm " + year} hint={"Năm " + year} icon={<BarChart3 size={18} />} className="flex flex-col lg:col-span-7">
        {cashFlowReady && cashFlowChart ? (
          <div data-dashboard-visual-chart="cash-flow" className="flex min-h-[275px] flex-1 flex-col">
            {cashFlowChart}
          </div>
        ) : (
          <div className="mt-4"><LoadingChart height="h-64" /></div>
        )}
      </ChartCard>

      <ChartCard title="Chi tiêu theo danh mục" hint="Kỳ đang chọn" icon={<ChartPie size={18} />} className="flex flex-col lg:col-span-5">
        {!spendingReady ? (
          <div className="mt-4"><LoadingChart /></div>
        ) : totalExpense <= 0 ? (
          <div className="mt-4"><EmptyChart>Chưa có khoản chi thực tế trong kỳ</EmptyChart></div>
        ) : (
          <div data-dashboard-visual-chart="expenses" className="mt-4 flex min-h-[260px] flex-1 flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[.10em] text-[#456078]">Tổng chi thực tế</p>
                <p className="mt-1 break-words text-xl font-extrabold tracking-tight tabular-nums text-[#183C5A] sm:text-2xl">{formatVND(totalExpense)}</p>
              </div>
              <p className="text-right text-[12px] font-semibold text-[#4E6880]">{expenses.length} nhóm chi tiêu</p>
            </div>

            {/* iPhone: a proportional list is readable even when a tile would be shorter than its label. */}
            <div data-dashboard-mobile-expense-list="true" role="list" aria-label="Chi tiêu theo danh mục" className="grid min-w-0 gap-2 sm:hidden">
              {expenses.map((item, index) => {
                const share = (item.value / totalExpense) * 100;
                return (
                  <div role="listitem" key={item.name + index} className="min-w-0 rounded-xl border border-[#DFE9F2] bg-[#F9FCFF] px-3 py-2.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span data-dashboard-mobile-expense-name="true" className="min-w-0 flex-1 whitespace-normal break-words text-[13px] font-bold leading-[1.4] text-[#294A66]">{item.name}</span>
                      <strong className="shrink-0 text-[13px] font-extrabold tabular-nums text-[#335C7C]">{Math.round(share)}%</strong>
                    </div>
                    <p data-dashboard-mobile-expense-amount="true" className="mt-1 break-words text-[13px] font-semibold tabular-nums text-[#44647D]">{formatVND(item.value)}</p>
                    <div aria-hidden="true" className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E6EEF6]">
                      <div className="h-full rounded-full" style={{ width: Math.min(100, share) + "%", backgroundColor: EXPENSE_COLORS[index % EXPENSE_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div role="img" aria-label={"Cơ cấu chi tiêu: " + expenses.map((item) => item.name + " " + Math.round(item.value / totalExpense * 100) + "%").join(", ")} className="hidden h-[252px] min-h-0 w-full gap-1.5 overflow-hidden rounded-2xl sm:flex sm:h-[268px]">
              {mosaic.map((column, columnIndex) => (
                <div key={columnIndex} className="flex min-w-0 flex-col gap-1.5" style={{ width: column.widthPercent + "%" }}>
                  {column.tiles.map((item, index) => {
                    const colorIndex = columnIndex === 0 ? index : index + 2;
                    return (
                      <div key={item.name + index} title={item.name + ": " + formatVND(item.value)} className="relative flex min-h-0 flex-col justify-between gap-1 overflow-hidden rounded-xl bg-[#2F80C3] p-2.5 text-white sm:p-3" style={{ flex: item.value, backgroundColor: EXPENSE_COLORS[colorIndex % EXPENSE_COLORS.length] }}>
                        <span data-dashboard-expense-name="true" className="relative min-w-0 whitespace-normal break-words text-[12px] font-extrabold leading-[1.25] text-white sm:text-[13px]" title={item.name}>{item.name}</span>
                        <div className="relative mt-auto min-w-0">
                          <strong className="block text-[15px] font-extrabold leading-tight tabular-nums text-white sm:text-[18px]">{Math.round(item.sharePercent)}%</strong>
                          <span data-dashboard-expense-amount="true" className="mt-0.5 block min-w-0 whitespace-normal break-words text-[12px] font-extrabold leading-4 tabular-nums text-white sm:text-[13px]">{formatVND(item.value)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
