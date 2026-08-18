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
