import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");
describe("SETTINGS-TRUTHFUL-UX-POLISH-1 source contracts", () => {
  it("shows distinct idle, dirty, saving, saved and error per section", () => {
    expect(source).toContain("resolveSettingsSaveOutcome(");
    expect(source).toContain('saveStatus(section) === "saving" ? "Đang lưu…"');
    expect(source).toContain('saveStatus(section) === "dirty" ? "Chưa lưu · "');
    for (const section of ["profile", "preferences", "financial", "aiFeatures", "aiSettings", "notifications"]) {
      expect(source).toContain(`markSaveStarted("${section}")`);
      expect(source).toContain(`markSaveSettled("${section}", revision, true)`);
      expect(source).toContain(`markSaveSettled("${section}", revision, false)`);
    }
  });
  it("invalidates success after controlled edits without auto-saving", () => {
    for (const section of ["profile", "preferences", "financial", "aiFeatures", "aiSettings", "notifications"]) {
      expect(source).toContain(`markDirty("${section}")`);
    }
    expect(source).toContain("revisionRef.current[section]");
    expect(source).not.toContain("handleSavePrefs");
  });
  it("does not confuse browser-only controls with cloud persistence", () => {
    expect(source).toContain('settingsSaveMessage(saveStatus("preferences"), "trình duyệt này")');
    expect(source).toContain('settingsSaveMessage(saveStatus("aiFeatures"), "trình duyệt này")');
    expect(source).toContain('settingsSaveMessage(saveStatus("aiSettings"), "máy chủ")');
    expect(source).toContain('aria-live="polite"');
  });
});
