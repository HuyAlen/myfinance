import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  shouldDockMobileDashboardFab,
  type FabPositionBounds,
} from "./fabPosition";

const bounds: FabPositionBounds = {
  viewportWidth: 390,
  viewportHeight: 844,
  fabSize: 48,
  marginX: 12,
  marginTop: 216,
  marginBottom: 104,
};

describe("MYFINANCE IPHONE DASHBOARD FAB DOCK P0", () => {
  it("re-docks stale saved mobile FAB positions that block Dashboard KPI cards", () => {
    expect(shouldDockMobileDashboardFab("/", { x: 330, y: 250 }, bounds)).toBe(true);
    expect(shouldDockMobileDashboardFab("/", { x: 330, y: 485 }, bounds)).toBe(true);
  });

  it("preserves FAB placement already near the bottom-safe mobile zone", () => {
    expect(shouldDockMobileDashboardFab("/", { x: 330, y: 675 }, bounds)).toBe(false);
  });

  it("does not interfere with other pages, tablet, desktop or first-time users", () => {
    expect(shouldDockMobileDashboardFab("/transactions", { x: 330, y: 250 }, bounds)).toBe(false);
    expect(shouldDockMobileDashboardFab("/", null, bounds)).toBe(false);
    expect(shouldDockMobileDashboardFab("/", { x: 900, y: 250 }, { ...bounds, viewportWidth: 1100 })).toBe(false);
    expect(shouldDockMobileDashboardFab("/", { x: 600, y: 250 }, { ...bounds, viewportWidth: 800 })).toBe(false);
  });

  it("handles compact iPhone heights without placing the FAB under BottomNav", () => {
    const compact = { ...bounds, viewportWidth: 320, viewportHeight: 660 };
    expect(shouldDockMobileDashboardFab("/", { x: 260, y: 235 }, compact)).toBe(true);
    expect(shouldDockMobileDashboardFab("/", { x: 260, y: 480 }, compact)).toBe(false);
  });

  it("retains the existing storage key and drag controls while rechecking on Dashboard navigation", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../components/layout/QuickActionFab.tsx"),
      "utf8",
    );
    expect(source).toContain('const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";');
    expect(source).toContain("shouldDockMobileDashboardFab(window.location.pathname, restored, bounds)");
    expect(source).toContain("const pathname = usePathname()");
    expect(source).toContain("}, [pathname]);");
    expect(source).toContain("handlePointerMove");
    expect(source).toContain("saveStoredPosition(finalPosition)");
  });
});
