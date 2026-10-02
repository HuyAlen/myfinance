import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("REAL-IPHONE-DASHBOARD-SCROLL-1/2", () => {
  const source = readFileSync(path.resolve(__dirname, "AppShell.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("uses native document scrolling for Dashboard on mobile and preserves nested main scrolling elsewhere", () => {
    expect(source).toContain('import { usePathname, useRouter } from "next/navigation"');
    expect(source).toContain('const isDashboardRoute = pathname === "/";');
    expect(source).toContain("dashboard-native-scroll min-h-(--app-height) overflow-x-hidden lg:h-(--app-height) lg:overflow-hidden");
    expect(source).toContain('isDashboardRoute ? "min-h-(--app-height) lg:h-full" : "h-full"');
    expect(source).toContain("overflow-y-visible lg:min-h-0 lg:overflow-y-auto");
    expect(source).toContain("min-h-0 overflow-y-auto");
    expect(source).not.toContain(
      'finance-main flex-1 overflow-x-hidden px-3 py-4 pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-6 [-webkit-overflow-scrolling:touch]',
    );
    expect(source).not.toContain(
      'min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch]',
    );
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

  it("keeps normal browser-chrome scrolling anchored to innerHeight", () => {
    expect(source).toContain(": window.innerHeight || document.documentElement.clientHeight;");
  });

  it("cleans up timers, animation frames and resize listeners", () => {
    expect(source).toContain('visualViewport?.removeEventListener(');
    expect(source).toContain('window.removeEventListener("resize", scheduleAppHeightSync)');
    expect(source).toContain('window.removeEventListener("orientationchange", scheduleAppHeightSync)');
    expect(source).toContain("window.clearTimeout(settleTimerId)");
    expect(source).toContain("window.cancelAnimationFrame(animationFrameId)");
  });
});
