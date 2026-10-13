"use client";

import { Leaf } from "lucide-react";
import {
  toggleSeasonalThemeEnabled,
  useSeasonalThemeEnabled,
} from "@/src/lib/seasonalThemePreference";

/** One full-row switch: larger tap target without adding another preference source. */
export default function SeasonalThemeSettingsCard() {
  const enabled = useSeasonalThemeEnabled();

  return (
    <section
      data-settings-section="seasonal-theme"
      aria-labelledby="seasonal-theme-settings-title"
      className="min-w-0"
    >
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="seasonal-theme-settings-title"
        aria-describedby="seasonal-theme-settings-description seasonal-theme-settings-status"
        data-seasonal-theme-toggle="true"
        data-seasonal-theme-state={enabled ? "on" : "off"}
        onClick={toggleSeasonalThemeEnabled}
        className="group flex min-h-16 w-full cursor-pointer touch-manipulation select-none items-center justify-between gap-3 rounded-2xl px-2 py-2 text-left transition-colors duration-150 hover:bg-blue-50/70 active:bg-blue-100/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:px-3"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"
          >
            <Leaf size={17} />
          </span>
          <span className="min-w-0">
            <span
              id="seasonal-theme-settings-title"
              className="block text-sm font-bold text-slate-700"
            >
              Giao diện theo mùa
            </span>
            <span
              id="seasonal-theme-settings-description"
              className="mt-1 block text-xs leading-5 text-slate-500"
            >
              Tự động đổi nền, họa tiết và hiệu ứng theo mùa.
            </span>
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`pointer-events-none relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-150 ${
            enabled ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-slate-200"
          }`}
        >
          <span
            className="ml-1 size-5 rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none"
            style={{ transform: enabled ? "translateX(20px)" : "translateX(0px)" }}
          />
        </span>
      </button>
      <p id="seasonal-theme-settings-status" role="status" aria-live="polite" className="mt-1 px-2 text-[11px] leading-4 text-slate-500 sm:px-3">
        <span className={enabled ? "font-bold text-blue-700" : "font-bold text-slate-600"}>
          {enabled ? "Đang bật" : "Đã tắt"}
        </span>
        {" · Lưu riêng trên trình duyệt này; không ảnh hưởng Sáng / Tối / Thiết bị."}
      </p>
    </section>
  );
}
