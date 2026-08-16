import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTransactionsEffectiveRange } from "@/src/lib/transactions/transactionsPeriod";
import { parseTransactionsContext } from "@/src/lib/navigation/financeNavigation";

/**
 * TXN-CORRECTNESS-1 — Global Period Integration (F-2/F-3/F-7).
 *
 * The Transactions Page Full Audit found:
 *  - F-2: the page only ever consumed `selectedMonth` from useDateFilter(),
 *    ignoring `dateRange`/`filterMode` — in quarter/year/custom global-period
 *    mode it silently fetched/showed only one calendar month.
 *  - F-3: a Dashboard drill-down link (?month=2026-03) could seed LOCAL
 *    date filters to March while the actual data fetch stayed on the
 *    stale global month (e.g. August), guaranteeing a false "no results".
 *  - F-7: summary totals were computed off the filtered list while the
 *    header text implied whole-period coverage, with no on-screen
 *    indication when filters were narrowing the numbers shown.
 *
 * `resolveTransactionsEffectiveRange` is the single pure function that
 * now decides "what date range is Transactions actually showing" for
 * both the fetch and the visible filter window — tested here directly,
 * behaviorally. The remaining wiring checks (that reloadData/filtered
 * actually consume its result, that no `new Date()` fallback was
 * introduced, and that the header disambiguates filtered vs period
 * totals) are source-inspection, matching this repo's no-RTL convention.
 */

describe("resolveTransactionsEffectiveRange: precedence (F-2/F-3)", () => {
  const globalMonthRange = { startDate: "2026-08-01", endDate: "2026-08-31" };

  it("no URL drill-down context: the global range wins", () => {
    expect(resolveTransactionsEffectiveRange(globalMonthRange, null)).toEqual(
      globalMonthRange,
    );
    expect(
      resolveTransactionsEffectiveRange(globalMonthRange, undefined),
    ).toEqual(globalMonthRange);
    expect(resolveTransactionsEffectiveRange(globalMonthRange, {})).toEqual(
      globalMonthRange,
    );
  });

  it("an explicit URL drill-down date range wins over the global range", () => {
    const urlContext = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };
    expect(
      resolveTransactionsEffectiveRange(globalMonthRange, urlContext),
    ).toEqual({ startDate: "2026-03-01", endDate: "2026-03-31" });
  });

  it("a partial URL context (only dateFrom, no dateTo) does not override — global range wins", () => {
    expect(
      resolveTransactionsEffectiveRange(globalMonthRange, {
        dateFrom: "2026-03-01",
      }),
    ).toEqual(globalMonthRange);
  });

  it("a global quarter/year/custom range is preserved as-is when there is no URL override", () => {
    const quarterRange = { startDate: "2026-01-01", endDate: "2026-03-31" };
    expect(resolveTransactionsEffectiveRange(quarterRange, null)).toEqual(
      quarterRange,
    );

    const yearRange = { startDate: "2026-01-01", endDate: "2026-12-31" };
    expect(resolveTransactionsEffectiveRange(yearRange, null)).toEqual(
      yearRange,
    );

    const customRange = { startDate: "2026-05-10", endDate: "2026-06-02" };
    expect(resolveTransactionsEffectiveRange(customRange, null)).toEqual(
      customRange,
    );
  });
});

describe("F-3 regression: Dashboard month drill-down resolves to the requested month, not the stale global month", () => {
  it("global filter is August; URL requests March: effective range is March, both start and end", () => {
    const globalAugustRange = {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    };

    // Simulates the real navigation contract: a Dashboard/Budgets/Reports
    // drill-down link built via buildTransactionsHref({ month: "2026-03" })
    // lands on /transactions?month=2026-03, which parseTransactionsContext
    // (financeNavigation's own pure, already-tested helper) expands into a
    // real calendar dateFrom/dateTo range.
    const urlSearchParams = new URLSearchParams("month=2026-03");
    const parsed = parseTransactionsContext(urlSearchParams);

    const effectiveRange = resolveTransactionsEffectiveRange(
      globalAugustRange,
      parsed,
    );

    expect(effectiveRange).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    // Never falls back to the stale global August range.
    expect(effectiveRange).not.toEqual(globalAugustRange);
  });
});

describe("TransactionsPage wiring: effective range consumed consistently (source-inspection)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("the locally-duplicated getSelectedMonthRange period system is fully removed", () => {
    expect(source).not.toContain("getSelectedMonthRange");
  });

  it("reloadData fetches using the resolved effectiveRange, not a re-derived month", () => {
    const start = source.indexOf(
      "const reloadData = useCallback(async () => {",
    );
    const end = source.indexOf("}, [effectiveRange, toast]);", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const reloadSource = source.slice(start, end);

    expect(reloadSource).toContain(
      "const { startDate, endDate } = effectiveRange;",
    );
    // Both the primary transactions read and the Forex cash read must
    // share the exact same resolved range — no independent/mismatched
    // period for the merged Forex cash data (see §23 of the brief).
    expect(reloadSource).toContain("getTransactionsInRange(startDate, endDate)");
    expect(reloadSource).toContain(
      "getForexCashTransactionsInRange(startDate, endDate)",
    );
  });

  it("the main load-trigger effect re-fetches on effectiveRange change, not a stale selectedMonth", () => {
    expect(normalized).toContain(
      "useEffect(() => { void runReload(); }, [effectiveRange, runReload]);",
    );
  });

  it("the filtered memo re-checks the actual effective period window, not a hardcoded month-prefix match", () => {
    expect(source).not.toContain("t.date.startsWith(selectedMonth)");
    expect(source).toContain("transactionDay < effectiveRange.startDate");
    expect(source).toContain("transactionDay > effectiveRange.endDate");
  });

  it("no new Date()/Date.now() fallback was introduced at the effective-range call site", () => {
    const start = source.indexOf("const searchParams = useSearchParams();");
    const end = source.indexOf(
      "const [transactions, setTransactions] = useState<Transaction[]>([]);",
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const periodResolutionSource = source.slice(start, end);
    expect(periodResolutionSource).not.toContain("new Date()");
    expect(periodResolutionSource).not.toContain("Date.now()");
  });
});

describe("F-7 wiring: header disambiguates filtered totals from period totals (source-inspection)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("the summary subtitle branches on hasActiveFilters and names the effective period, not a raw selectedMonth string", () => {
    expect(normalized).toContain("{hasActiveFilters ? `Đang lọc kết quả");
    expect(source).toContain("${effectiveRangeLabel}");
    expect(source).not.toContain("{selectedMonth}");
  });

  it("the period-specific footer labels no longer hardcode 'tháng này' (this MONTH) now that the period can be a quarter/year/custom range", () => {
    expect(source).not.toContain("Dòng tiền tháng này");
    expect(source).toContain("Dòng tiền kỳ này");
  });
});
