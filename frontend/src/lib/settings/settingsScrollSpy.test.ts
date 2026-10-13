import { describe, expect, it } from "vitest";
import { resolveActiveSettingsSection } from "./settingsScrollSpy";

const sections = [
  { id: "profile", top: -900 },
  { id: "household", top: 110 },
  { id: "preferences", top: 620 },
  { id: "financial", top: 1450 },
];

describe("Settings section scrollspy (finance-main inner scroll owner)", () => {
  it("does not select a missing section", () => {
    expect(resolveActiveSettingsSection([], 120)).toBeNull();
  });

  it("starts from the first section before any heading crosses the activation line", () => {
    expect(resolveActiveSettingsSection([{ id: "profile", top: 500 }, { id: "household", top: 800 }], 120)).toBe("profile");
  });

  it("selects the section whose heading most recently crossed the activation line", () => {
    expect(resolveActiveSettingsSection(sections, 120)).toBe("household");
    expect(resolveActiveSettingsSection(sections, 620)).toBe("preferences");
    expect(resolveActiveSettingsSection(sections, 2000)).toBe("financial");
  });

  it("does not switch to a later section until its heading reaches the activation line", () => {
    expect(resolveActiveSettingsSection(sections, 619)).toBe("household");
  });

  it("selects the final section at the bottom of finance-main", () => {
    expect(resolveActiveSettingsSection(sections, 120, true)).toBe("financial");
  });

  it("handles a single section at the top and bottom", () => {
    const only = [{ id: "profile", top: 200 }];
    expect(resolveActiveSettingsSection(only, 100)).toBe("profile");
    expect(resolveActiveSettingsSection(only, 100, true)).toBe("profile");
  });
});
