"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartPie,
  ReceiptText,
  Target,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { buildQuickActionCreateHref } from "@/src/lib/navigation/quickActionIntent";

const QUICK_ACTIONS = [
  {
    label: "Thêm giao dịch",
    href: buildQuickActionCreateHref("/transactions"),
    icon: ReceiptText,
    cls: "bg-blue-600 shadow-blue-200/60 hover:bg-blue-700",
  },
  {
    label: "Tạo ví tiền",
    href: buildQuickActionCreateHref("/wallets"),
    icon: Wallet,
    cls: "bg-emerald-600 shadow-emerald-200/60 hover:bg-emerald-700",
  },
  {
    label: "Tạo mục tiêu",
    href: buildQuickActionCreateHref("/goals"),
    icon: Target,
    cls: "bg-violet-600 shadow-violet-200/60 hover:bg-violet-700",
  },
  {
    label: "Tạo ngân sách",
    href: buildQuickActionCreateHref("/budgets"),
    icon: ChartPie,
    cls: "bg-cyan-600 shadow-cyan-200/60 hover:bg-cyan-700",
  },
];

/**
 * QuickActionFab — the app's one persistent, canonical "Làm gì" (action)
 * entry point: a floating button that expands into shortcuts for the most
 * common create-flows. Lives in layout/ (not onboarding/, where it used to
 * be) because it's a permanent navigation-adjacent control, not an
 * onboarding nudge — it must never disappear once a user finishes their
 * onboarding checklist. It intentionally has NO dependency on
 * OnboardingProvider/useOnboarding: closing this menu must not affect AI,
 * and finishing onboarding must not affect this.
 */
export default function QuickActionFab() {
  const router = useRouter();
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);

  function selectAction(href: string) {
    // Close synchronously, before kicking off navigation, so the expanded
    // menu never stays visible mid-transition (including a same-page
    // re-tap, which doesn't unmount this component at all).
    setIsQuickActionOpen(false);
    router.push(href);
  }

  return (
    <div className="fixed bottom-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] right-4 z-100 flex flex-col items-end gap-2 lg:bottom-6">
      {/* Action items */}
      {isQuickActionOpen && (
        <div className="flex flex-col items-end gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.href}
                type="button"
                onClick={() => selectAction(action.href)}
                className={[
                  "flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95",
                  action.cls,
                ].join(" ")}
              >
                <Icon size={15} />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Main FAB button */}
      <button
        type="button"
        onClick={() => setIsQuickActionOpen((v) => !v)}
        aria-label={
          isQuickActionOpen ? "Đóng thao tác nhanh" : "Mở thao tác nhanh"
        }
        className={[
          "flex size-14 items-center justify-center rounded-[1.25rem] shadow-xl transition-all duration-200 active:scale-95",
          isQuickActionOpen
            ? "bg-slate-700 shadow-slate-300/50 hover:bg-slate-800 rotate-45"
            : "bg-blue-600 shadow-blue-300/60 hover:bg-blue-700 hover:scale-105",
        ].join(" ")}
      >
        {isQuickActionOpen ? (
          <X size={22} className="text-white" />
        ) : (
          <Zap size={22} className="text-white" />
        )}
      </button>
    </div>
  );
}
