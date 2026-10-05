import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const pageSource = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const shellSource = readFileSync(path.join(frontendRoot, "src/components/layout/AppShell.tsx"), "utf8");

describe("FINANCE-CONTENT-SCROLL-OWNER-2 Dashboard scroll contract", () => {
  it("uses the same finance-main scroll owner as every authenticated page", () => {
    expect(shellSource).toContain("finance-shell h-(--app-height) overflow-hidden");
    expect(shellSource).toContain(
      "finance-main min-h-0 flex-1 overflow-x-clip overflow-y-auto",
    );
    expect(shellSource).not.toContain('const isDashboardRoute = pathname === "/";');
    expect(shellSource).not.toContain("dashboard-native-scroll");
  });

  it("prevents Dashboard root from becoming another vertical scroll container", () => {
    expect(pageSource).toContain(
      "dashboard-depth-root scroll-smooth min-w-0 max-w-full space-y-4 overflow-x-clip sm:space-y-5",
    );
    const start = pageSource.indexOf('data-dashboard-depth="true"');
    const region = pageSource.slice(start, start + 350);
    expect(region).not.toContain("overflow-y-auto");
    expect(region).not.toContain("overflow-y-scroll");
  });

  it("keeps KPI layout inside the shared vertical scroller without creating a nested horizontal scroll owner", () => {
    const start = pageSource.indexOf("Operating KPIs");
    const end = pageSource.indexOf("data-dashboard-customization-toolbar", start);
    const region = pageSource.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    expect(region).toContain(
      'className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 xl:grid-cols-5"',
    );
    expect(region).not.toContain("overflow-x-auto");
    expect(region).not.toContain("[-webkit-overflow-scrolling:touch]");
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
