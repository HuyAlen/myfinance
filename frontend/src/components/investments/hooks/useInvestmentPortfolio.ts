"use client";

import { useMemo } from "react";
import type { Investment } from "@/src/types/finance";
import {
  buildPortfolioInsights,
  calculatePortfolioHealth,
  calculatePortfolioSummary,
  calculateTypeBreakdown,
  enrichInvestments,
} from "../domain/investmentAnalytics";
import type {
  InvestmentTypeFilter,
  PerformanceFilter,
} from "../domain/investmentTypes";

export function useInvestmentPortfolio(
  investments: Investment[],
  filters: {
    type: InvestmentTypeFilter;
    performance: PerformanceFilter;
    search: string;
  },
) {
  const { type, performance, search: searchText } = filters;
  const summary = useMemo(
    () => calculatePortfolioSummary(investments),
    [investments],
  );
  const byType = useMemo(
    () => calculateTypeBreakdown(investments, summary.currentValue),
    [investments, summary.currentValue],
  );
  const enriched = useMemo(
    () => enrichInvestments(investments, summary.currentValue),
    [investments, summary.currentValue],
  );
  const healthScores = useMemo(
    () => calculatePortfolioHealth(byType, summary, investments.length),
    [byType, summary, investments.length],
  );
  const insights = useMemo(
    () => buildPortfolioInsights(investments, byType, enriched, summary),
    [investments, byType, enriched, summary],
  );
  const topHoldings = useMemo(
    () => ({
      largest: [...enriched]
        .sort((a, b) => b.currentValue - a.currentValue)
        .slice(0, 3),
      best: [...enriched].sort((a, b) => b.plPct - a.plPct).slice(0, 3),
      worst: [...enriched]
        .sort((a, b) => a.plPct - b.plPct)
        .slice(0, 3)
        .filter((item) => item.plPct < 0),
    }),
    [enriched],
  );
  const filteredInvestments = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    return enriched
      .filter((item) => {
        if (type !== "all" && item.type !== type) return false;
        if (performance !== "all" && item.performanceState !== performance)
          return false;
        if (
          search &&
          !item.name.toLowerCase().includes(search) &&
          !(item.symbol ?? "").toLowerCase().includes(search)
        )
          return false;
        return true;
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [enriched, type, performance, searchText]);
  const pieData = useMemo(
    () =>
      byType.map((group) => ({
        name: group.label,
        value: group.current,
        color: group.color,
      })),
    [byType],
  );
  const barData = useMemo(
    () =>
      investments.map((item) => ({
        name: item.symbol || item.name.slice(0, 8),
        "Vốn đầu tư": +(item.investedAmount / 1_000_000).toFixed(1),
        "Giá trị HT": +(item.currentValue / 1_000_000).toFixed(1),
      })),
    [investments],
  );

  return {
    summary,
    byType,
    enriched,
    healthScores,
    insights,
    topHoldings,
    filteredInvestments,
    pieData,
    barData,
  };
}
