import { describe, expect, it } from "vitest";
import {
  clampFabPosition,
  computeDraggedPosition,
  computeQuickActionPanelPosition,
  exceedsDragThreshold,
  parseStoredFabPosition,
  shouldCloseMobileMenuOnOutsidePointerDown,
  type FabPositionBounds,
  type QuickActionPanelGeometry,
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

describe("shouldCloseMobileMenuOnOutsidePointerDown — mobile-only, non-modal outside-tap-to-close", () => {
  it("closes on mobile when the tap lands outside both the panel and the FAB", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(390, false, false)).toBe(
      true,
    );
  });

  it("does not close when the tap lands inside the panel itself", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(390, true, false)).toBe(
      false,
    );
  });

  it("does not close when the tap lands on the FAB button (its own onClick handles the toggle)", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(390, false, true)).toBe(
      false,
    );
  });

  it("never closes on desktop (>= 1024px) — outside-click-to-close was never desktop's behavior and must not become it", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(1440, false, false)).toBe(
      false,
    );
  });

  it("is desktop-inert exactly at the established lg breakpoint (1024px)", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(1024, false, false)).toBe(
      false,
    );
  });

  it("is still mobile just below the breakpoint (1023px)", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(1023, false, false)).toBe(
      true,
    );
  });

  it("on desktop, being outside both panel/FAB still never closes — desktop is fully unaffected regardless of containment", () => {
    expect(shouldCloseMobileMenuOnOutsidePointerDown(1440, true, true)).toBe(
      false,
    );
  });
});

