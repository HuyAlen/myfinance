import { describe, expect, it } from "vitest";
import {
  initialMobileBottomNavScrollState,
  nextMobileBottomNavScrollState,
} from "./mobileBottomNavScroll";

function scroll(...positions: number[]) {
  return positions.reduce(
    (state, top) => nextMobileBottomNavScrollState(state, top),
    initialMobileBottomNavScrollState(),
  );
}

describe("MYFINANCE-MOBILE-BOTTOM-NAV-AUTOHIDE-1", () => {
  it("starts visible and remains visible near the start of a page", () => {
    expect(initialMobileBottomNavScrollState().hidden).toBe(false);
    expect(scroll(12, 32, 52).hidden).toBe(false);
  });

  it("does not flicker on small downwards scrolls", () => {
    expect(scroll(60, 67, 73, 76, 80).hidden).toBe(false);
  });

  it("hides after scrolling down past the top guard and travel threshold", () => {
    expect(scroll(60, 90, 123).hidden).toBe(true);
  });

  it("requires a meaningful upward motion before showing again", () => {
    const hidden = scroll(60, 90, 123, 150);
    expect(hidden.hidden).toBe(true);
    const tinyUp = nextMobileBottomNavScrollState(hidden, 141);
    expect(tinyUp.hidden).toBe(true);
    const upward = nextMobileBottomNavScrollState(tinyUp, 132);
    expect(upward.hidden).toBe(false);
  });

  it("reveals automatically when scrolling back near the page top", () => {
    expect(scroll(160, 240, 190, 49).hidden).toBe(false);
  });

  it("reversing scroll direction clears the previous accumulated travel", () => {
    const state = scroll(70, 90, 112, 134, 144);
    expect(state.hidden).toBe(true);
    const rise = nextMobileBottomNavScrollState(state, 136);
    const down = nextMobileBottomNavScrollState(rise, 139);
    expect(down.hidden).toBe(true);
    expect(down.travel).toBe(3);
  });

  it("clamps negative Safari rubber-band overscroll", () => {
    const state = nextMobileBottomNavScrollState(
      initialMobileBottomNavScrollState(10),
      -15,
    );
    expect(state.previousTop).toBe(0);
    expect(state.hidden).toBe(false);
  });

  it("handles long momentum jumps and caps accumulated travel", () => {
    const state = scroll(250, 800);
    expect(state.hidden).toBe(true);
    expect(state.travel).toBe(96);
  });
});
