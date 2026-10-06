import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const intelligence = readFileSync(
  path.resolve(__dirname, "../../lib/dashboard/dashboardIntelligence.ts"),
  "utf8",
);
const history = readFileSync(
  path.resolve(__dirname, "../../lib/dashboard/netWorthHistory.ts"),
  "utf8",
);

describe("DASHBOARD-NETWORTH-MONTH-KEY-INTEGRITY-1", () => {
  it("owns DATE-to-month normalization in the canonical Net Worth history module", () => {
    expect(history).toContain("export function getNetWorthSnapshotMonthKey");
    expect(history).toContain("NET_WORTH_SNAPSHOT_MONTH_SHAPE");
    expect(history).toContain("Date.UTC(year, month - 1, day)");
  });

  it("normalizes snapshot_month before Attribution filtering and deduplication", () => {
    expect(intelligence).toContain(
      "getNetWorthSnapshotMonthKey(snapshot.snapshotMonth)",
    );
    expect(intelligence).toContain("(item) => item.monthKey <= maxMonth");
    expect(intelligence).toContain("fromMonth: previous.monthKey");
    expect(intelligence).toContain("toMonth: current.monthKey");
    expect(intelligence).not.toContain(
      "snapshot.snapshotMonth <= maxMonth",
    );
  });

  it("normalizes snapshot_month before Data Health checks the current month", () => {
    expect(intelligence).toContain(
      "getNetWorthSnapshotMonthKey(snapshot.snapshotMonth) ===",
    );
    expect(intelligence).not.toContain(
      "snapshot.snapshotMonth === input.selectedMonthKey",
    );
  });

  it("lets Month-End Closeout consume the normalized Attribution month key", () => {
    expect(dashboard).toContain(
      "netWorthAttribution.toMonth === dashboardMonthKey",
    );
    expect(dashboard).toMatch(
      /netWorthDelta:\s*netWorthAttribution\.available\s*&&\s*netWorthAttribution\.toMonth === dashboardMonthKey\s*\?\s*netWorthAttribution\.netWorthDelta\s*:\s*null/,
    );
  });

  it("adds no Net Worth query and keeps the existing year-bounded history reads", () => {
    expect(dashboard.split("getNetWorthSnapshotsInRange(").length - 1).toBe(2);
    expect(
      dashboard.split(
        'getNetWorthSnapshotsInRange(`${selectedPeriodEndYear}-01-01`, `${selectedPeriodEndYear}-12-01`)',
      ).length - 1,
    ).toBe(1);
    expect(dashboard).toMatch(
      /getNetWorthSnapshotsInRange\(\s*`\$\{selectedPeriodEndYear\}-01-01`,\s*`\$\{selectedPeriodEndYear\}-12-01`,?\s*\)/,
    );
  });
});