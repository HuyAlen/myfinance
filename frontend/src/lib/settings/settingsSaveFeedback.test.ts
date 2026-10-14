import { describe, expect, it } from "vitest";
import {
  resolveSettingsSaveOutcome,
  settingsSaveMessage,
} from "./settingsSaveFeedback";

describe("SETTINGS-TRUTHFUL-UX-POLISH-1 save feedback", () => {
  it("confirms only the exact submitted draft revision", () => {
    expect(resolveSettingsSaveOutcome(2, 2, true)).toBe("saved");
    expect(resolveSettingsSaveOutcome(2, 3, true)).toBe("dirty");
    expect(resolveSettingsSaveOutcome(2, 3, false)).toBe("dirty");
  });

  it("does not report failed writes as saved", () => {
    expect(resolveSettingsSaveOutcome(4, 4, false)).toBe("error");
  });

  it("distinguishes browser-only and account saves", () => {
    expect(settingsSaveMessage("idle", "trình duyệt này")).toBe("");
    expect(settingsSaveMessage("dirty", "trình duyệt này")).toContain("chưa lưu");
    expect(settingsSaveMessage("saving", "trình duyệt này")).toContain("Đang lưu");
    expect(settingsSaveMessage("saved", "trình duyệt này")).toContain("trình duyệt này");
    expect(settingsSaveMessage("saved", "tài khoản")).toContain("tài khoản");
    expect(settingsSaveMessage("error", "tài khoản")).toContain("Không thể lưu");
  });
});
