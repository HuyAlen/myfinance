import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "RecurringMoneyPage.tsx"), "utf8");
const provider = readFileSync(path.resolve(__dirname, "../layout/DateFilterProvider.tsx"), "utf8");

describe("RECURRING-SELECTED-MONTH-CONTEXT-HOTFIX-P1 wiring", () => {
  it("uses the same DateFilterProvider as the header and respects month deep links", () => {
    expect(page).toContain('import { useDateFilter } from "@/src/components/layout/DateFilterProvider"');
    expect(page).toContain('const { selectedMonth, filterMode: globalFilterMode } = useDateFilter();');
    expect(provider).toContain('nextParams.set("month", nextFilter.selectedMonth)');
    expect(page).toContain("buildRecurringMonthView(selectedMonth, todayKey)");
    expect(page).toContain("data-recurring-view-month={viewMonth.monthKey}");
  });

  it("uses selected month in both realization and forecast, with actual reminders separate", () => {
    const normalized = page.replace(/\s+/g, " ");
    expect(normalized).toContain("referenceDate: viewMonth.startDate");
    expect(normalized).toContain("projectSelectedRecurringMonth({ viewMonth, forecastSchedules, schedules, transactions, })");
    expect(normalized).toContain("viewMonth.isCurrentMonth ? buildRecurringDueActions({");
    expect(normalized).toContain("referenceDate: todayKey");
    expect(page).not.toContain("expandRecurringScheduleOccurrences(forecastSchedules, todayKey, 30)");
  });

  it("aligns actual form to the selected month rather than silently recording into today", () => {
    expect(page).toContain("referenceDate: viewMonth.startDate");
    expect(page).toContain("effectiveDate.slice(0, 7) !== viewMonth.monthKey");
    expect(page).toContain("viewMonth.isCurrentMonth ? todayKey : effectiveDate");
    expect(page).toContain("draft.dueDate.slice(0, 7) !== viewMonth.monthKey");
    expect(page).toContain("canRecordInMonth");
  });

  it("labels single-month projections honestly and avoids reporting a quarter as one month", () => {
    expect(page).toContain("Đối chiếu tháng {viewMonth.monthLabel}");
    expect(page).toContain('globalFilterMode !== "month"');
    expect(page).toContain("Dự tính thu ·");
    expect(page).toContain("Lịch tháng");
  });
});
