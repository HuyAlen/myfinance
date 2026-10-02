import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("FINANCE-CONTENT-SCROLL-OWNER-2 shared authenticated scroller", () => {
  const source = readFileSync(path.resolve(__dirname, "AppShell.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("uses one shared finance-main scroller for every authenticated page", () => {
    expect(source).not.toContain("usePathname");
    expect(source).not.toContain("isDashboardRoute");
    expect(source).not.toContain("dashboard-native-scroll");
    expect(source).toContain(
      'finance-shell h-(--app-height) overflow-hidden bg-[var(--finance-page)]',
    );
    expect(source).toContain(
      'className="flex h-full min-w-0 flex-col lg:pl-72"',
    );
    expect(source).toContain(
      'finance-main min-h-0 flex-1 overflow-x-clip overflow-y-auto',
    );
    expect(source).not.toContain("[-webkit-overflow-scrolling:touch]");
  });

  it("never rewrites app height from visualViewport scroll events", () => {
    expect(source).not.toContain('visualViewport?.addEventListener("scroll"');
    expect(source).not.toContain('visualViewport?.removeEventListener("scroll"');
  });

  it("coalesces viewport resize work instead of mutating layout for each event", () => {
    expect(source).toContain("const APP_HEIGHT_SETTLE_MS = 180;");
    expect(source).toContain("const scheduleAppHeightSync = () => {");
    expect(source).toContain("settleTimerId = window.setTimeout(");
    expect(source).toContain("APP_HEIGHT_SETTLE_MS,");
    expect(source).toContain('visualViewport?.addEventListener("resize", scheduleAppHeightSync)');
    expect(source).toContain('window.addEventListener("resize", scheduleAppHeightSync)');
  });

  it("uses requestAnimationFrame for the settled style write", () => {
    expect(source).toContain("window.requestAnimationFrame(writeAppHeight)");
    expect(source).toContain("window.cancelAnimationFrame(animationFrameId)");
  });

  it("uses the visual viewport only for a likely software keyboard", () => {
    expect(source).toContain("const IOS_KEYBOARD_VIEWPORT_DELTA_PX = 120;");
    expect(source).toContain("const keyboardLikelyOpen =");
    expect(source).toContain("isKeyboardTarget &&");
    expect(source).toContain("window.innerHeight - visualViewport.height >=");
    expect(source).toContain("keyboardLikelyOpen && visualViewport");
  });

  it("cleans up timers, animation frames and resize listeners", () => {
    expect(source).toContain('visualViewport?.removeEventListener(');
    expect(source).toContain('window.removeEventListener("resize", scheduleAppHeightSync)');
    expect(source).toContain('window.removeEventListener("orientationchange", scheduleAppHeightSync)');
    expect(source).toContain("window.clearTimeout(settleTimerId)");
    expect(source).toContain("window.cancelAnimationFrame(animationFrameId)");
  });
});
