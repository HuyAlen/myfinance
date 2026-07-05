"use client";

import {
  AlertTriangle,
  Gauge,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import type {
  AIFinanceContext,
  AIFinanceTone,
} from "@/src/services/finance/ai-agent/aiFinanceContext";

type AIContextCardProps = {
  context: AIFinanceContext | null;
};

function toneClass(tone: AIFinanceTone) {
  switch (tone) {
    case "good":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-100 bg-amber-50 text-amber-700";
    case "danger":
      return "border-rose-100 bg-rose-50 text-rose-700";
    default:
      return "border-slate-100 bg-slate-50 text-slate-600";
  }
}

function healthLabel(tone: AIFinanceTone) {
  switch (tone) {
    case "good":
      return "Tốt";
    case "warning":
      return "Cần theo dõi";
    case "danger":
      return "Cần xử lý";
    default:
      return "Đang đọc";
  }
}

export default function AIContextCard({ context }: AIContextCardProps) {
  if (!context) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Gauge size={17} className="text-blue-600" />
          Financial Health
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          AI đang chuẩn bị Finance Context thật để phân tích.
        </p>
      </div>
    );
  }

  const riskyBudgetCount =
    context.budgets.nearLimitCount + context.budgets.overLimitCount;
  const score = Math.max(0, Math.min(100, context.snapshot.healthScore));

  return (
    <div className="rounded-[1.7rem] border border-blue-100 bg-linear-to-br from-white via-blue-50/70 to-cyan-50 p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 sm:text-[11px]">
            Financial Health
          </p>
          <h3 className="mt-1 truncate text-[1.65rem] font-black leading-none text-slate-950 sm:text-3xl">
            {context.snapshot.netWorthLabel}
          </h3>
          <p className="mt-2 text-[11px] font-bold text-slate-400 sm:text-xs">
            Net worth hiện tại • Live context
          </p>
        </div>

        <div
          className={[
            "relative flex size-16 shrink-0 items-center justify-center rounded-3xl border shadow-sm sm:size-18",
            toneClass(context.snapshot.healthTone),
          ].join(" ")}
          title="Điểm sức khỏe tài chính"
        >
          <div className="text-center">
            <p className="text-xl font-black leading-none sm:text-2xl">
              {score}
            </p>
            <p className="mt-1 text-[8px] font-black uppercase leading-3 sm:text-[9px]">
              {healthLabel(context.snapshot.healthTone)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80 shadow-inner sm:h-2">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
        <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            <Wallet size={14} /> Thanh khoản
          </div>
          <p className="mt-1 truncate text-sm font-black text-slate-900 sm:text-base">
            {context.snapshot.liquidBalanceLabel}
          </p>
        </div>

        <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            {context.cashflow.netCashFlow >= 0 ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            Dòng tiền
          </div>
          <p
            className={[
              "mt-1 truncate text-sm font-black sm:text-base",
              context.cashflow.netCashFlow >= 0
                ? "text-emerald-600"
                : "text-rose-600",
            ].join(" ")}
          >
            {context.cashflow.netCashFlowLabel}
          </p>
        </div>

        <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            <PiggyBank size={14} /> Tiết kiệm
          </div>
          <p className="mt-1 truncate text-sm font-black text-slate-900 sm:text-base">
            {context.cashflow.savingRateLabel}
          </p>
        </div>

        <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            <AlertTriangle size={14} /> Ngân sách
          </div>
          <p
            className={[
              "mt-1 truncate text-sm font-black sm:text-base",
              riskyBudgetCount > 0 ? "text-amber-600" : "text-emerald-600",
            ].join(" ")}
          >
            {riskyBudgetCount > 0 ? `${riskyBudgetCount} cảnh báo` : "An toàn"}
          </p>
        </div>
      </div>
    </div>
  );
}
