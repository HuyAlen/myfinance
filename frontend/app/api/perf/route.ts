import { NextResponse } from "next/server";
import type { PerformanceMetricPayload } from "@/src/lib/performance/performanceTypes";

export const runtime = "nodejs";

const VALID_NAMES = new Set([
  "web_vital_ttfb",
  "web_vital_fcp",
  "web_vital_lcp",
  "web_vital_inp",
  "web_vital_cls",
  "auth_ready",
  "dashboard_snapshot",
  "dashboard_critical_ready",
  "route_transition",
  "ai_first_open",
  "realtime_ready",
]);

/**
 * Lightweight, unauthenticated performance-beacon sink.
 *
 * Deliberately NOT persisted to Supabase/a database — PERF-3 does not need
 * historical storage to answer "where is time going," and creating a table
 * to receive unbounded client-supplied events without a retention/indexing
 * plan is explicitly out of scope (see PERF-3 §7). This logs a single
 * structured line to the server's stdout, which is captured by Vercel's
 * function logs and is enough to eyeball real-traffic timing distributions.
 *
 * The payload shape is validated loosely and defensively: this endpoint
 * receives client-controlled input, so it must never throw, never reflect
 * back arbitrary content, and never log anything beyond the known-safe
 * numeric/string fields defined in PerformanceMetricPayload.
 */
export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json();

    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ ok: false }, { status: 204 });
    }

    const body = raw as Partial<PerformanceMetricPayload>;

    if (typeof body.name !== "string" || !VALID_NAMES.has(body.name)) {
      return new NextResponse(null, { status: 204 });
    }

    const safeEntry = {
      name: body.name,
      value: typeof body.value === "number" ? body.value : null,
      rating: typeof body.rating === "string" ? body.rating : undefined,
      pathname: typeof body.pathname === "string" ? body.pathname : "unknown",
      status: body.status === "error" ? "error" : "success",
      env: body.env === "development" ? "development" : "production",
      timestamp:
        typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      // Context values are already restricted to string|number|boolean by
      // the client type, but re-validate defensively since this is
      // untrusted input.
      context:
        body.context && typeof body.context === "object"
          ? Object.fromEntries(
              Object.entries(body.context).filter(
                ([, v]) =>
                  typeof v === "string" ||
                  typeof v === "number" ||
                  typeof v === "boolean",
              ),
            )
          : undefined,
    };

    console.log("[perf]", JSON.stringify(safeEntry));

    return new NextResponse(null, { status: 204 });
  } catch {
    // Never fail loudly on a telemetry beacon — the client already treats
    // this as fire-and-forget.
    return new NextResponse(null, { status: 204 });
  }
}
