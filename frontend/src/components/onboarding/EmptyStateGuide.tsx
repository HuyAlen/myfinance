"use client";

import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

type EmptyStateGuideProps = {
  /** Main icon to display (Lucide component) */
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  title: string;
  description: string;
  /** Primary CTA */
  cta: { label: string; href: string; onClick?: () => void };
  /** Optional secondary action */
  secondary?: { label: string; href: string };
  /** Link to help center guide for this feature */
  helpHref?: string;
  /** Accent color scheme */
  accent?: "blue" | "emerald" | "violet" | "cyan" | "rose" | "amber";
};

const ACCENT_MAP = {
  blue: {
    icon: "bg-blue-50 text-blue-400",
    btn: "bg-blue-600 shadow-blue-200/60 hover:bg-blue-700",
    ring: "ring-blue-100",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-400",
    btn: "bg-emerald-600 shadow-emerald-200/60 hover:bg-emerald-700",
    ring: "ring-emerald-100",
  },
  violet: {
    icon: "bg-violet-50 text-violet-400",
    btn: "bg-violet-600 shadow-violet-200/60 hover:bg-violet-700",
    ring: "ring-violet-100",
  },
  cyan: {
    icon: "bg-cyan-50 text-cyan-400",
    btn: "bg-cyan-600 shadow-cyan-200/60 hover:bg-cyan-700",
    ring: "ring-cyan-100",
  },
  rose: {
    icon: "bg-rose-50 text-rose-400",
    btn: "bg-rose-600 shadow-rose-200/60 hover:bg-rose-700",
    ring: "ring-rose-100",
  },
  amber: {
    icon: "bg-amber-50 text-amber-400",
    btn: "bg-amber-600 shadow-amber-200/60 hover:bg-amber-700",
    ring: "ring-amber-100",
  },
};

/**
 * EmptyStateGuide — contextual empty state with primary CTA + optional Help link.
 * Drop-in replacement for any empty state across the app.
 */
export function EmptyStateGuide({
  icon: Icon,
  title,
  description,
  cta,
  secondary,
  helpHref,
  accent = "blue",
}: EmptyStateGuideProps) {
  const theme = ACCENT_MAP[accent];

  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      {/* Icon */}
      <div
        className={[
          "flex size-24 items-center justify-center rounded-[2rem] ring-8",
          theme.icon,
          theme.ring,
        ].join(" ")}
      >
        <Icon size={36} strokeWidth={1.5} />
      </div>

      {/* Text */}
      <h3 className="mt-6 text-lg font-black text-slate-800">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
        {description}
      </p>

      {/* Actions */}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {cta.onClick ? (
          <button
            onClick={cta.onClick}
            className={[
              "flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95",
              theme.btn,
            ].join(" ")}
          >
            {cta.label}
            <ArrowRight size={14} />
          </button>
        ) : (
          <Link
            href={cta.href}
            className={[
              "flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95",
              theme.btn,
            ].join(" ")}
          >
            {cta.label}
            <ArrowRight size={14} />
          </Link>
        )}

        {secondary && (
          <Link
            href={secondary.href}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
          >
            {secondary.label}
          </Link>
        )}
      </div>

      {/* Help link */}
      {helpHref && (
        <Link
          href={helpHref}
          className="mt-5 flex items-center gap-1.5 text-xs font-bold text-blue-500 transition-colors hover:text-blue-700 hover:underline"
        >
          <BookOpen size={12} />
          Xem hướng dẫn chi tiết
        </Link>
      )}
    </div>
  );
}
