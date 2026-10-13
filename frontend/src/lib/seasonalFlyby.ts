/**
 * MYFINANCE-SEASONAL-THEMED-MOTION-1
 * Presentation-only seasonal motion plans. No finance data or network access.
 * Each season has its own physical metaphor; plans are bounded and testable.
 */
export type FlybySeason = "autumn" | "christmas" | "tet";
export type FlybyDirection = "rtl" | "ltr";

export const FLYBY_DURATION_MS = 7_600;
export const FLYBY_ACTIVITY_QUIET_MS = 6_000;

export function resolveFlybySeason(attribute: string | null): FlybySeason | null {
  switch (attribute) {
    case "autumn":
    case "christmas":
    case "tet":
      return attribute;
    default:
      return null;
  }
}

function sampleUnit(random: () => number): number {
  const value = random();
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function pick(random: () => number, min: number, max: number): number {
  return min + (max - min) * sampleUnit(random);
}

/** Preview changes cadence only; it never bypasses accessibility or activity gates. */
export function nextFlybyDelayMs({
  mobile,
  preview,
  first,
  random = Math.random,
}: {
  mobile: boolean;
  preview: boolean;
  first: boolean;
  random?: () => number;
}): number {
  if (preview) return first ? 1_300 : mobile ? 17_000 : 14_000;
  const min = mobile ? (first ? 90_000 : 105_000) : first ? 45_000 : 65_000;
  const max = mobile ? (first ? 130_000 : 160_000) : first ? 80_000 : 110_000;
  return Math.round(pick(random, min, max));
}

export type AutumnLeaf = {
  id: number;
  xPercent: number;
  sizePx: number;
  delayMs: number;
  durationMs: number;
  driftPx: number;
  swayPx: number;
  spinDeg: number;
  hueDeg: number;
  alpha: number;
};

export type ChristmasSleigh = {
  direction: FlybyDirection;
  altitudePx: number;
  endShiftPx: number;
  dipPx: number;
  bobPx: number;
  bankDeg: number;
  scale: number;
};

export type TetFirework = {
  id: number;
  xPercent: number;
  targetTopPx: number;
  lateralPx: number;
  delayMs: number;
  radiusPx: number;
  hueDeg: number;
};

export type SeasonalMotionPlan =
  | { season: "autumn"; mode: "fall"; durationMs: number; leaves: AutumnLeaf[] }
  | { season: "christmas"; mode: "glide"; durationMs: number; sleigh: ChristmasSleigh }
  | { season: "tet"; mode: "launch-burst"; durationMs: number; fireworks: TetFirework[] };

/** The next event is always one season-specific, finite action. */
export function nextSeasonalMotionPlan({
  season,
  mobile,
  previousDirection = null,
  random = Math.random,
}: {
  season: FlybySeason;
  mobile: boolean;
  previousDirection?: FlybyDirection | null;
  random?: () => number;
}): SeasonalMotionPlan {
  if (season === "autumn") {
    const count = mobile ? 3 : 6;
    const leaves = Array.from({ length: count }, (_, id): AutumnLeaf => {
      const baseX = (id + 0.5) * (100 / count);
      return {
        id,
        xPercent: Number(Math.max(4, Math.min(96, baseX + pick(random, -5, 5))).toFixed(1)),
        sizePx: Math.round(pick(random, mobile ? 18 : 24, mobile ? 28 : 39)),
        delayMs: Math.round(pick(random, 0, 1_600)),
        durationMs: Math.round(pick(random, mobile ? 7_200 : 7_900, mobile ? 9_600 : 10_600)),
        driftPx: Math.round(pick(random, -75, 75)),
        swayPx: Math.round(pick(random, 14, 42)),
        spinDeg: Math.round(pick(random, -170, 170)),
        hueDeg: Math.round(pick(random, -19, 37)),
        alpha: Number(pick(random, 0.48, 0.76).toFixed(2)),
      };
    });
    return {
      season: "autumn",
      mode: "fall",
      durationMs: Math.max(...leaves.map((leaf) => leaf.delayMs + leaf.durationMs)) + 220,
      leaves,
    };
  }

  if (season === "christmas") {
    const preferOpposite = previousDirection === "rtl" ? "ltr" : "rtl";
    const direction: FlybyDirection = previousDirection === null
      ? (sampleUnit(random) < 0.5 ? "rtl" : "ltr")
      : (sampleUnit(random) < 0.72 ? preferOpposite : previousDirection);
    const rise = sampleUnit(random) < 0.72;
    return {
      season: "christmas",
      mode: "glide",
      durationMs: Math.round(pick(random, 8_000, mobile ? 10_900 : 10_500)),
      sleigh: {
        direction,
        altitudePx: Math.round(pick(random, mobile ? 125 : 155, mobile ? 185 : 255)),
        // A diagonal slope, plus a small independent up/down float.
        endShiftPx: Math.round(rise ? pick(random, -125, -55) : pick(random, 35, 75)),
        dipPx: Math.round(pick(random, 8, 30)),
        bobPx: Math.round(pick(random, mobile ? 5 : 7, mobile ? 9 : 14)),
        bankDeg: Number(pick(random, -4, 4).toFixed(1)),
        scale: Number(pick(random, mobile ? 0.73 : 0.86, mobile ? 0.88 : 1).toFixed(2)),
      },
    };
  }

  const count = mobile ? 1 : 2;
  const fireworks = Array.from({ length: count }, (_, id): TetFirework => ({
    id,
    xPercent: Number(pick(random, id === 0 ? (mobile ? 54 : 58) : 76, id === 0 ? (mobile ? 85 : 72) : 91).toFixed(1)),
    targetTopPx: Math.round(pick(random, mobile ? 135 : 115, mobile ? 215 : 250)),
    lateralPx: Math.round(pick(random, -18, 18)),
    delayMs: id === 0 ? 0 : Math.round(pick(random, 950, 1_350)),
    radiusPx: Math.round(pick(random, mobile ? 37 : 55, mobile ? 56 : 86)),
    hueDeg: id === 0 ? 0 : Math.round(pick(random, -25, 25)),
  }));
  return {
    season: "tet",
    mode: "launch-burst",
    durationMs: mobile ? 6_900 : 7_700,
    fireworks,
  };
}
