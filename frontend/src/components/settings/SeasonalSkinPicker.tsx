"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { readAccountBirthDate, resolveAccountSeasonalTheme } from "@/src/lib/accountBirthdayTheme";
import { Check, Palette } from "lucide-react";
import { resolveSeasonalAuthTheme } from "@/src/lib/seasonal-auth";
import { useSeasonalThemeEnabled } from "@/src/lib/seasonalThemePreference";
import {
  SKIN_CHOICES,
  SKIN_SEASONS,
  previewSeasonalSkinDrafts,
  syncSeasonalSkinForDocument,
  useSeasonalSkin,
  readAllSeasonalDateWindows,
  SEASONAL_SCHEDULE_CHANGED,
  type SeasonalDateWindow,
  type SeasonalScheduleDrafts,
  type SeasonalSkin,
  type SeasonalSkinDrafts,
  type SeasonalSkinSeason,
} from "@/src/lib/seasonalThemeSkins";

/** Date changes remain drafts until the single Settings > Tùy chỉnh Save button. */
type SeasonalSkinPickerProps = {
  scheduleDrafts: SeasonalScheduleDrafts;
  onScheduleChange: (season: SeasonalSkinSeason, value: SeasonalDateWindow | null) => void;
  skinDrafts: SeasonalSkinDrafts;
  onSkinChange: (season: SeasonalSkinSeason, skin: SeasonalSkin) => void;
};

