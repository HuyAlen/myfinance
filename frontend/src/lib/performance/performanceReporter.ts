import type {
  DeviceContext,
  PerformanceMetricName,
  PerformanceMetricPayload,
  WebVitalRating,
} from "./performanceTypes";

const ENDPOINT = "/api/perf";
const SESSION_STORAGE_KEY = "myfinance_perf_session_id";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Explicit opt-out switch. Observability defaults to ON: this is a private
 * beta with tiny event volume, so 100% sampling is acceptable per PERF-3
 * scope. Set NEXT_PUBLIC_PERF_OBSERVABILITY_ENABLED="false" to disable.
 */
const isObservabilityEnabled =
  process.env.NEXT_PUBLIC_PERF_OBSERVABILITY_ENABLED !== "false";

/**
 * Fraction of eligible events actually reported, e.g. "0.25" = 25%.
 * Defaults to 1 (100%) — safe at current volume; revisit before wider rollout.
 */
const sampleRate = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_PERF_SAMPLE_RATE);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 1;
  return raw;
})();

let cachedSessionId: string | null = null;

function getSessionId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedSessionId) return cachedSessionId;

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `perf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.sessionStorage.setItem(SESSION_STORAGE_KEY, generated);
    cachedSessionId = generated;
    return generated;
  } catch {
    // Private browsing / storage disabled — telemetry still works, just
    // without cross-event correlation for this tab.
    return undefined;
  }
}

function getDeviceContext(): DeviceContext | undefined {
  if (typeof window === "undefined") return undefined;

  const context: DeviceContext = {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };

  // navigator.connection is not standard and Safari/iOS does not expose it —
  // feature-detect rather than assume.
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  if ("connection" in navigator && nav.connection) {
    context.connectionType = nav.connection.effectiveType;
    context.saveData = nav.connection.saveData;
  }

  return context;
}

function currentPathname(): string {
  if (typeof window === "undefined") return "unknown";
  return window.location.pathname;
}

type ReportOptions = {
  rating?: WebVitalRating;
  id?: string;
  navigationType?: string;
  status?: "success" | "error";
  context?: Record<string, string | number | boolean>;
};

/**
 * Best-effort performance metric reporter. This must NEVER throw and must
 * NEVER block the caller — a telemetry failure cannot be allowed to break
 * Dashboard, Auth, or AI. In development, metrics are only logged to the
 * console (dev/Turbopack timing is not representative of production).
 */
export function reportPerformanceMetric(
  name: PerformanceMetricName,
  value: number,
  options: ReportOptions = {},
): void {
  try {
    if (!isObservabilityEnabled) return;
    if (typeof window === "undefined") return;
    if (Math.random() >= sampleRate) return;

    const payload: PerformanceMetricPayload = {
      name,
      value: Math.round(value * 100) / 100,
      pathname: currentPathname(),
      timestamp: Date.now(),
      env: isProduction ? "production" : "development",
      sessionId: getSessionId(),
      device: getDeviceContext(),
      ...options,
    };

    if (!isProduction) {
      console.debug(
        `[Perf] ${payload.name} = ${payload.value}ms`,
        payload.context ?? "",
      );
      return;
    }

    sendToTransport(payload);
  } catch {
    // Telemetry must never break the app.
  }
}

function sendToTransport(payload: PerformanceMetricPayload): void {
  try {
    const body = JSON.stringify(payload);

    if ("sendBeacon" in navigator) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon(ENDPOINT, blob);
      if (sent) return;
    }

    // Fallback: fire-and-forget, keepalive so it survives page unload,
    // never awaited by the caller.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Best-effort — a dropped performance beacon is not an app error.
    });
  } catch {
    // Best-effort — never throw from telemetry transport.
  }
}
