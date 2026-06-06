"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Rocket,
  X,
} from "lucide-react";
import { CHECKLIST_ITEMS, useOnboarding } from "./OnboardingProvider";

/**
 * OnboardingChecklist — collapsible floating panel showing setup progress.
 * Appears after wizard is done, hidden once fully onboarded.
 */
export default function OnboardingChecklist() {
  const {
    wizardDone,
    isFullyOnboarded,
    checklist,
    checklistCount,
    checklistTotal,
    completeChecklistItem,
    resetOnboarding,
  } = useOnboarding();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  if (!wizardDone || isFullyOnboarded || dismissed) return null;

  const pct = Math.round((checklistCount / checklistTotal) * 100);

  return (
    <div className="fixed bottom-24 left-4 z-[100] w-72 overflow-hidden rounded-[1.5rem] border border-emerald-200 bg-white shadow-2xl shadow-emerald-100/60 lg:bottom-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Rocket size={14} className="text-emerald-600" />
          <p className="text-sm font-black text-slate-800">
            Thiết lập tài khoản
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex size-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-700"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex size-6 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-700"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500">
            {checklistCount} / {checklistTotal} hoàn thành
          </p>
          <p className="text-xs font-black text-emerald-600">{pct}%</p>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
            style={{ width: pct + "%" }}
          />
        </div>
      </div>

      {/* Checklist items */}
      {expanded && (
        <div className="space-y-0.5 px-3 py-3">
          {CHECKLIST_ITEMS.map((item) => {
            const done = !!checklist[item.id];
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-50"
              >
                <button
                  onClick={() => completeChecklistItem(item.id)}
                  className="shrink-0 transition-all active:scale-90"
                  disabled={done}
                >
                  {done ? (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  ) : (
                    <Circle size={18} className="text-slate-300" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      "truncate text-[13px] font-bold",
                      done ? "text-slate-400 line-through" : "text-slate-800",
                    ].join(" ")}
                  >
                    {item.label}
                  </p>
                </div>
                {!done && (
                  <Link
                    href={item.href}
                    onClick={() => completeChecklistItem(item.id)}
                    className="shrink-0 rounded-lg bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600 transition-colors hover:bg-blue-100"
                  >
                    Làm
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-2.5">
          <div className="flex items-center justify-between">
            <Link
              href="/help"
              className="text-[11px] font-bold text-blue-600 transition-colors hover:underline"
            >
              Xem hướng dẫn
            </Link>
            <button
              onClick={resetOnboarding}
              className="text-[11px] text-slate-400 transition-colors hover:text-slate-600"
            >
              Đặt lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
