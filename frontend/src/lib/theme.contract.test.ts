import { describe, expect, it } from "vitest";
import {
  isThemePreference,
  resolveThemePreference,
  THEME_MEDIA_QUERY,
  THEME_STORAGE_KEY,
} from "./theme";

describe("APP-DARK-MODE-1 theme preference semantics", () => {
  it("accepts only the three supported preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it("resolves explicit light and dark independently of the OS", () => {
    expect(resolveThemePreference("light", true)).toBe("light");
    expect(resolveThemePreference("light", false)).toBe("light");
    expect(resolveThemePreference("dark", true)).toBe("dark");
    expect(resolveThemePreference("dark", false)).toBe("dark");
  });

  it("resolves system from prefers-color-scheme", () => {
    expect(resolveThemePreference("system", true)).toBe("dark");
    expect(resolveThemePreference("system", false)).toBe("light");
  });

  it("keeps bootstrap/provider storage and media contracts stable", () => {
    expect(THEME_STORAGE_KEY).toBe("myfinance-theme-preference");
    expect(THEME_MEDIA_QUERY).toBe("(prefers-color-scheme: dark)");
  });
});
