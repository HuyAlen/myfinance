"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { reportPerformanceMetric } from "@/src/lib/performance/performanceReporter";
import type { CoreWebVitalName, WebVitalRating } from "@/src/lib/performance/performanceTypes";

const METRIC_NAME_MAP: Record<string, CoreWebVitalName> = {
  TTFB: "web_vital_ttfb",
  FCP: "web_vital_fcp",
  LCP: "web_vital_lcp",
  INP: "web_vital_inp",
  CLS: "web_vital_cls",
};

function isKnownRating(value: string): value is WebVitalRating {
  return value === "good" || value === "needs-improvement" || value === "poor";
}

/**
 * Mounted once in the root layout. Reports Core Web Vitals via Next.js's
 * official useReportWebVitals hook (App Router). CLS is reported in
 * milliseconds-equivalent units by the library's `value` field already, so
 * no unit conversion is applied here.
 *
 * Also tracks lightweight route-transition timing: how long the previous
 * route's content stayed mounted before this pathname replaced it, as a
 * proxy for "time users spent looking at a route" is NOT what this
 * measures — it measures elapsed time between consecutive pathname commits,
 * which approximates perceived transition latency for App Router
 * client-side navigations. This is intentionally not click-to-paint timing;
 * see PERF-3 report for the precise limitation.
 */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const mapped = METRIC_NAME_MAP[metric.name];
    if (!mapped) return;

    reportPerformanceMetric(mapped, metric.value, {
      id: metric.id,
      navigationType: metric.navigationType,
      rating: isKnownRating(metric.rating) ? metric.rating : undefined,
    });
  });

  const pathname = usePathname();
  const previousCommitRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const previous = previousCommitRef.current;
    previousCommitRef.current = now;

    if (previous === null) return; // first route of the session, not a transition

    reportPerformanceMetric("route_transition", now - previous, {
      status: "success",
    });
  }, [pathname]);

  return null;
}
