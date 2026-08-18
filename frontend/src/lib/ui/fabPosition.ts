/**
 * Pure, framework-free position math for a draggable floating action
 * button. No React, no DOM, no localStorage access — callers own reading
 * `window.innerWidth`/`innerHeight` and localStorage; this module only
 * does the deterministic math so it can be unit-tested directly.
 */

export type FabPosition = {
  x: number;
  y: number;
};

export type FabPositionBounds = {
  viewportWidth: number;
  viewportHeight: number;
  fabSize: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Keeps a FAB's top-left position fully inside the given viewport bounds —
 * never half off-screen, never under a reserved top/bottom margin (header,
 * bottom nav, safe area). If the viewport is smaller than the FAB itself
 * plus its margins, `min(max)` still returns a bounded value (may exceed
 * the intended margin, but never returns NaN/Infinity or an unclamped
 * coordinate).
 */
export function clampFabPosition(
  position: FabPosition,
  bounds: FabPositionBounds,
): FabPosition {
  return {
    x: clampNumber(
      position.x,
      bounds.marginX,
      bounds.viewportWidth - bounds.fabSize - bounds.marginX,
    ),
    y: clampNumber(
      position.y,
      bounds.marginTop,
      bounds.viewportHeight - bounds.fabSize - bounds.marginBottom,
    ),
  };
}

/**
 * Parses a raw localStorage value into a valid FabPosition, or null if it's
 * missing, malformed, shaped wrong, or contains non-finite numbers — never
 * trust old/foreign stored data blindly (a previous app version, a
 * hand-edited value, or storage corruption must not crash or move the FAB
 * to NaN/Infinity coordinates).
 */
export function parseStoredFabPosition(
  raw: string | null,
): FabPosition | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof FabPosition, unknown>>;
    const { x, y } = parsed;

    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { x, y };
  } catch {
    return null;
  }
}

/**
 * Has the pointer moved far enough from its pointerdown position to count
 * as a drag rather than a click? Compared against the raw (unclamped, can
 * be negative) delta on each axis independently, matching how a drag
 * threshold is conventionally applied (either axis alone can trigger it).
 */
export function exceedsDragThreshold(
  deltaX: number,
  deltaY: number,
  threshold: number,
): boolean {
  return Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
}

/**
 * The FAB's next (unclamped) top-left position such that the exact point
 * the pointer grabbed stays under the pointer for the entire drag — i.e.
 * the button moves BY the pointer's own delta since pointerdown, it is
 * never recentered/snapped under the pointer's current location. Capture
 * `startElementPosition` from the button's actual `getBoundingClientRect()`
 * at pointerdown time (not from any bottom/right-derived assumption), so
 * this is correct on the very first drag even while the button is still
 * sitting on its original CSS-anchored default position.
 */
export function computeDraggedPosition(
  startElementPosition: FabPosition,
  startPointer: FabPosition,
  currentPointer: FabPosition,
): FabPosition {
  return {
    x: startElementPosition.x + (currentPointer.x - startPointer.x),
    y: startElementPosition.y + (currentPointer.y - startPointer.y),
  };
}

/** Matches the app's one established `lg` breakpoint (1024px), already used
 * by `getViewportBounds()`'s own desktop/mobile split — not a new value. */
const DESKTOP_BREAKPOINT_PX = 1024;

/**
 * Decides whether a pointerdown outside the mobile Quick Action panel
 * should close it. Deliberately desktop-inert: below `DESKTOP_BREAKPOINT_PX`
 * the desktop action stack isn't even rendered (see QuickActionFab.tsx's
 * `lg:flex`/`lg:hidden` split), and it never had outside-click-to-close
 * behavior before this — this function must never introduce that on
 * desktop, only give mobile's lightweight, non-modal panel a way to close
 * without a full-screen backdrop element. Takes plain booleans/numbers
 * (never a DOM Node or Event) so the decision itself is directly testable;
 * the caller does the actual `ref.contains(event.target)` containment
 * checks and the `window.innerWidth` read.
 */
