"use client";

import { Send, Sparkles, Square } from "lucide-react";

const MAX_LENGTH = 500;

type AIChatInputProps = {
  value: string;
  loading: boolean;
  streaming?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
};

export default function AIChatInput({
  value,
  loading,
  streaming = false,
  onChange,
  onSubmit,
  onStop,
}: AIChatInputProps) {
  const trimmedValue = value.trim();
  const canSubmit = trimmedValue.length > 0 && !loading && !streaming;
  const showCount = value.length > 360;

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value.slice(0, MAX_LENGTH));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition focus-within:border-blue-200 focus-within:shadow-[0_20px_55px_rgba(37,99,235,0.14)]">
      <div className="flex items-end gap-3">
        <div className="mb-1 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Sparkles size={18} />
        </div>

        <textarea
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={loading || streaming}
          rows={4}
          maxLength={MAX_LENGTH}
          placeholder={streaming ? "AI đang trả lời..." : "Hỏi MyFinance AI..."}
          className="max-h-48 min-h-27 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] font-medium leading-6 text-slate-800 outline-none placeholder:font-semibold placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
        />

        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="mb-1 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 active:scale-95"
            aria-label="Dừng AI"
          >
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className={[
              "mb-1 flex size-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-95",
              canSubmit
                ? "bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
                : "bg-slate-100 text-slate-300",
            ].join(" ")}
            aria-label="Gửi câu hỏi"
          >
            <Send size={18} />
          </button>
        )}
      </div>

      {showCount && (
        <div className="mt-1 flex justify-end pr-12 text-[10px] font-bold text-slate-400">
          {value.length}/{MAX_LENGTH}
        </div>
      )}
    </div>
  );
}
