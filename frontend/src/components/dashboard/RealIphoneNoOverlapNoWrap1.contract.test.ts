import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const quickAction = readFileSync(
  path.resolve(__dirname, "../layout/QuickActionFab.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const dashboard = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const netWorthChart = readFileSync(
  path.resolve(__dirname, "NetWorthTrendChart.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const reconciliation = readFileSync(
  path.resolve(__dirname, "../wallets/WalletReconciliationCenter.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("REAL-IPHONE-NO-OVERLAP-NOWRAP-1", () => {
  it("keeps the restored quick-action FAB inside the real iPhone mobile safe region", () => {
    expect(quickAction).toContain(
      'bottom-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)]',
    );
    expect(quickAction).toContain(
      'className="fixed left-0 top-0 z-100"',
    );

    expect(quickAction).not.toContain(
      "z-100 hidden flex-col items-end gap-2 lg:bottom-6 lg:flex",
    );
    expect(quickAction).not.toContain(
      'className="fixed left-0 top-0 z-100 hidden lg:block"',
    );
  });

  it("renders Dashboard operating KPIs as an in-viewport mobile grid instead of a clipped horizontal carousel", () => {
    expect(dashboard).toContain(
      'className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3 xl:grid-cols-5"',
    );
    expect(dashboard).not.toContain(
      '-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none',
    );
    expect(dashboard).toContain("last:col-span-2 md:last:col-span-1");
    expect(dashboard).toContain(
      'className="whitespace-nowrap text-[10px] font-bold tracking-[-0.02em] text-slate-600 sm:text-xs sm:tracking-normal"',
    );
  });

  it("prevents adjacent Net Worth point labels from colliding without hiding middle snapshot months", () => {
    expect(netWorthChart).toContain("let snapshotLabelIndex = 0;");
    expect(netWorthChart).toContain("chartLabelNear:");
    expect(netWorthChart).toContain("chartLabelFar:");
    expect(netWorthChart).toContain('dataKey="chartLabelNear"');
    expect(netWorthChart).toContain('dataKey="chartLabelFar"');
    expect(netWorthChart).not.toContain("const firstPoint = snapshotPoints[0] ?? null;");
  });

  it("uses a 2+1 reconciliation summary on mobile and keeps summary labels on one line", () => {
    expect(reconciliation).toContain(
      'className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3"',
    );
    expect(reconciliation).toContain(
      'className="col-span-2 rounded-2xl border border-orange-100 bg-orange-50/70 p-3 sm:col-span-1"',
    );
    expect(
      reconciliation.split(
        'className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide"',
      ).length - 1,
    ).toBe(3);
  });
});
