/**
 * SETTINGS-TRUTHFUL-UX-POLISH-1
 * Feedback is tied to the submitted revision, not just a successful request.
 * A later edit cannot be marked saved by an older in-flight write.
 */
export type SettingsSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function resolveSettingsSaveOutcome(
  submittedRevision: number,
  currentRevision: number,
  succeeded: boolean,
): SettingsSaveStatus {
  if (currentRevision !== submittedRevision) return "dirty";
  return succeeded ? "saved" : "error";
}

export function settingsSaveMessage(
  status: SettingsSaveStatus,
  destination: string,
): string {
  switch (status) {
    case "dirty":
      return "Có thay đổi chưa lưu.";
    case "saving":
      return "Đang lưu thay đổi…";
    case "saved":
      return `Đã lưu trên ${destination}.`;
    case "error":
      return "Không thể lưu. Xem thông báo lỗi và thử lại.";
    default:
      return "";
  }
}