export function shouldCloseMobileMenuOnOutsidePointerDown(
  viewportWidth: number,
  pointerInsidePanel: boolean,
  pointerInsideFabButton: boolean,
): boolean {
  if (viewportWidth >= DESKTOP_BREAKPOINT_PX) return false;
  return !pointerInsidePanel && !pointerInsideFabButton;
}

export type FabRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type QuickActionPanelGeometry = {
  fabRect: FabRect;
  panelWidth: number;
  panelHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Horizontal clearance from the viewport's left/right edges. */
  margin: number;
  /** Visual separation kept between the FAB and the panel. */
  gap: number;
  /** Vertical clearance reserved above (header) and below (BottomNav +
   * safe-area-inset-bottom) the FAB — the same heuristic values
   * `getViewportBounds()` already uses for clamping the FAB itself. */
  safeTop: number;
  safeBottom: number;
};

export type QuickActionPanelPlacement =
  | "above-left"
  | "above-right"
  | "below-left"
  | "below-right";

export type QuickActionPanelPosition = {
  left: number;
  top: number;
  placement: QuickActionPanelPlacement;
};

/**
 * Positions the mobile Quick Action panel relative to the FAB's CURRENT
 * on-screen rect (default anchor, restored, or freshly dragged — this
 * function doesn't care which, it only takes the rect), instead of a fixed
 * canonical spot above BottomNav. Two independent decisions, each falling
 * back gracefully when the preferred side is too tight, then a final
 * viewport clamp so the result can never overflow regardless of how those
 * decisions landed:
 *
 * - Vertical: prefer opening ABOVE the FAB (typical for a bottom-anchored
 *   FAB); fall back to BELOW if there isn't room above but there is below;
 *   if neither side comfortably fits, pick whichever has more room.
 * - Horizontal: align toward whichever side of the FAB has more room — if
 *   the FAB's center is past the viewport's horizontal midpoint (FAB on the
 *   right half), the panel's right edge aligns with the FAB's right edge
 *   (panel extends left); otherwise the panel's left edge aligns with the
 *   FAB's left edge (panel extends right).
 *
 * `placement` names the side pair actually chosen (e.g. the default
 * bottom-right FAB position produces "above-left") — informational for
 * callers/tests, not consumed by the positioning math itself.
 */
export function computeQuickActionPanelPosition(
  geometry: QuickActionPanelGeometry,
): QuickActionPanelPosition {
  const {
    fabRect,
    panelWidth,
    panelHeight,
    viewportWidth,
    viewportHeight,
    margin,
    gap,
    safeTop,
    safeBottom,
  } = geometry;

  const fabCenterX = fabRect.left + fabRect.width / 2;
  const extendLeft = fabCenterX > viewportWidth / 2;

  const spaceAbove = fabRect.top - safeTop;
  const spaceBelow =
    viewportHeight - safeBottom - (fabRect.top + fabRect.height);

  let openAbove: boolean;
  if (spaceAbove >= panelHeight + gap) {
    openAbove = true;
  } else if (spaceBelow >= panelHeight + gap) {
    openAbove = false;
  } else {
    openAbove = spaceAbove >= spaceBelow;
  }

  const rawTop = openAbove
    ? fabRect.top - gap - panelHeight
    : fabRect.top + fabRect.height + gap;
  const rawLeft = extendLeft
    ? fabRect.left + fabRect.width - panelWidth
    : fabRect.left;

  const left = clampNumber(rawLeft, margin, viewportWidth - panelWidth - margin);
  const top = clampNumber(
    rawTop,
    safeTop + margin,
    viewportHeight - panelHeight - safeBottom - margin,
  );

  const placement: QuickActionPanelPlacement = `${openAbove ? "above" : "below"}-${
    extendLeft ? "left" : "right"
  }`;

  return { left, top, placement };
}
