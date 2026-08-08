/**
 * Typed taxonomy for MyFinance performance observability (PERF-3).
 *
 * This is intentionally a small, closed set of metrics — see the sprint
 * notes for why. Every payload here is non-financial and non-identifying:
 * no balances, transaction data, names, emails, tokens, or AI content.
 */

export type CoreWebVitalName =
  | "web_vital_ttfb"
  | "web_vital_fcp"
  | "web_vital_lcp"
  | "web_vital_inp"
  | "web_vital_cls";

export type CustomMetricName =
  | "auth_ready"
  | "dashboard_snapshot"
  | "dashboard_critical_ready"
  | "route_transition"
  | "ai_first_open"
  | "realtime_ready";

export type PerformanceMetricName = CoreWebVitalName | CustomMetricName;

export type WebVitalRating = "good" | "needs-improvement" | "poor";

export type DeviceContext = {
  /** CSS viewport width bucket, not exact fingerprint-grade precision. */
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  /** From navigator.connection.effectiveType, e.g. "4g" — Safari may not expose this. */
  connectionType?: string;
  saveData?: boolean;
};

export type PerformanceMetricPayload = {
  name: PerformanceMetricName;
  /** Duration or metric value in milliseconds. */
  value: number;
  /** Web Vitals rating when applicable (Core Web Vitals only). */
  rating?: WebVitalRating;
  /** Web Vitals metric id (for de-duplication), when applicable. */
  id?: string;
  /** Web Vitals navigation type, when applicable. */
  navigationType?: string;
  /** Route pathname this metric applies to (no query params, no IDs). */
  pathname: string;
  /** Client timestamp (Date.now()) when the event was captured. */
  timestamp: number;
  /** "success" | "error" — lets slow-but-successful be distinguished from failed. */
  status?: "success" | "error";
  /** Non-sensitive extra context (e.g. approximate payload bytes, sample rate). */
  context?: Record<string, string | number | boolean>;
  device?: DeviceContext;
  /** Anonymous, ephemeral, per-tab-session id — never a real user id. */
  sessionId?: string;
  env: "development" | "production";
};
