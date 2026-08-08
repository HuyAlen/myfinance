import { reportPerformanceMetric } from "./performanceReporter";
import type { CustomMetricName } from "./performanceTypes";

const PREFIX = "myfinance";

function supportsPerformanceApi(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
  );
}

/**
 * Records a named instant (e.g. "dashboard:reload:start"). Safe no-op if the
 * Performance API is unavailable. Marks are cheap; this does not report a
 * metric by itself — pair a "start" mark with measureAndReport().
 */
export function markInstant(label: string): void {
  if (!supportsPerformanceApi()) return;
  try {
    performance.mark(`${PREFIX}:${label}`);
  } catch {
    // Best-effort — never throw from instrumentation.
  }
}

/**
 * Measures the duration between two previously-recorded marks and reports it
 * as a typed metric. Clears the marks/measure afterward so the Performance
 * timeline doesn't grow unbounded over a long-lived session.
 */
export function measureAndReport(
  metricName: CustomMetricName,
  startLabel: string,
  endLabel: string,
  options: {
    status?: "success" | "error";
    context?: Record<string, string | number | boolean>;
  } = {},
): void {
  if (!supportsPerformanceApi()) return;

  const start = `${PREFIX}:${startLabel}`;
  const end = `${PREFIX}:${endLabel}`;
  const measureName = `${PREFIX}:${metricName}`;

  try {
    performance.mark(end);
    const measure = performance.measure(measureName, start, end);
    reportPerformanceMetric(metricName, measure.duration, options);
  } catch {
    // Marks may be missing (e.g. component remounted mid-flow) — skip
    // silently rather than reporting a bogus duration.
  } finally {
    try {
      performance.clearMarks(start);
      performance.clearMarks(end);
      performance.clearMeasures(measureName);
    } catch {
      // Ignore cleanup failures.
    }
  }
}
