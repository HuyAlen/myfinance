"use client";

import { Goal, PiggyBank, ReceiptText, WalletCards } from "lucide-react";

import type { AIFinanceContext } from "@/src/services/finance/ai-agent/aiFinanceContext";

type AIQuickStatsProps = {
  context: AIFinanceContext | null;
};

export default function AIQuickStats({ context }: AIQuickStatsProps) {
  if (!context) return null;

  const stats = [
    { label: "Ví", value: context.counts.wallets, icon: WalletCards },
    {
      label: "Giao dịch",
      value: context.counts.transactions,
      icon: ReceiptText,
    },
    { label: "Ngân sách", value: context.counts.budgets, icon: PiggyBank },
    { label: "Mục tiêu", value: context.counts.goals, icon: Goal },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white px-2 py-2.5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:py-3"
          >
            <div className="mx-auto mb-1 flex size-7 items-center justify-center rounded-xl bg-slate-50 text-slate-500 sm:size-8">
              <Icon size={14} />
            </div>
            <p className="text-sm font-black text-slate-900 sm:text-base">
              {stat.value}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-bold text-slate-400 sm:text-[11px]">
              {stat.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
