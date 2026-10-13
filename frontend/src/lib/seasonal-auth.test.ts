import { describe, expect, it } from "vitest";
import { resolveSeasonalAuthTheme, SEASONAL_AUTH_PREVIEWS } from "./seasonal-auth";

describe("MYFINANCE-SEASONAL-AUTH-1 — local calendar & safe previews", () => {
  it("supports all eight themes including account birthday preview and prevents arbitrary image/CSS values", () => {
    expect(SEASONAL_AUTH_PREVIEWS).toEqual([
      "spring", "summer", "autumn", "halloween", "birthday", "christmas", "newyear", "tet",
    ]);
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "../../evil")).toBe("autumn");
  });

  it("prioritizes explicit season overrides, case-insensitively", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "  ChRisTMaS ")).toBe("christmas");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "spring")).toBe("spring");
  });

  it("permits birthday only as an explicit allowlisted preview or account-derived event", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 25), "birthday")).toBe("birthday");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 25))).toBe("halloween");
  });

  it("can restore the original auth background", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "off")).toBe("off");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "default")).toBe("off");
  });

  it("uses Halloween from October 20 through 31, then restores autumn in November", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 8, 30))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 19))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 20))).toBe("halloween");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 31))).toBe("halloween");
    expect(resolveSeasonalAuthTheme(new Date(2026, 10, 1))).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 12), "Halloween")).toBe("halloween");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 25), "autumn")).toBe("autumn");
    expect(resolveSeasonalAuthTheme(new Date(2026, 9, 25), "off")).toBe("off");
  });

  it("assigns summer and spring using the browser-local calendar", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 5, 1))).toBe("summer");
    expect(resolveSeasonalAuthTheme(new Date(2026, 3, 1))).toBe("spring");
  });

  it("switches Christmas to New Year at the correct December boundary", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 11, 1))).toBe("christmas");
    expect(resolveSeasonalAuthTheme(new Date(2026, 11, 26))).toBe("christmas");
    expect(resolveSeasonalAuthTheme(new Date(2026, 11, 27))).toBe("newyear");
    expect(resolveSeasonalAuthTheme(new Date(2027, 0, 3))).toBe("newyear");
    expect(resolveSeasonalAuthTheme(new Date(2027, 0, 4))).toBe("spring");
  });

  it("uses real Vietnamese Tet dates rather than generic Jan/Feb cutoffs", () => {
    expect(resolveSeasonalAuthTheme(new Date(2026, 0, 20))).toBe("spring");
    expect(resolveSeasonalAuthTheme(new Date(2026, 1, 9))).toBe("spring");
    expect(resolveSeasonalAuthTheme(new Date(2026, 1, 10))).toBe("tet");
    expect(resolveSeasonalAuthTheme(new Date(2026, 1, 17))).toBe("tet");
    expect(resolveSeasonalAuthTheme(new Date(2026, 1, 24))).toBe("tet");
    expect(resolveSeasonalAuthTheme(new Date(2026, 1, 25))).toBe("spring");
    expect(resolveSeasonalAuthTheme(new Date(2027, 1, 6))).toBe("tet");
    expect(resolveSeasonalAuthTheme(new Date(2028, 0, 26))).toBe("tet");
  });

  it("does not guess unreviewed Tet years or invalid dates", () => {
    expect(resolveSeasonalAuthTheme(new Date(2041, 0, 20))).toBe("spring");
    expect(resolveSeasonalAuthTheme(new Date(Number.NaN))).toBe("off");
  });
});
