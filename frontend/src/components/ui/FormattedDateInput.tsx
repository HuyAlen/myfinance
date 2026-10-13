"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  formatISODateForDisplay, parseDisplayDate, type DateDisplayFormat,
} from "@/src/lib/date/dateDisplay";

type Props = {
  id:string;
  value:string; // YYYY-MM-DD only (Supabase / forms)
  onChange:(iso:string)=>void;
  onValidityChange?:(valid:boolean)=>void;
  format:DateDisplayFormat;
  min?:string;
  max?:string;
  disabled?:boolean;
  "data-account-birth-date"?:string;
};
/** Text field controls the visible format; the small native picker preserves
 * the calendar affordance on iPhone/desktop without browser-locale rendering.
 * No fake Date ChangeEvent and no conversion to UTC timestamps.
 */
export default function FormattedDateInput({
  id,value,onChange,onValidityChange,format,min,max,disabled,
  "data-account-birth-date":birthMarker,
}:Props) {
  const key = `${format}:${value}`;
  const [draft,setDraft] = useState<{key:string;text:string;valid:boolean}|null>(null);
  const text = draft?.key === key ? draft.text : formatISODateForDisplay(value,format);
  const invalid = draft?.key === key && !draft.valid;
  const placeholder = format.toUpperCase();

  const handleText = (raw:string) => {
    const parsed = parseDisplayDate(raw,format);
    const valid = raw.trim() === "" || parsed !== null;
    setDraft({key,text:raw,valid});
    onValidityChange?.(valid);
    if (valid) onChange(parsed ?? "");
  };
  const handleCalendar = (next:string) => {
    setDraft(null);
    onValidityChange?.(true);
    onChange(next);
  };
  return (
    <div className="min-w-0">
      <div className="relative min-w-0">
        <input
          id={id}
          data-account-birth-date={birthMarker}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={`${id}-format${invalid ? ` ${id}-error` : ""}`}
          onChange={(event)=>handleText(event.target.value)}
          className={`min-h-11 w-full rounded-2xl border bg-slate-50 py-2 pl-3 pr-14 text-sm text-slate-700 outline-none focus:border-blue-400 disabled:opacity-50 ${invalid ? "border-rose-400" : "border-slate-200"}`}
        />
        <div className="absolute inset-y-0 right-1 flex w-11 items-center justify-center">
          <CalendarDays size={17} aria-hidden="true" className="pointer-events-none text-blue-600" />
          <input
            type="date"
            value={value}
            min={min}
            max={max}
            disabled={disabled}
            aria-label="Chọn ngày bằng lịch"
            onChange={(event)=>handleCalendar(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </div>
      </div>
      <p id={`${id}-format`} className="mt-1 text-[11px] text-slate-500">Định dạng: {placeholder}</p>
      {invalid ? <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] text-rose-600">Ngày không hợp lệ. Nhập theo {placeholder}.</p> : null}
    </div>
  );
}
