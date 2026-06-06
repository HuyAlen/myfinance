"use client";

import { useRef, useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip all non-digit characters and return the raw digit string.
 * "1.000.000" → "1000000", "1,234" → "1234"
 */
export function parseCurrencyInput(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

/**
 * Format a raw digit string using vi-VN thousand dots.
 * "1000000" → "1.000.000", "" → ""
 */
export function formatCurrencyInput(raw: string): string {
  const digits = parseCurrencyInput(raw);
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
}

// ─── Component ────────────────────────────────────────────────────────────────

type CurrencyInputProps = {
  /** Raw numeric string stored in form state, e.g. "1000000" */
  value: string;
  /** Called with the raw digit string on every keystroke, e.g. "1000000" */
  onChange: (raw: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Show a red border + message when truthy */
  error?: string;
  /** Extra className applied to the outer wrapper div */
  className?: string;
  /** Size variant — "md" (default) matches existing form inputs; "lg" is the large transaction amount field */
  size?: "md" | "lg";
  /** Show ₫ prefix icon (default true) */
  showPrefix?: boolean;
};

/**
 * CurrencyInput — formats value as vi-VN thousand-separated number while keeping
 * raw digits in form state. Drop-in replacement for `<input type="number">` money fields.
 *
 * Usage:
 *   <CurrencyInput
 *     label="Số tiền"
 *     value={form.amount}           // raw string "1000000"
 *     onChange={(raw) => setForm((p) => ({ ...p, amount: raw }))}
 *   />
 *
 *   // On submit: const amount = Number(form.amount);
 */
export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder = "0",
  disabled = false,
  required = false,
  error,
  className = "",
  size = "md",
  showPrefix = true,
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Track cursor position to preserve it across re-renders
  const [focused, setFocused] = useState(false);

  const displayValue = formatCurrencyInput(value);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseCurrencyInput(e.target.value);
    onChange(raw);
  }

  const baseInputCls = [
    "w-full rounded-2xl border bg-slate-50 outline-none transition-colors focus:bg-white",
    showPrefix
      ? size === "lg"
        ? "py-4 pl-10 pr-4"
        : "py-3 pl-9 pr-4"
      : size === "lg"
        ? "py-4 px-4"
        : "py-3 px-4",
    size === "lg"
      ? "text-xl font-black text-slate-900 placeholder:text-slate-300"
      : "text-sm",
    error
      ? "border-rose-300 focus:border-rose-500"
      : focused
        ? "border-blue-400"
        : "border-slate-200",
    disabled ? "cursor-not-allowed opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={["block", className].join(" ")}>
      {label && (
        <span
          className={[
            "mb-1.5 block font-black text-slate-700",
            size === "lg" ? "text-sm" : "text-sm",
          ].join(" ")}
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </span>
      )}

      <div className="relative">
        {showPrefix && (
          <span
            className={[
              "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400",
              size === "lg" ? "text-lg" : "",
            ].join(" ")}
          >
            ₫
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          className={baseInputCls}
        />
      </div>

      {error && (
        <p className="mt-1 text-xs font-medium text-rose-500">{error}</p>
      )}
    </div>
  );
}
