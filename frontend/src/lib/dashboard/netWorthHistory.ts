import type { NetWorthSnapshot } from "@/src/types/finance";

export type NetWorthTrendPoint = {
  label: string;
  month: number;
  value: number | null;
  hasData: boolean;
  isSnapshotMonth: boolean;
};

export type NetWorthHistorySummary = {
  snapshotCount: number;
  firstPoint: NetWorthTrendPoint | null;
  latestPoint: NetWorthTrendPoint | null;
  previousPoint: NetWorthTrendPoint | null;
  hasComparison: boolean;
  changeFromPrevious: number | null;
};

export function buildCanonicalNetWorthTrend(input: {
  snapshots: NetWorthSnapshot[];
  selectedYear: number;
  selectedMonth: number;
  now?: Date;
}): NetWorthTrendPoint[] {
  const now = input.now ?? new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const latestRealMonth =
    input.selectedYear < currentYear
      ? 12
      : input.selectedYear === currentYear
        ? currentMonth
        : 0;

  // Period semantics: history must never reveal a later month while the
  // Dashboard is intentionally reviewing an earlier month. A future selected
  // month still caps at the latest real calendar month, so selecting September
  // in August can truthfully show August as the latest recorded snapshot.
  const latestVisibleMonth = Math.min(
    latestRealMonth,
    Math.max(0, Math.min(input.selectedMonth, 12)),
  );

  const snapshotsByMonth = new Map<number, NetWorthSnapshot>();
  for (const snapshot of input.snapshots) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(snapshot.snapshotMonth);
    if (!match) continue;

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (
      year !== input.selectedYear ||
      month < 1 ||
      month > 12 ||
      month > latestVisibleMonth
    ) {
      continue;
    }

    // DB uniqueness guarantees one row per user/month. Last-write-wins here is
    // only defensive for malformed test/local data and never fabricates a row.
    snapshotsByMonth.set(month, snapshot);
  }

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const snapshot = snapshotsByMonth.get(month);
    const hasData = Boolean(snapshot) && month <= latestVisibleMonth;

    return {
      label: `T${month}`,
      month,
      value: hasData ? snapshot!.netWorth : null,
      hasData,
      isSnapshotMonth: hasData && month === input.selectedMonth,
    };
  });
}

export function summarizeCanonicalNetWorthHistory(
  trend: NetWorthTrendPoint[],
): NetWorthHistorySummary {
  const points = trend.filter(
    (point) =>
      point.hasData &&
      typeof point.value === "number" &&
      Number.isFinite(point.value),
  );

  const firstPoint = points.at(0) ?? null;
  const latestPoint = points.at(-1) ?? null;
  const previousPoint = points.length >= 2 ? points.at(-2) ?? null : null;

  return {
    snapshotCount: points.length,
    firstPoint,
    latestPoint,
    previousPoint,
    hasComparison: Boolean(latestPoint && previousPoint),
    changeFromPrevious:
      latestPoint && previousPoint
        ? Number(latestPoint.value) - Number(previousPoint.value)
        : null,
  };
}
