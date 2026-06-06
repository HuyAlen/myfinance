"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChartPie,
  Plus,
  ReceiptText,
  Target,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useOnboarding } from "./OnboardingProvider";

const QUICK_ACTIONS = [
  {
    label: "Thêm giao dịch",
    href: "/transactions",
    icon: ReceiptText,
    cls: "bg-blue-600 shadow-blue-200/60 hover:bg-blue-700",
  },
  {
    label: "Tạo ví tiền",
    href: "/wallets",
    icon: Wallet,
    cls: "bg-emerald-600 shadow-emerald-200/60 hover:bg-emerald-700",
  },
  {
    label: "Tạo mục tiêu",
    href: "/goals",
    icon: Target,
    cls: "bg-violet-600 shadow-violet-200/60 hover:bg-violet-700",
  },
  {
    label: "Tạo ngân sách",
    href: "/budgets",
    icon: ChartPie,
    cls: "bg-cyan-600 shadow-cyan-200/60 hover:bg-cyan-700",
  },
];

/**
 * QuickActionFab — floating action button with expandable quick actions.
 * Visible only when wizard is done and user is NOT fully onboarded.
 */
export default function QuickActionFab() {
  const { wizardDone, isFullyOnboarded } = useOnboarding();
  const [open, setOpen] = useState(false);

  // Hide if wizard not done or user is fully onboarded
  if (!wizardDone || isFullyOnboarded) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[100] flex flex-col items-end gap-2 lg:bottom-6">
      {/* Action items */}
      {open && (
        <div className="flex flex-col items-end gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setOpen(false)}
                className={[
                  "flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95",
                  action.cls,
                ].join(" ")}
              >
                <Icon size={15} />
                {action.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Main FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Đóng menu nhanh" : "Thao tác nhanh"}
        className={[
          "flex size-14 items-center justify-center rounded-[1.25rem] shadow-xl transition-all duration-200 active:scale-95",
          open
            ? "bg-slate-700 shadow-slate-300/50 hover:bg-slate-800 rotate-45"
            : "bg-blue-600 shadow-blue-300/60 hover:bg-blue-700 hover:scale-105",
        ].join(" ")}
      >
        {open ? (
          <X size={22} className="text-white" />
        ) : (
          <Zap size={22} className="text-white" />
        )}
      </button>
    </div>
  );
}
