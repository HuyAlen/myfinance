"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useOnboarding } from "./OnboardingProvider";

/**
 * AchievementToast — shows a celebration card when a checklist achievement is earned.
 * Auto-dismisses after 4 seconds. Fires whenever pendingAchievement changes.
 */
export function AchievementToast() {
  const { pendingAchievement, clearPendingAchievement } = useOnboarding();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pendingAchievement) return;

    const showFrame = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    const hideTimer = window.setTimeout(() => {
      setVisible(false);
    }, 4000);

    const clearTimer = window.setTimeout(() => {
      clearPendingAchievement();
    }, 4300);

    return () => {
      window.cancelAnimationFrame(showFrame);
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearTimer);
    };
  }, [pendingAchievement, clearPendingAchievement]);

  if (!pendingAchievement) return null;

  return (
    <div
      className={[
        "fixed bottom-24 right-4 z-300 transition-all duration-300 lg:bottom-6",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-emerald-200 bg-white px-4 py-3.5 shadow-2xl shadow-emerald-100/80">
        {/* Animated check */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 text-2xl shadow-md shadow-emerald-200/60">
          {pendingAchievement.emoji}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-600">
            Thành tích mới!
          </p>
          <p className="text-sm font-black text-slate-900">
            {pendingAchievement.title}
          </p>
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(clearPendingAchievement, 300);
          }}
          className="ml-1 shrink-0 text-slate-300 transition-colors hover:text-slate-500"
        >
          <X size={14} />
        </button>
      </div>

      {/* Auto-dismiss progress bar */}
      {visible && (
        <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-emerald-100">
          <div
            className="h-full bg-emerald-500"
            style={{
              animation: "shrink-width 4s linear forwards",
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes shrink-width {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

/**
 * ChecklistBadge — small floating badge showing checklist progress.
 * Hidden once fully onboarded.
 */
export function ChecklistBadge() {
  const { checklistCount, checklistTotal, isFullyOnboarded, wizardDone } =
    useOnboarding();

  // Don't show if wizard not started or fully onboarded
  if (!wizardDone || isFullyOnboarded) return null;

  const pct = Math.round((checklistCount / checklistTotal) * 100);

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 py-1.5 shadow-md shadow-emerald-100/60">
      <CheckCircle2 size={14} className="text-emerald-600" />
      <span className="text-xs font-black text-slate-700">
        {checklistCount}/{checklistTotal}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: pct + "%" }}
        />
      </div>
    </div>
  );
}
