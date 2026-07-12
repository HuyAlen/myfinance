"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";

import type {
  AIActionFormMetadata,
  AIActionFormOption,
} from "@/src/services/finance/ai-agent/action-form/aiActionFormTypes";
import {
  getAIActionFormOptions,
  prepareAIActionForm,
} from "@/src/services/finance/ai-agent/aiActionFormApi";
import type { AIPendingActionCardData } from "../AIPendingActionCard";

function normalizeMoney(value: string) {
  return value.replace(/\D/g, "");
}

function formatMoney(value: string) {
  const normalized = normalizeMoney(value);
  if (!normalized) return "";
  return new Intl.NumberFormat("vi-VN").format(Number(normalized));
}

function initialFormValues(form: AIActionFormMetadata) {
  return Object.fromEntries(
    form.schema.fields.map((field) => {
      const value = form.initialValues[field.name] ?? field.defaultValue ?? "";
      return [field.name, String(value)];
    }),
  );
}

export default function AIActionFormCard({
  form,
  accessToken,
  conversationId,
  onPrepared,
  onCancelled,
}: {
  form: AIActionFormMetadata;
  accessToken: string;
  conversationId?: string | null;
  onPrepared: (action: AIPendingActionCardData) => void;
  onCancelled?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialFormValues(form),
  );
  const [options, setOptions] = useState<Record<string, AIActionFormOption[]>>(
    {},
  );
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingOptions(true);
      setError("");
      try {
        const result = await getAIActionFormOptions(accessToken, form.toolName);
        if (!cancelled) setOptions(result.options);
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Không thể tải dữ liệu biểu mẫu.",
          );
        }
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, form.toolName]);

  const missingFields = useMemo(
    () =>
      form.schema.fields
        .filter((field) => field.required)
        .filter((field) => !String(values[field.name] ?? "").trim())
        .map((field) => field.name),
    [form.schema.fields, values],
  );

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setError("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (missingFields.length > 0 || submitting) {
      setError("Vui lòng nhập đầy đủ các trường bắt buộc.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = Object.fromEntries(
        form.schema.fields.map((field) => {
          const raw = values[field.name] ?? "";
          if (field.type === "currency") {
            return [field.name, Number(normalizeMoney(raw) || 0)];
          }
          return [field.name, raw.trim()];
        }),
      );

      const action = await prepareAIActionForm(accessToken, {
        form,
        conversationId,
        values: payload,
      });

      onPrepared({
        id: action.id,
        toolName: action.tool_name,
        preview: action.preview,
        status: action.status,
        expiresAt: action.expires_at,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể chuẩn bị hành động.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-cyan-100 bg-white shadow-[0_12px_32px_rgba(8,145,178,0.10)]">
      <div className="flex items-start justify-between gap-4 border-b border-cyan-100 bg-linear-to-r from-cyan-50 via-blue-50/70 to-emerald-50/50 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
            <ShieldCheck size={14} />
            Biểu mẫu hành động
          </div>
          <h4 className="mt-1.5 text-sm font-black text-slate-900">
            {form.schema.title}
          </h4>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {form.schema.description}
          </p>
        </div>
        {onCancelled ? (
          <button
            type="button"
            onClick={onCancelled}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Đóng biểu mẫu"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
        {form.schema.fields.map((field) => {
          const value = values[field.name] ?? "";
          const fieldOptions = options[field.name] ?? field.options ?? [];

          return (
            <label key={field.name} className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-black text-slate-700">
                {field.label}
                {field.required ? (
                  <span className="text-rose-500">*</span>
                ) : null}
              </span>

              {field.type === "entity-select" ? (
                <select
                  value={value}
                  disabled={loadingOptions}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white disabled:opacity-60"
                >
                  <option value="">
                    {loadingOptions
                      ? "Đang tải..."
                      : `Chọn ${field.label.toLowerCase()}`}
                  </option>
                  {fieldOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "currency" ? (
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatMoney(value)}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setValue(field.name, normalizeMoney(event.target.value))
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-10 text-sm font-black text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                    ₫
                  </span>
                </div>
              ) : (
                <input
                  type={field.type === "month" ? "month" : "text"}
                  value={value}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-cyan-400 focus:bg-white"
                />
              )}
            </label>
          );
        })}

        {error ? (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
          {onCancelled ? (
            <button
              type="button"
              onClick={onCancelled}
              disabled={submitting}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>
          ) : null}
          <button
            type="submit"
            disabled={submitting || loadingOptions || missingFields.length > 0}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {form.schema.submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
