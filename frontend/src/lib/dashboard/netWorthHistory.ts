import type { NetWorthSnapshot } from "@/src/types/finance";

export type NetWorthTrendPoint = {
  label: string;
  month: number;
  value: number | null;
  hasData: boolean;
  isSnapshotMonth: boolean;
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
      month > latestRealMonth
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
    const hasData = Boolean(snapshot) && month <= latestRealMonth;

    return {
      label: `T${month}`,
      month,
      value: hasData ? snapshot!.netWorth : null,
      hasData,
      isSnapshotMonth: hasData && month === input.selectedMonth,
    };
  });
}
