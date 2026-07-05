"use client";

import { Send, Sparkles } from "lucide-react";

const MAX_LENGTH = 500;

type AIChatInputProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export default function AIChatInput({
  value,
  loading,
  onChange,
  onSubmit,
}: AIChatInputProps) {
  const trimmedValue = value.trim();
  const canSubmit = trimmedValue.length > 0 && !loading;
  const showCount = value.length > 360;

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value.slice(0, MAX_LENGTH));
  }

  return (
    <div className="rounded-[1.65rem] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition focus-within:border-blue-200 focus-within:shadow-[0_20px_55px_rgba(37,99,235,0.14)]">
      <div className="flex items-end gap-3">
        <div className="mb-1 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 sm:size-10">
          <Sparkles size={18} />
        </div>

        <textarea
          value={value}
          onChange={handleChange}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Hỏi MyFinance AI..."
          className="max-h-36 min-h-14 min-w-0 flex-1 resize-none bg-transparent px-1 py-3 text-[15px] font-normal leading-6 text-slate-800 outline-none placeholder:text-slate-400 placeholder:font-semibold sm:min-h-12"
        />

        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className={[
            "mb-1 flex size-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 sm:size-10",
            canSubmit
              ? "bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
              : "bg-slate-100 text-slate-300",
          ].join(" ")}
          aria-label="Gửi câu hỏi"
        >
          <Send size={18} />
        </button>
      </div>

      {showCount && (
        <div className="mt-1 flex justify-end pr-12 text-[10px] font-bold text-slate-400">
          {value.length}/{MAX_LENGTH}
        </div>
      )}
    </div>
  );
}
