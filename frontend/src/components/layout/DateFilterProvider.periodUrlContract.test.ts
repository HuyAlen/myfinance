import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MYFINANCE-CROSSPAGE-1 — Canonical Period & URL Contract.
 *
 * Source-inspection regression coverage matches this repo's existing
 * cross-page contract tests. The goal is architectural: there must be one
 * global period owner, one URL serializer, and consumers must use that state
 * instead of creating private period engines.
 */
describe("MYFINANCE-CROSSPAGE-1 canonical period contract", () => {
  const providerSource = readFileSync(
    path.resolve(__dirname, "DateFilterProvider.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const providerNormalized = providerSource.replace(/\s+/g, " ");
  const headerSource = readFileSync(
    path.resolve(__dirname, "Header.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const reportsSource = readFileSync(
    path.resolve(__dirname, "../reports/ReportsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const budgetsSource = readFileSync(
    path.resolve(__dirname, "../budgets/BudgetsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("lets a valid period deep-link win on the first hard load before the bootstrap fallback", () => {
    const initialStart = providerSource.indexOf("function getInitialFilter()");
    const initialEnd = providerSource.indexOf("function persistFilter", initialStart);
    const block = providerSource.slice(initialStart, initialEnd);

    const urlRead = block.indexOf("const urlFilter = getFilterFromUrl();");
    const firstLoadFallback = block.indexOf("if (!hasBootstrappedDateFilter)");

    expect(urlRead).toBeGreaterThan(-1);
    expect(firstLoadFallback).toBeGreaterThan(urlRead);
    expect(block).toContain("return normalizeFilter(urlFilter)");
  });

  it("writes exactly one active period mode and removes stale/legacy mode params", () => {
    expect(providerNormalized).toContain(
      '["month", "quarter", "year", "from", "to", "range"].forEach((key) => nextParams.delete(key),',
    );
    expect(providerSource).toContain('nextParams.set("month", nextFilter.selectedMonth)');
    expect(providerSource).toContain('nextParams.set("quarter", nextFilter.selectedQuarter)');
    expect(providerSource).toContain('nextParams.set("year", String(nextFilter.selectedYear))');
    expect(providerSource).toContain('nextParams.set("from", nextFilter.customStart)');
    expect(providerSource).toContain('nextParams.set("to", nextFilter.customEnd)');
    expect(providerSource).not.toContain('nextParams.set("range"');
  });

  it("still reads old ?range=start_end links but canonicalizes future writes to from/to", () => {
    expect(providerSource).toContain('const legacyRange = params.get("range")');
    expect(providerSource).toContain("const resolvedCustomStart =");
    expect(providerSource).toContain("const resolvedCustomEnd =");
    expect(providerSource).toContain('nextParams.set("from", nextFilter.customStart)');
    expect(providerSource).toContain('nextParams.set("to", nextFilter.customEnd)');
  });

  it("does not inject a global period over an explicit Transactions dateFrom/dateTo drill-down", () => {
    expect(providerNormalized).toContain(
      'currentPathname === "/transactions" && (currentParams.has("dateFrom") || currentParams.has("dateTo"))',
    );
    expect(providerNormalized).toContain(
      'pathname === "/transactions" && (params.has("dateFrom") || params.has("dateTo"))',
    );
  });

  it("keeps Header as a period UI only; DateFilterProvider owns URL serialization", () => {
    expect(headerSource).not.toContain("function updateUrlFilter");
    expect(headerSource).not.toContain('updateUrlFilter("month"');
    expect(headerSource).not.toContain('updateUrlFilter("quarter"');
    expect(headerSource).not.toContain('updateUrlFilter("year"');
    expect(headerSource).not.toContain('updateUrlFilter("range"');
    expect(headerSource).toContain("setCustomRange(customStart, customEnd)");
  });

  it("makes Reports a consumer/controller of the global provider instead of a private period store", () => {
    expect(reportsSource).toContain(
      'import { useDateFilter } from "@/src/components/layout/DateFilterProvider";',
    );
    expect(reportsSource).toContain("filterMode: periodMode");
    expect(reportsSource).toContain("filterLabel: canonicalPeriodLabel");
    expect(reportsSource).toContain("dateRange");
    expect(reportsSource).not.toContain("useState<PeriodMode>");
    expect(reportsSource).not.toContain("getCurrentReportPeriodDefaults");
    expect(reportsSource).toContain("day >= dateRange.startDate && day <= dateRange.endDate");
  });

  it("makes Budgets consume the full global range rather than only selectedMonth", () => {
    expect(budgetsSource).toContain("filterMode,");
    expect(budgetsSource).toContain("filterLabel,");
    expect(budgetsSource).toContain("dateRange,");
    expect(budgetsSource).toContain("const periodTransactions = useMemo(");
    expect(budgetsSource).toContain("day >= dateRange.startDate && day <= dateRange.endDate");
    expect(budgetsSource).toContain("budget.month >= startMonth && budget.month <= endMonth");
    expect(budgetsSource).not.toContain("budgets.filter((b) => b.month === activeMonth)");
    expect(budgetsSource).toContain('filterMode === "month" &&');
  });
});
