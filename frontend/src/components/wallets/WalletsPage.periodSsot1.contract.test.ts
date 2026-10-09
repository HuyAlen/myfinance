import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("WALLETS-PERIOD-SSOT-1", () => {
  it("adopts the global DateFilterProvider range instead of an independent current-month clock", () => {
    expect(source).toContain(
      'import { useDateFilter } from "@/src/components/layout/DateFilterProvider";',
    );
    expect(source).toContain("const { dateRange, filterLabel } = useDateFilter();");
    expect(source).not.toContain("function getCurrentMonthRange()");
    expect(source).not.toContain("const now = new Date();");
  });

  it("keeps reload coordination stable while always reading the latest selected period", () => {
    expect(source).toContain("const analyticsDateRangeRef = useRef(dateRange);");
    expect(source).toContain("analyticsDateRangeRef.current = dateRange;");
    expect(source).toContain(
      "const requestedDateRange = analyticsDateRangeRef.current;",
    );
    expect(source).toContain(
      "const { startDate, endDate } = requestedDateRange;",
    );
    expect(source).toContain(
      "}, [dateRange.startDate, dateRange.endDate, runReload]);",
    );
    expect(source).toContain("const reloadData = useCallback(async () => {");
    expect(source).toContain("}, []);");
  });

  it("defensively scopes Wallet transactions to the selected inclusive date range", () => {
    expect(source).toContain("const periodTxns = useMemo(");
    expect(source).toContain("transaction.date >= dateRange.startDate");
    expect(source).toContain("transaction.date <= dateRange.endDate");
    expect(source).toContain(
      "isSpendableWalletTransaction(transaction, spendableWalletIds)",
    );
    expect(source).not.toContain("transaction.date.startsWith(currentMonth)");
  });

  it("labels summary analytics as the active reporting period rather than the physical current month", () => {
    expect(source).toContain('label="Ti\u1ec1n v\u00e0o k\u1ef3 n\u00e0y"');
    expect(source).toContain('label="Ti\u1ec1n ra k\u1ef3 n\u00e0y"');
    expect(source).toContain("? filterLabel");
    expect(source).not.toContain('label="Ti\u1ec1n v\u00e0o th\u00e1ng n\u00e0y"');
    expect(source).not.toContain('label="Chi ti\u00eau th\u00e1ng n\u00e0y"');
  });

  it("uses period semantics consistently through readiness, totals, transfers, and per-wallet flow", () => {
    for (const token of [
      "periodTransactions",
      "periodAnalyticsReady",
      "isLoadingPeriodAnalytics",
      "periodAnalyticsError",
      "periodWalletCashMovement",
      "periodTransfers",
      "periodTransferTotal",
    ]) {
      expect(source).toContain(token);
    }
    expect(source).not.toContain("currentMonthTxns");
    expect(source).not.toContain("currentMonthTransfers");
    expect(source).not.toContain("currentMonthTransferTotal");
  });

  it("invalidates the previous selected-period snapshot while the new period loads", () => {
    expect(source).toMatch(
      /useEffect\(\(\) => \{\n    const timer = window\.setTimeout\(\(\) => \{\n      setPeriodAnalyticsReady\(false\);\n      setIsLoadingPeriodAnalytics\(true\);\n      setPeriodAnalyticsError\(null\);\n      void runReload\(\);\n    \}, 0\);\n    return \(\) => window\.clearTimeout\(timer\);\n  \}, \[dateRange\.startDate, dateRange\.endDate, runReload\]\);/,
    );
  });

  it("does not keep physical-current-month fallback copy on a selected-period surface", () => {
    expect(source).not.toContain(
      "Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u d\u00f2ng ti\u1ec1n th\u00e1ng n\u00e0y.",
    );
    expect(source).toContain(
      "Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u d\u00f2ng ti\u1ec1n cho k\u1ef3 \u0111\u00e3 ch\u1ecdn.",
    );
  });


  it("does not let an in-flight previous period certify the newly selected period", () => {
    expect(source).toContain(
      "const [periodAnalyticsRangeKey, setPeriodAnalyticsRangeKey] =",
    );
    expect(source).toContain(
      "const selectedPeriodRangeKey = getWalletPeriodRangeKey(dateRange);",
    );
    expect(source).toContain(
      "const requestedPeriodRangeKey = getWalletPeriodRangeKey(requestedDateRange);",
    );
    expect(source).toContain("const isLatestPeriodRequest = () =>");
    expect(
      source.match(/if \(!isLatestPeriodRequest\(\)\) return;/g),
    ).toHaveLength(2);
    expect(source).toContain("if (isLatestPeriodRequest()) {");
    expect(source).toContain(
      "periodAnalyticsRangeKey === selectedPeriodRangeKey",
    );
  });

});
