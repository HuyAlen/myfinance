import { describe, expect, it } from "vitest";
import {
  clampFabPosition,
  computeDraggedPosition,
  exceedsDragThreshold,
  parseStoredFabPosition,
  type FabPositionBounds,
} from "./fabPosition";

/**
 * Draggable Quick Action FAB — pure position math.
 *
 * `QuickActionFab.tsx` itself cannot be exercised with a real pointer-drag
 * simulation under this project's no-React-Testing-Library convention (see
 * AGENTS.md) — actual mouse/touch dragging, click-vs-drag disambiguation,
 * safe-area/bottom-nav clearance, and resize/orientation behavior were
 * manually verified in-browser instead (see the final report). What IS
 * fully unit-testable is the deterministic math this module was extracted
 * for: viewport clamping, stored-position parsing/validation, and the drag
 * threshold check.
 */
describe("clampFabPosition", () => {
  const bounds: FabPositionBounds = {
    viewportWidth: 1440,
    viewportHeight: 900,
    fabSize: 56,
    marginX: 12,
    marginTop: 76,
    marginBottom: 16,
  };

  it("leaves an already-in-bounds position untouched", () => {
    expect(clampFabPosition({ x: 700, y: 400 }, bounds)).toEqual({
      x: 700,
      y: 400,
    });
  });

  it("clamps a position dragged past the right edge — never half off-screen", () => {
    const result = clampFabPosition({ x: 5000, y: 400 }, bounds);
    expect(result.x).toBe(bounds.viewportWidth - bounds.fabSize - bounds.marginX);
  });

  it("clamps a position dragged past the left edge", () => {
    const result = clampFabPosition({ x: -500, y: 400 }, bounds);
    expect(result.x).toBe(bounds.marginX);
  });

  it("clamps a position dragged past the bottom edge — respects the bottom-nav/safe-area margin", () => {
    const result = clampFabPosition({ x: 700, y: 5000 }, bounds);
    expect(result.y).toBe(
      bounds.viewportHeight - bounds.fabSize - bounds.marginBottom,
    );
  });

  it("clamps a position dragged past the top edge — respects the header clearance margin", () => {
    const result = clampFabPosition({ x: 700, y: -500 }, bounds);
    expect(result.y).toBe(bounds.marginTop);
  });

  it("clamps to the mobile bottom-nav margin when it is larger than desktop's", () => {
    const mobileBounds: FabPositionBounds = { ...bounds, marginBottom: 104 };
    const result = clampFabPosition({ x: 700, y: 5000 }, mobileBounds);
    expect(result.y).toBe(
      mobileBounds.viewportHeight - mobileBounds.fabSize - 104,
    );
  });

  it("never returns NaN/Infinity even on a viewport smaller than the FAB plus margins", () => {
    const tinyBounds: FabPositionBounds = {
      viewportWidth: 40,
      viewportHeight: 40,
      fabSize: 56,
      marginX: 12,
      marginTop: 76,
      marginBottom: 16,
    };
    const result = clampFabPosition({ x: 20, y: 20 }, tinyBounds);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe("parseStoredFabPosition", () => {
  it("parses a valid stored position", () => {
    expect(parseStoredFabPosition('{"x":120,"y":340}')).toEqual({
      x: 120,
      y: 340,
    });
  });

  it("returns null for a null/missing value (no prior drag ever happened)", () => {
    expect(parseStoredFabPosition(null)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseStoredFabPosition("")).toBeNull();
  });

  it("returns null for invalid JSON — never throws", () => {
    expect(parseStoredFabPosition("{not json")).toBeNull();
  });

  it("returns null when x/y are missing", () => {
    expect(parseStoredFabPosition("{}")).toBeNull();
  });

  it("returns null when x/y are the wrong type (e.g. a hand-edited string)", () => {
    expect(parseStoredFabPosition('{"x":"120","y":340}')).toBeNull();
  });

  it("returns null for non-finite numbers (Infinity/NaN survive JSON round-tripping as null, but guard explicitly)", () => {
    expect(parseStoredFabPosition('{"x":null,"y":340}')).toBeNull();
  });

  it("returns null for a stored value shaped like an entirely different feature's data", () => {
    expect(parseStoredFabPosition('{"foo":"bar"}')).toBeNull();
  });

  it("returns null for a raw JSON array instead of an object", () => {
    expect(parseStoredFabPosition("[120, 340]")).toBeNull();
  });
});

describe("exceedsDragThreshold", () => {
  it("does not count a sub-threshold movement as a drag", () => {
    expect(exceedsDragThreshold(2, 2, 5)).toBe(false);
  });

  it("counts movement exceeding the threshold on the X axis alone", () => {
    expect(exceedsDragThreshold(6, 0, 5)).toBe(true);
  });

  it("counts movement exceeding the threshold on the Y axis alone", () => {
    expect(exceedsDragThreshold(0, 6, 5)).toBe(true);
  });

  it("treats negative deltas the same as positive (direction-agnostic)", () => {
    expect(exceedsDragThreshold(-6, 0, 5)).toBe(true);
  });

  it("is exclusive at exactly the threshold value (not yet a drag)", () => {
    expect(exceedsDragThreshold(5, 5, 5)).toBe(false);
  });
});

describe("computeDraggedPosition (grab-offset preservation — no snapping to pointer)", () => {
  it("moves the element by exactly the pointer's own delta, not to the pointer's location", () => {
    // Grabbed 20px right / 10px down from the button's own top-left corner
    // (button at (100,100), pointer at (120,110)) — a naive "snap center/
    // corner to pointer" implementation would jump the button to (120,110)
    // or similar; the correct result keeps that same 20/10 grab offset
    // constant as the pointer moves.
    const startElement = { x: 100, y: 100 };
    const startPointer = { x: 120, y: 110 };
    const currentPointer = { x: 220, y: 160 }; // moved +100 x, +50 y
    expect(
      computeDraggedPosition(startElement, startPointer, currentPointer),
    ).toEqual({ x: 200, y: 150 });
  });

  it("returns the exact start position when the pointer has not moved (continuity at drag start)", () => {
    const startElement = { x: 300, y: 400 };
    const startPointer = { x: 315, y: 420 };
    expect(
      computeDraggedPosition(startElement, startPointer, startPointer),
    ).toEqual(startElement);
  });

  it("handles movement toward the top-left (negative deltas) the same way", () => {
    const startElement = { x: 300, y: 400 };
    const startPointer = { x: 320, y: 420 };
    const currentPointer = { x: 270, y: 380 }; // moved -50 x, -40 y
    expect(
      computeDraggedPosition(startElement, startPointer, currentPointer),
    ).toEqual({ x: 250, y: 360 });
  });

  it("is mathematically equivalent to the pointer-offset formulation (clientX - grabOffsetX)", () => {
    // grabOffsetX = startPointer.x - startElement.x; the two formulations
    // must always agree, since they're algebraically the same expression.
    const startElement = { x: 42, y: 17 };
    const startPointer = { x: 61, y: 33 };
    const currentPointer = { x: 501, y: 12 };
    const grabOffsetX = startPointer.x - startElement.x;
    const grabOffsetY = startPointer.y - startElement.y;
    const viaOffset = {
      x: currentPointer.x - grabOffsetX,
      y: currentPointer.y - grabOffsetY,
    };
    expect(
      computeDraggedPosition(startElement, startPointer, currentPointer),
    ).toEqual(viaOffset);
  });
});
