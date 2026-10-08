import type { ReactNode } from "react";

export function HeroMetric({
  label,
  value,
  note,
  icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone: "blue" | "emerald" | "amber" | "violet";
}) {
  const styles = {
    blue: "bg-[#EAF3FC] text-[#2F80ED]",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-[#EEF3FA] text-[#587A9B]",
  };

  return (
    <div className="rounded-2xl border border-[#E3EAF1] bg-[#F8FBFE] p-3 sm:p-3.5">
      <div className="flex items-center justify-between gap-2.5">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#61788F] sm:text-[10px]">
          {label}
        </p>
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-lg sm:size-8 ${styles[tone]}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-2 wrap-break-word text-[16px] font-black leading-tight tabular-nums text-[#36536B] sm:text-lg">
        {value}
      </p>

      <p className="mt-1 text-[10px] font-semibold leading-4 text-[#8CA0B3] sm:text-[11px]">
        {note}
      </p>
    </div>
  );
}

export function SavingsInfoTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "emerald" | "rose";
}) {
  const styles = {
    blue: "text-[#2F80ED]",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
  };

  return (
    <div className="min-w-0 rounded-xl border border-[#E8EEF4] bg-[#F8FBFE] px-2.5 py-2.5 sm:p-3">
      <p className="text-[8px] font-black uppercase leading-3 tracking-wide text-[#8CA0B3] sm:text-[9px]">
        {label}
      </p>
      <p
        className={`mt-1 wrap-break-word text-[10px] font-black leading-tight tracking-tight sm:text-sm ${styles[tone]}`}
      >
        {value}
      </p>
    </div>
  );
}