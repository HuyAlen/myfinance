"use client";

import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { resolveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";
import { useSeasonalThemeEnabled } from "@/src/lib/seasonalThemePreference";
import {
  SKIN_CHOICES,
  SKIN_SEASONS,
  setSeasonalSkin,
  useSeasonalSkin,
  type SeasonalSkinSeason,
} from "@/src/lib/seasonalThemeSkins";

/** Compact seasonal skin picker, nested under Settings > Tùy chỉnh. */
export default function SeasonalSkinPicker() {
  // Fixed initial value on SSR prevents hydration mismatch across timezones.
  const [selectedSeason, setSelectedSeason] = useState<SeasonalSkinSeason>("spring");
  const [calendarSeason, setCalendarSeason] = useState<SeasonalSkinSeason | null>(null);
  const enabled = useSeasonalThemeEnabled();
  const selectedSkin = useSeasonalSkin(selectedSeason);
  const seasonMeta = SKIN_SEASONS.find((season) => season.value === selectedSeason) ?? SKIN_SEASONS[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("season");
      const active = resolveSeasonalAuthTheme(new Date(), requested);
      if (active !== "off") {
        setCalendarSeason(active);
        setSelectedSeason(active);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section
      data-seasonal-skin-picker="true"
      aria-labelledby="seasonal-skins-title"
      className="mt-3 space-y-3 border-t border-slate-100 px-1 pt-4 sm:px-2"
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Palette size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="seasonal-skins-title" className="text-sm font-bold text-slate-700">Skin theo mùa</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">3 skin/mùa · tự áp dụng theo lịch, lưu riêng trên thiết bị</p>
        </div>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Chọn mùa để đổi skin">
        <div className="flex w-max min-w-full gap-1.5">
          {SKIN_SEASONS.map((season) => (
            <button
              key={season.value}
              type="button"
              onClick={() => setSelectedSeason(season.value)}
              aria-pressed={selectedSeason === season.value}
              data-seasonal-skin-season={season.value}
              className={`flex min-h-10 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${
                selectedSeason === season.value
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden="true">{season.icon}</span>
              {season.label}
              {calendarSeason === season.value ? <span className="sr-only">(đang trong mùa)</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Skin mùa ${seasonMeta.label}`}>
        {SKIN_CHOICES.map((choice) => {
          const selected = selectedSkin === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              data-seasonal-skin-option={choice.value}
              data-seasonal-skin-selected={selected ? "true" : "false"}
              aria-pressed={selected}
              aria-label={`${choice.label}, ${choice.description}, mùa ${seasonMeta.label}`}
              onClick={() => setSeasonalSkin(selectedSeason, choice.value)}
              className={`group min-w-0 rounded-xl border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                selected
                  ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
              }`}
            >
              <span
                aria-hidden="true"
                data-seasonal-skin-preview={choice.value}
                className="relative block h-12 overflow-hidden rounded-lg"
                style={{
                  background: choice.value === "classic"
                    ? `linear-gradient(125deg, ${seasonMeta.colors[0]}, ${seasonMeta.colors[1]})`
                    : choice.value === "pastel"
                      ? `linear-gradient(135deg, #ffffff 10%, ${seasonMeta.colors[0]} 80%)`
                      : `linear-gradient(135deg, ${seasonMeta.colors[1]}, ${seasonMeta.colors[2]})`,
                }}
              >
                <span
                  className="absolute inset-0 bg-right bg-no-repeat"
                  style={{
                    backgroundImage: `url("${seasonMeta.art}")`,
                    backgroundSize: choice.value === "pastel" ? "auto 85%" : "auto 135%",
                    opacity: choice.value === "pastel" ? 0.45 : 0.85,
                  }}
                />
                <span className="absolute bottom-1 left-1.5 flex gap-0.5">
                  <i className="size-1.5 rounded-full bg-white/90 shadow-sm" />
                  <i className="size-1.5 rounded-full bg-white/70 shadow-sm" />
                  <i className="size-1.5 rounded-full bg-white/50 shadow-sm" />
                </span>
              </span>
              <span className="mt-1.5 flex min-w-0 items-center justify-between gap-1 px-0.5">
                <span className="truncate text-[11px] font-bold text-slate-700">{choice.label}</span>
                {selected ? <Check size={13} className="shrink-0 text-blue-600" aria-hidden="true" /> : null}
              </span>
              <span className="block truncate px-0.5 text-[10px] text-slate-500">{choice.description}</span>
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="text-[11px] leading-4 text-slate-500">
        {enabled
          ? calendarSeason === selectedSeason
            ? `Đang áp dụng: ${SKIN_CHOICES.find((item) => item.value === selectedSkin)?.label}.`
            : `Đã lưu skin mùa ${seasonMeta.label}; sẽ tự dùng khi đến mùa.`
          : "Đã lưu skin; bật Giao diện theo mùa để hiển thị."}
      </p>
    </section>
  );
}
