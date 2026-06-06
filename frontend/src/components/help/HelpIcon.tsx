"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";

type HelpIconProps = {
  term: string;
  explanation: string;
  formula?: string;
  position?: "top" | "bottom";
};

/**
 * Reusable ? tooltip for financial terms.
 * Usage: <HelpIcon term="ROI" explanation="Return on Investment..." formula="ROI = (V - C) / C × 100%" />
 */
export function HelpIcon({
  term,
  explanation,
  formula,
  position = "top",
}: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Giải thích ${term}`}
        className="flex size-4 items-center justify-center rounded-full bg-blue-100 text-blue-500 transition-colors hover:bg-blue-200 hover:text-blue-700 focus:outline-none"
      >
        <HelpCircle size={10} />
      </button>

      {open && (
        <div
          className={[
            "absolute left-0 z-50 w-64 rounded-2xl border border-blue-100 bg-white p-4 shadow-xl shadow-blue-100/60",
            position === "top" ? "bottom-6" : "top-6",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-black text-blue-700">{term}</p>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 text-slate-400 transition-colors hover:text-slate-700"
            >
              <X size={12} />
            </button>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            {explanation}
          </p>
          {formula && (
            <div className="mt-2.5 rounded-xl bg-blue-50 px-3 py-2">
              <p className="font-mono text-[11px] font-bold text-blue-700">
                {formula}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