/** Compact seasonal skin picker, nested under Settings > Tùy chỉnh. */
export default function SeasonalSkinPicker({ scheduleDrafts, onScheduleChange, skinDrafts, onSkinChange }: SeasonalSkinPickerProps) {
  const router = useRouter();
  const { user } = useAuth();
  const accountBirthDate = readAccountBirthDate(user?.user_metadata);
  const [previewOverride, setPreviewOverride] = useState<string | null>(null);
  const [savedSchedules, setSavedSchedules] = useState<Partial<Record<SeasonalSkinSeason, SeasonalDateWindow>>>({});
  // Fixed initial value on SSR prevents hydration mismatch across timezones.
  const [selectedSeason, setSelectedSeason] = useState<SeasonalSkinSeason>("spring");
  const [calendarSeason, setCalendarSeason] = useState<SeasonalSkinSeason | null>(null);
  const enabled = useSeasonalThemeEnabled();
  useEffect(() => {
    const refresh = () => setSavedSchedules(readAllSeasonalDateWindows());
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener(SEASONAL_SCHEDULE_CHANGED, refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(SEASONAL_SCHEDULE_CHANGED, refresh);
    };
  }, []);
  const currentSchedule = Object.prototype.hasOwnProperty.call(scheduleDrafts, selectedSeason)
    ? (scheduleDrafts[selectedSeason] ?? null)
    : (savedSchedules[selectedSeason] ?? null);
  const customSchedule = currentSchedule !== null;
  const savedSkin = useSeasonalSkin(selectedSeason);
  const selectedSkin = skinDrafts[selectedSeason] ?? savedSkin;
  useEffect(() => {
    previewSeasonalSkinDrafts(skinDrafts);
    return () => syncSeasonalSkinForDocument();
  }, [skinDrafts, selectedSeason, previewOverride, enabled]);
  const seasonMeta = SKIN_SEASONS.find((season) => season.value === selectedSeason) ?? SKIN_SEASONS[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("season");
      const now = new Date();
      const calendar = resolveSeasonalAuthTheme(now, requested);
      const active = resolveAccountSeasonalTheme(calendar, now, requested, accountBirthDate);
      if (active !== "off") {
        setCalendarSeason(active);
        setSelectedSeason(active);
      }
      setPreviewOverride(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountBirthDate]);

  // Preview another season without persisting an override or losing month filters.
  // The existing workspace controller uses Next search params after navigation.
  const previewSeason = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("season", selectedSeason);
    setPreviewOverride(selectedSeason);
    setCalendarSeason(selectedSeason);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };
  const restoreCalendar = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("season");
    setPreviewOverride(null);
    const now = new Date();
    const automatic = resolveAccountSeasonalTheme(resolveSeasonalAuthTheme(now, null), now, null, accountBirthDate);
    setCalendarSeason(automatic === "off" ? null : automatic);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  };
  const isPreviewing = previewOverride === selectedSeason;

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
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">3 skin/chủ đề · chọn skin và lưu cho từng mùa</p>
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-seasonal-season-preview="true"
          onClick={previewSeason}
          disabled={!enabled || isPreviewing}
          className="min-h-10 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-default disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          {"Xem th\u1eed m\u00f9a " + seasonMeta.label}
        </button>
        {previewOverride !== null ? (
          <button
            type="button"
            data-seasonal-preview-reset="true"
            onClick={restoreCalendar}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            {"V\u1ec1 ch\u1ebf \u0111\u1ed9 t\u1ef1 \u0111\u1ed9ng"}
          </button>
        ) : null}
      </div>


      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-seasonal-schedule="true">
        <div>
          <div className="text-xs font-bold text-slate-700">Tùy chọn lịch · {seasonMeta.label}</div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">Chọn cách áp dụng skin cho mùa này. Thay đổi sẽ lưu cùng nút “Lưu tùy chỉnh” ở cuối mục.</p>
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Tùy chọn lịch mùa ${seasonMeta.label}`}>
          <button
            type="button"
            aria-pressed={!customSchedule}
            disabled={!customSchedule}
            data-seasonal-schedule-mode="auto"
            onClick={() => onScheduleChange(selectedSeason, null)}
            className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${!customSchedule ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-600"}`}
          >Theo mùa tự động</button>
          <button
            type="button"
            aria-pressed={customSchedule}
            disabled={customSchedule}
            data-seasonal-schedule-mode="custom"
            onClick={() => onScheduleChange(selectedSeason, currentSchedule ?? savedSchedules[selectedSeason] ?? { start: "", end: "" })}
            className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${customSchedule ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-600"}`}
          >Tùy chọn ngày</button>
        </div>
        {customSchedule ? (
          <>
            <p className="text-[11px] leading-4 text-slate-500">Áp dụng từ 00:00 ngày bắt đầu đến hết ngày kết thúc, theo giờ Việt Nam.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-slate-600">Ngày bắt đầu
                <input
                  type="date"
                  data-seasonal-schedule-start="true"
                  value={currentSchedule.start}
                  onChange={(event) => onScheduleChange(selectedSeason, { ...currentSchedule, start: event.target.value })}
                  className="block min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600">Ngày kết thúc
                <input
                  type="date"
                  data-seasonal-schedule-end="true"
                  min={currentSchedule.start || undefined}
                  value={currentSchedule.end}
                  onChange={(event) => onScheduleChange(selectedSeason, { ...currentSchedule, end: event.target.value })}
                  className="block min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                />
              </label>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-slate-500">Skin sẽ dùng lịch mùa mặc định.</p>
        )}
      </div>
      {selectedSeason === "birthday" ? (
        <p className="text-[11px] leading-4 text-slate-500">
          {accountBirthDate
            ? "Skin Sinh nhật sẽ tự hiện mỗi năm vào ngày sinh trong Hồ sơ tài khoản."
            : "Chưa có ngày sinh. Hãy cập nhật tại Hồ sơ cá nhân ở phía trên."}
        </p>
      ) : null}
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
              onClick={() => onSkinChange(selectedSeason, choice.value)}
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
        {skinDrafts[selectedSeason] !== undefined
          ? "Đang xem trước: " + (SKIN_CHOICES.find((item) => item.value === selectedSkin)?.label ?? selectedSkin) + ". Nhấn Lưu tùy chỉnh để lưu skin."
          : enabled
            ? calendarSeason === selectedSeason
              ? `Đang áp dụng skin đã lưu: ${SKIN_CHOICES.find((item) => item.value === selectedSkin)?.label}.`
              : `Đã lưu skin mùa ${seasonMeta.label}; sẽ tự dùng khi đến mùa.`
            : "Đã lưu skin; bật Giao diện theo mùa để hiển thị."}
      </p>
    </section>
  );
}