describe("computeQuickActionPanelPosition — mobile panel follows the FAB", () => {
  const VIEWPORT_WIDTH = 390;
  const VIEWPORT_HEIGHT = 844;
  const PANEL_WIDTH = 272;
  const PANEL_HEIGHT = 144;
  const MARGIN = 16;
  const GAP = 10;
  const SAFE_TOP = 76;
  const SAFE_BOTTOM = 104;
  const FAB_SIZE = 56;

  function baseGeometry(
    fabRect: QuickActionPanelGeometry["fabRect"],
  ): QuickActionPanelGeometry {
    return {
      fabRect,
      panelWidth: PANEL_WIDTH,
      panelHeight: PANEL_HEIGHT,
      viewportWidth: VIEWPORT_WIDTH,
      viewportHeight: VIEWPORT_HEIGHT,
      margin: MARGIN,
      gap: GAP,
      safeTop: SAFE_TOP,
      safeBottom: SAFE_BOTTOM,
    };
  }

  it("default bottom-right FAB opens the panel above-left", () => {
    // Bottom-right anchor: right-4 (16px from right edge), just above
    // BottomNav — mirrors QuickActionFab's real default CSS anchor.
    const fabRect = {
      left: VIEWPORT_WIDTH - FAB_SIZE - 16,
      top: VIEWPORT_HEIGHT - SAFE_BOTTOM - FAB_SIZE - 8,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.placement).toBe("above-left");
    expect(result.top).toBeLessThan(fabRect.top);
    // Panel's right edge aligns with the FAB's right edge (extends left).
    expect(result.left + PANEL_WIDTH).toBeCloseTo(
      fabRect.left + fabRect.width,
      0,
    );
  });

  it("bottom-left FAB opens the panel above-right", () => {
    const fabRect = {
      left: 16,
      top: VIEWPORT_HEIGHT - SAFE_BOTTOM - FAB_SIZE - 8,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.placement).toBe("above-right");
    expect(result.top).toBeLessThan(fabRect.top);
    // Panel's left edge aligns with the FAB's left edge (extends right).
    expect(result.left).toBeCloseTo(fabRect.left, 0);
  });

  it("top-right FAB opens the panel below-left", () => {
    const fabRect = {
      left: VIEWPORT_WIDTH - FAB_SIZE - 16,
      top: SAFE_TOP + 8,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.placement).toBe("below-left");
    expect(result.top).toBeGreaterThan(fabRect.top + fabRect.height);
  });

  it("top-left FAB opens the panel below-right", () => {
    const fabRect = {
      left: 16,
      top: SAFE_TOP + 8,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.placement).toBe("below-right");
    expect(result.top).toBeGreaterThan(fabRect.top + fabRect.height);
  });

  it("a FAB near the center of the screen still gets a panel positioned close to it (does not snap to a fixed bottom-of-screen location)", () => {
    const fabRect = {
      left: VIEWPORT_WIDTH / 2 - FAB_SIZE / 2,
      top: VIEWPORT_HEIGHT / 2 - FAB_SIZE / 2,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    // Vertically adjacent to the FAB (either directly above or below it,
    // separated by exactly the gap), never far away at a canonical spot.
    const isDirectlyAbove =
      Math.abs(result.top + PANEL_HEIGHT + GAP - fabRect.top) < 1;
    const isDirectlyBelow =
      Math.abs(result.top - GAP - (fabRect.top + fabRect.height)) < 1;
    expect(isDirectlyAbove || isDirectlyBelow).toBe(true);
  });

  it("prefers opening above when there is enough room on both sides", () => {
    const fabRect = {
      left: 16,
      top: VIEWPORT_HEIGHT / 2,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));
    expect(result.placement.startsWith("above")).toBe(true);
  });

  it("clamps horizontally so the panel never overflows the left/right viewport edges", () => {
    // FAB pinned at the absolute left edge — naive alignment would put the
    // panel's left edge at 0, violating the margin.
    const fabRect = { left: 0, top: 300, width: FAB_SIZE, height: FAB_SIZE };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.left).toBeGreaterThanOrEqual(MARGIN);
    expect(result.left + PANEL_WIDTH).toBeLessThanOrEqual(
      VIEWPORT_WIDTH - MARGIN,
    );
  });

  it("clamps vertically so the panel never overlaps BottomNav (respects safeBottom)", () => {
    // FAB dragged as low as the FAB's own clamp would ever allow.
    const fabRect = {
      left: 100,
      top: VIEWPORT_HEIGHT - SAFE_BOTTOM - FAB_SIZE,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.top + PANEL_HEIGHT).toBeLessThanOrEqual(
      VIEWPORT_HEIGHT - SAFE_BOTTOM - MARGIN,
    );
  });

  it("clamps vertically so the panel never overlaps the top safe area (respects safeTop)", () => {
    const fabRect = { left: 100, top: SAFE_TOP, width: FAB_SIZE, height: FAB_SIZE };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    expect(result.top).toBeGreaterThanOrEqual(SAFE_TOP + MARGIN);
  });

  it("never returns a position that overlaps any viewport edge, across a sweep of FAB positions", () => {
    const fabPositions = [
      { left: 0, top: 0 },
      { left: VIEWPORT_WIDTH - FAB_SIZE, top: 0 },
      { left: 0, top: VIEWPORT_HEIGHT - FAB_SIZE },
      { left: VIEWPORT_WIDTH - FAB_SIZE, top: VIEWPORT_HEIGHT - FAB_SIZE },
      { left: VIEWPORT_WIDTH / 2 - FAB_SIZE / 2, top: VIEWPORT_HEIGHT / 2 },
    ];

    for (const { left, top } of fabPositions) {
      const result = computeQuickActionPanelPosition(
        baseGeometry({ left, top, width: FAB_SIZE, height: FAB_SIZE }),
      );
      expect(result.left).toBeGreaterThanOrEqual(MARGIN);
      expect(result.left + PANEL_WIDTH).toBeLessThanOrEqual(
        VIEWPORT_WIDTH - MARGIN,
      );
      expect(result.top).toBeGreaterThanOrEqual(SAFE_TOP + MARGIN - 1); // -1 for floating point tolerance
      expect(result.top + PANEL_HEIGHT).toBeLessThanOrEqual(
        VIEWPORT_HEIGHT - SAFE_BOTTOM - MARGIN + 1,
      );
    }
  });

  it("keeps a visible gap between the FAB and the panel rather than letting them touch or overlap", () => {
    const fabRect = {
      left: VIEWPORT_WIDTH - FAB_SIZE - 16,
      top: VIEWPORT_HEIGHT - SAFE_BOTTOM - FAB_SIZE - 8,
      width: FAB_SIZE,
      height: FAB_SIZE,
    };
    const result = computeQuickActionPanelPosition(baseGeometry(fabRect));

    // placement is "above" here, so the panel's bottom edge should sit
    // `gap` px above the FAB's top edge (when not clamped).
    expect(fabRect.top - (result.top + PANEL_HEIGHT)).toBeCloseTo(GAP, 0);
  });
});
