import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const pageSource = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const shellSource = readFileSync(path.join(frontendRoot, "src/components/layout/AppShell.tsx"), "utf8");

describe("DASHBOARD-UNIFIED-SCROLL-1", () => {
  it("keeps Dashboard on the same finance-main scroll owner as every other page", () => {
    expect(shellSource).toContain("finance-shell h-(--app-height) overflow-hidden");
    expect(shellSource).toContain("finance-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto");
    expect(shellSource).not.toContain('const isDashboardRoute = pathname === "/";');
    expect(shellSource).not.toContain("dashboard-native-scroll");
    expect(shellSource).not.toContain("overflow-y-visible");
  });

  it("keeps horizontal KPI browsing independent from the shared vertical page scroller", () => {
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
