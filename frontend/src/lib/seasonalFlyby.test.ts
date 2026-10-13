import { describe, expect, it } from "vitest";
import {
  FLYBY_ACTIVITY_QUIET_MS,
  FLYBY_DURATION_MS,
  nextFlybyDelayMs,
  nextSeasonalMotionPlan,
  resolveFlybySeason,
} from "./seasonalFlyby";

describe("MYFINANCE-SEASONAL-THEMED-MOTION-1 pure motion plans", () => {
  it("allows only three seasonal events and rejects off/unknown seasons", () => {
    for (const theme of ["autumn", "christmas", "tet"] as const) {
      expect(resolveFlybySeason(theme)).toBe(theme);
    }
    for (const value of [null, "off", "spring", "summer", "newyear", "../../tet", "AUTUMN"]) {
      expect(resolveFlybySeason(value)).toBeNull();
    }
  });

  it("retains rare real cadence, sparse mobile events and opt-in fast preview", () => {
    expect(nextFlybyDelayMs({ mobile: false, preview: false, first: true, random: () => 0 })).toBe(45_000);
    expect(nextFlybyDelayMs({ mobile: false, preview: false, first: true, random: () => 1 })).toBe(80_000);
    expect(nextFlybyDelayMs({ mobile: false, preview: false, first: false, random: () => 0 })).toBe(65_000);
    expect(nextFlybyDelayMs({ mobile: false, preview: false, first: false, random: () => 1 })).toBe(110_000);
    expect(nextFlybyDelayMs({ mobile: true, preview: false, first: true, random: () => 0 })).toBe(90_000);
    expect(nextFlybyDelayMs({ mobile: true, preview: false, first: false, random: () => 1 })).toBe(160_000);
    expect(nextFlybyDelayMs({ mobile: false, preview: true, first: true })).toBe(1_300);
    expect(nextFlybyDelayMs({ mobile: false, preview: true, first: false })).toBe(14_000);
    expect(nextFlybyDelayMs({ mobile: true, preview: true, first: false })).toBe(17_000);
    expect(FLYBY_DURATION_MS).toBe(7_600);
    expect(FLYBY_ACTIVITY_QUIET_MS).toBe(6_000);
  });

  it("Autumn generates independent falling leaves with bounded stagger and drift", () => {
    for (const mobile of [false, true]) {
      for (const r of [0, 0.5, 1, Number.NaN, -99, 99]) {
        const plan = nextSeasonalMotionPlan({ season: "autumn", mobile, random: () => r });
        expect(plan.mode).toBe("fall");
        if (plan.mode !== "fall") throw new Error("Expected fall mode");
        expect(plan.leaves).toHaveLength(mobile ? 3 : 6);
        expect(plan.durationMs).toBeGreaterThanOrEqual(7_000);
        expect(plan.durationMs).toBeLessThanOrEqual(12_500);
        for (const leaf of plan.leaves) {
          expect(leaf.xPercent).toBeGreaterThanOrEqual(4);
          expect(leaf.xPercent).toBeLessThanOrEqual(96);
          expect(leaf.sizePx).toBeGreaterThanOrEqual(mobile ? 18 : 24);
          expect(leaf.sizePx).toBeLessThanOrEqual(mobile ? 28 : 39);
          expect(leaf.delayMs).toBeGreaterThanOrEqual(0);
          expect(leaf.delayMs).toBeLessThanOrEqual(1_600);
          expect(leaf.driftPx).toBeGreaterThanOrEqual(-75);
          expect(leaf.driftPx).toBeLessThanOrEqual(75);
          expect(leaf.alpha).toBeGreaterThanOrEqual(0.48);
          expect(leaf.alpha).toBeLessThanOrEqual(0.76);
          expect(leaf.delayMs + leaf.durationMs).toBeLessThan(plan.durationMs);
        }
      }
    }
  });

  it("Christmas travels diagonally in either direction with finite bobbing", () => {
    const left = nextSeasonalMotionPlan({ season: "christmas", mobile: false, random: () => 0 });
    const right = nextSeasonalMotionPlan({ season: "christmas", mobile: false, random: () => 1 });
    expect(left.mode).toBe("glide");
    expect(right.mode).toBe("glide");
    if (left.mode !== "glide" || right.mode !== "glide") throw new Error("Expected glide mode");
    expect(left.sleigh.direction).toBe("rtl");
    expect(right.sleigh.direction).toBe("ltr");
    expect(left.sleigh.endShiftPx).toBeLessThan(0);
    expect(right.sleigh.endShiftPx).toBeGreaterThan(0);
    for (const mobile of [false, true]) {
      for (const r of [0, 0.5, 1, Number.NaN, -99, 99]) {
        const plan = nextSeasonalMotionPlan({ season: "christmas", mobile, random: () => r });
        if (plan.mode !== "glide") throw new Error("Expected glide mode");
        expect(plan.durationMs).toBeGreaterThanOrEqual(8_000);
        expect(plan.durationMs).toBeLessThanOrEqual(mobile ? 10_900 : 10_500);
        expect(Math.abs(plan.sleigh.endShiftPx)).toBeGreaterThanOrEqual(35);
        expect(Math.abs(plan.sleigh.endShiftPx)).toBeLessThanOrEqual(125);
        expect(plan.sleigh.bobPx).toBeGreaterThanOrEqual(mobile ? 5 : 7);
        expect(plan.sleigh.bobPx).toBeLessThanOrEqual(mobile ? 9 : 14);
      }
    }
    const alternate = nextSeasonalMotionPlan({ season: "christmas", mobile: false, previousDirection: "rtl", random: () => 0.1 });
    if (alternate.mode !== "glide") throw new Error("Expected glide mode");
    expect(alternate.sleigh.direction).toBe("ltr");
  });

  it("Tet launches a single mobile rocket or two staged desktop fireworks", () => {
    for (const mobile of [false, true]) {
      for (const r of [0, 0.5, 1, Number.NaN, -99, 99]) {
        const plan = nextSeasonalMotionPlan({ season: "tet", mobile, random: () => r });
        expect(plan.mode).toBe("launch-burst");
        if (plan.mode !== "launch-burst") throw new Error("Expected burst mode");
        expect(plan.durationMs).toBe(mobile ? 6_900 : 7_700);
        expect(plan.fireworks).toHaveLength(mobile ? 1 : 2);
        expect(plan.fireworks[0].delayMs).toBe(0);
        if (!mobile) {
          expect(plan.fireworks[1].delayMs).toBeGreaterThanOrEqual(950);
          expect(plan.fireworks[1].delayMs).toBeLessThanOrEqual(1_350);
          expect(plan.fireworks[1].xPercent).toBeGreaterThan(plan.fireworks[0].xPercent);
        }
        for (const firework of plan.fireworks) {
          expect(firework.xPercent).toBeGreaterThanOrEqual(mobile ? 54 : 58);
          expect(firework.xPercent).toBeLessThanOrEqual(mobile ? 85 : 91);
          expect(firework.targetTopPx).toBeGreaterThanOrEqual(mobile ? 135 : 115);
          expect(firework.targetTopPx).toBeLessThanOrEqual(mobile ? 215 : 250);
          expect(firework.radiusPx).toBeGreaterThanOrEqual(mobile ? 37 : 55);
          expect(firework.radiusPx).toBeLessThanOrEqual(mobile ? 56 : 86);
        }
      }
    }
  });

  it("each plan is a single, finite event; no duplicate overlapping modes", () => {
    for (const season of ["autumn", "christmas", "tet"] as const) {
      const plan = nextSeasonalMotionPlan({ season, mobile: false, random: () => 0.42 });
      expect(plan.season).toBe(season);
      expect(plan.durationMs).toBeGreaterThan(0);
      expect(plan.durationMs).toBeLessThan(13_000);
      expect(["fall", "glide", "launch-burst"]).toContain(plan.mode);
    }
  });
});
