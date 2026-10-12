/** Mobile bottom-navigation auto-hide logic. No DOM dependency. */
export type MobileBottomNavScrollState = {
  previousTop: number;
  travel: number;
  hidden: boolean;
};

export const MOBILE_NAV_TOP_REVEAL_PX = 56;
export const MOBILE_NAV_MIN_HIDE_SCROLL_PX = 112;
export const MOBILE_NAV_HIDE_TRAVEL_PX = 38;
export const MOBILE_NAV_SHOW_TRAVEL_PX = 16;

export function initialMobileBottomNavScrollState(
  scrollTop = 0,
): MobileBottomNavScrollState {
  return {
    previousTop: Math.max(0, scrollTop),
    travel: 0,
    hidden: false,
  };
}

/**
 * Track accumulated direction rather than single events, because iPhone's
 * momentum scroll produces many tiny deltas. Reverse direction resets travel.
 * Clamping negative scrollTop handles Safari rubber-band overscroll.
 */
export function nextMobileBottomNavScrollState(
  state: MobileBottomNavScrollState,
  rawScrollTop: number,
): MobileBottomNavScrollState {
  const top = Math.max(0, rawScrollTop);

  if (top <= MOBILE_NAV_TOP_REVEAL_PX) {
    return { previousTop: top, travel: 0, hidden: false };
  }

  const delta = top - state.previousTop;
  if (Math.abs(delta) < 0.5) {
    return { ...state, previousTop: top };
  }

  const travel = Math.max(
    -96,
    Math.min(
      96,
      (delta > 0 ? Math.max(0, state.travel) : Math.min(0, state.travel)) +
        delta,
    ),
  );

  let hidden = state.hidden;
  if (
    !hidden &&
    delta > 0 &&
    top >= MOBILE_NAV_MIN_HIDE_SCROLL_PX &&
    travel >= MOBILE_NAV_HIDE_TRAVEL_PX
  ) {
    hidden = true;
  } else if (hidden && delta < 0 && travel <= -MOBILE_NAV_SHOW_TRAVEL_PX) {
    hidden = false;
  }

  return { previousTop: top, travel, hidden };
}
