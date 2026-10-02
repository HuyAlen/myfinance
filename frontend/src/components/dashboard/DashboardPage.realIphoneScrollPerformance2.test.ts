import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const pageSource = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const shellSource = readFileSync(path.join(frontendRoot, "src/components/layout/AppShell.tsx"), "utf8");
const cssSource = readFileSync(path.join(frontendRoot, "app/globals.css"), "utf8");

describe("REAL-IPHONE-DASHBOARD-SCROLL-2", () => {
  it("moves only the mobile Dashboard to native document scrolling", () => {
    expect(shellSource).toContain('const isDashboardRoute = pathname === "/";');
    expect(shellSource).toContain("dashboard-native-scroll");
    expect(shellSource).toContain("overflow-y-visible");
    expect(shellSource).toContain("lg:overflow-y-auto");
    expect(shellSource).toContain('min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch]');
  });

  it("disables scroll-linked reveal animation on coarse-pointer Dashboard devices", () => {
    expect(cssSource).toContain("REAL-IPHONE-DASHBOARD-SCROLL-2: native mobile Dashboard scroll performance");
    expect(cssSource).toContain("@media (max-width: 1023px) and (pointer: coarse)");
    expect(cssSource).toContain('.dashboard-native-scroll [data-dashboard-reveal="true"]');
    expect(cssSource).toContain("animation: none !important");
    expect(cssSource).toContain("animation-timeline: auto !important");
  });

  it("removes fixed/sticky backdrop filtering while the mobile Dashboard scrolls", () => {
    expect(cssSource).toContain(".dashboard-native-scroll .finance-header");
    expect(cssSource).toContain(".dashboard-native-scroll .finance-bottom-nav");
    expect(cssSource).toContain("-webkit-backdrop-filter: none !important");
    expect(cssSource).toContain("backdrop-filter: none !important");
  });

  it("keeps horizontal KPI browsing but removes snap arbitration", () => {
    const start = pageSource.indexOf("Operating KPIs · REAL-IPHONE-DASHBOARD-SCROLL-2");
    const end = pageSource.indexOf("data-dashboard-customization-toolbar", start);
    const region = pageSource.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(region).toContain("overflow-x-auto");
    expect(region).toContain("[-webkit-overflow-scrolling:touch]");
    expect(region).not.toContain("snap-x");
    expect(region).not.toContain("snap-proximity");
    expect(region).not.toContain("overscroll-x-contain");
  });

  it("does not raster the two large decorative blur circles on mobile", () => {
    expect(pageSource).toContain("hidden size-28 rounded-full bg-cyan-100/50 blur-2xl sm:block");
    expect(pageSource).toContain("hidden size-48 rounded-full bg-blue-50 blur-3xl sm:block");
  });

  it("keeps the small Net Worth history backdrop blur desktop-only", () => {
    expect(pageSource).toContain("sm:backdrop-blur-sm");
    expect(pageSource).not.toContain("shadow-[0_6px_16px_rgba(45,76,102,0.08)] backdrop-blur-sm");
  });
});
