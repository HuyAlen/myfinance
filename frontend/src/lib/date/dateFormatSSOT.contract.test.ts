import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");
const read=(path:string)=>normalizeNewlines(readFileSync(resolve(process.cwd(),path),"utf8"));
const settings=read("src/components/settings/SettingsPage.tsx");
const filter=read("src/components/layout/DateFilterProvider.tsx");
const preference=read("src/lib/date/dateFormatPreference.ts");
const input=read("src/components/ui/FormattedDateInput.tsx");

describe("MYFINANCE-DATE-FORMAT-SSOT-1 end-to-end wiring contract",()=>{
 it("retains one source in account-scoped settings snapshot",()=>{
  expect(settings).toContain("SETTINGS_LOCAL_VERSION = 1");
  expect(settings).toContain("buildLocalSettingsSnapshot()");
  expect(settings).toContain("notifyDateFormatSaved()");
  expect(settings).toContain("isDateDisplayFormat(saved.dateFormat)");
  expect(preference).toContain("myfinance-settings-v${SETTINGS_DATE_FORMAT_VERSION}:${accountId}");
  expect(preference).toContain('window.addEventListener("storage",onStorage)');
  expect(preference).toContain("useSyncExternalStore");
 });
 it("renders birthday using selected format and saves only canonical ISO",()=>{
  expect(settings).toContain("<FormattedDateInput");
  expect(settings).toContain("format={dateFormat}");
  expect(settings).toContain("!birthDateInputValid");
  expect(settings).toContain("birth_date: profileBirthDate || null");
  expect(input).toContain("parseDisplayDate(raw,format)");
 });
 it("normalizes Windows CRLF to LF before static-source comparisons",()=>{
  const windowsSource = "function ScheduleCard({\r\n  schedule,\r\n  dateDisplayFormat,\r\n  dueAction,";
  const unixSource = "function ScheduleCard({\n  schedule,\n  dateDisplayFormat,\n  dueAction,";
  expect(normalizeNewlines(windowsSource)).toBe(unixSource);
  expect(normalizeNewlines(unixSource)).toBe(unixSource);
 });
 it("passes dateDisplayFormat into module-level ScheduleCard instead of using an out-of-scope variable",()=>{
  const recurring=read("src/components/recurring/RecurringMoneyPage.tsx");
  expect(recurring).toContain('dateDisplayFormat={dateDisplayFormat}');
  expect(recurring).toContain('function ScheduleCard({\n  schedule,\n  dateDisplayFormat,\n  dueAction,');
  expect(recurring).toContain('dateDisplayFormat: DateDisplayFormat;');
  expect(recurring).toContain('formatDate(schedule.effectiveNextRunDate ?? schedule.nextRunDate,dateDisplayFormat)');
  expect(recurring).toContain('formatDate(dueAction.dueDate,dateDisplayFormat)');
 });
 it("formats range labels and finance timestamps without rewriting filter range keys",()=>{
  expect(filter).toContain("getFilterLabel(filter, dateDisplayFormat)");
  expect(filter).toContain('nextParams.set("from", nextFilter.customStart)');
  expect(filter).toContain('nextParams.set("to", nextFilter.customEnd)');
  for(const page of [
    "src/components/transactions/TransactionsPage.tsx",
    "src/components/dashboard/DashboardPage.tsx",
    "src/components/savings/SavingsPage.tsx",
    "src/components/recurring/RecurringMoneyPage.tsx",
    "src/components/activity/ActivityPage.tsx",
  ]) expect(read(page)).toContain("useAccountDateFormat()");
  expect(preference).not.toMatch(/window\.localStorage\.setItem/);
 });
});
