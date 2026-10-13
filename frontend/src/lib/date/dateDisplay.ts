/** MYFINANCE-DATE-FORMAT-SSOT-1
 * A presentation-only transformation: financial dates, URL ranges and API/DB
 * payloads remain ISO (YYYY-MM-DD) no matter how the user prefers to see them.
 * Never parse ISO date-only values with JS Date (UTC timezone day shifts).
 */
import { isValidISODate } from "@/src/lib/date/calendarDate";

export const DEFAULT_DATE_DISPLAY_FORMAT = "dd/mm/yyyy" as const;
export type DateDisplayFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";
export const DATE_DISPLAY_FORMAT_OPTIONS: ReadonlyArray<{value: DateDisplayFormat; label:string}> = [
  { value:"dd/mm/yyyy", label:"DD/MM/YYYY" },
  { value:"mm/dd/yyyy", label:"MM/DD/YYYY" },
  { value:"yyyy-mm-dd", label:"YYYY-MM-DD" },
];
export function isDateDisplayFormat(value: unknown): value is DateDisplayFormat {
  return value === "dd/mm/yyyy" || value === "mm/dd/yyyy" || value === "yyyy-mm-dd";
}
export function formatISODateForDisplay(value: string | null | undefined, format: DateDisplayFormat): string {
  if (!value) return "";
  if (!isValidISODate(value)) return value;
  const [year, month, day] = value.split("-");
  if (format === "mm/dd/yyyy") return `${month}/${day}/${year}`;
  if (format === "yyyy-mm-dd") return value;
  return `${day}/${month}/${year}`;
}
/** Reject impossible dates. Never silently roll over February or swap day/month. */
export function parseDisplayDate(value: string, format: DateDisplayFormat): string | null {
  const input = value.trim();
  if (format === "yyyy-mm-dd") return isValidISODate(input) ? input : null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!match) return null;
  const month = format === "mm/dd/yyyy" ? match[1] : match[2];
  const day = format === "mm/dd/yyyy" ? match[2] : match[1];
  const iso = `${match[3]}-${month}-${day}`;
  return isValidISODate(iso) ? iso : null;
}
export function formatShortISODate(value: string, format: DateDisplayFormat): string {
  if (!isValidISODate(value)) return value;
  const [, month, day] = value.split("-");
  return format === "dd/mm/yyyy" ? `${day}/${month}` :
    format === "mm/dd/yyyy" ? `${month}/${day}` : `${month}-${day}`;
}
export function formatDateFromDate(date: Date, format: DateDisplayFormat): string {
  if (!Number.isFinite(date.getTime())) return "";
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth()+1).padStart(2,"0");
  const day = String(date.getDate()).padStart(2,"0");
  return formatISODateForDisplay(`${year}-${month}-${day}`,format);
}
/** ISO date-only gets priority; instants use browser-local date just as existing UI. */
export function formatStoredDateForDisplay(value: string | undefined | null, format: DateDisplayFormat): string {
  if (!value) return "";
  if (isValidISODate(value)) return formatISODateForDisplay(value,format);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatDateFromDate(date,format) : value;
}
export function formatTimestampForDisplay(value:string, format:DateDisplayFormat):string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const clock = date.toLocaleTimeString("vi-VN", { hour:"2-digit", minute:"2-digit" });
  return `${formatDateFromDate(date,format)}, ${clock}`;
}
