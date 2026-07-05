"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import type { AIFinanceRuleInsight } from "@/src/services/finance/ai-agent/aiFinanceRules";
import { buildAIFinanceRuleSummary } from "@/src/services/finance/ai-agent/aiFinanceRules";

type AIInsightPanelProps = {
  insights: AIFinanceRuleInsight[];
};

function getIcon(severity: AIFinanceRuleInsight["severity"]) {
  switch (severity) {
    case "success":
      return <CheckCircle2 size={14} />;
    case "warning":
      return <AlertTriangle size={14} />;
    case "danger":
      return <ShieldAlert size={14} />;
    default:
      return <Info size={14} />;
  }
}

function severityClass(severity: AIFinanceRuleInsight["severity"]) {
  switch (severity) {
    case "success":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-100 bg-amber-50 text-amber-700";
    case "danger":
      return "border-rose-100 bg-rose-50 text-rose-700";
    default:
      return "border-blue-100 bg-blue-50 text-blue-700";
  }
}

function severityLabel(severity: AIFinanceRuleInsight["severity"]) {
  switch (severity) {
    case "danger":
      return "Critical";
    case "warning":
      return "Warning";
    case "success":
      return "Good";
    default:
      return "Info";
  }
}

export default function AIInsightPanel({ insights }: AIInsightPanelProps) {
  if (insights.length === 0) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Sparkles size={16} className="text-blue-600" />
            Priority Insights
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 sm:text-xs">
            {buildAIFinanceRuleSummary(insights)}
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">
          AI-5.4
        </span>
      </div>

      <div className="space-y-2">
        {insights.slice(0, 3).map((insight) => (
          <article
            key={insight.id}
            className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:bg-white hover:shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div
                className={[
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border",
                  severityClass(insight.severity),
                ].join(" ")}
              >
                {getIcon(insight.severity)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {severityLabel(insight.severity)}
                  </span>
                </div>
                <h4 className="text-xs font-black text-slate-900">
                  {insight.title}
                </h4>
                <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-5 text-slate-500">
                  {insight.description}
                </p>
                {insight.actionLabel && (
                  <button
                    type="button"
                    className="mt-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-600 transition hover:bg-blue-100"
                  >
                    {insight.actionLabel}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
