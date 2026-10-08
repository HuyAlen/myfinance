import { describe, expect, it } from "vitest";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

import {
  getRealtimeRecoveryDelayMs,
  isRealtimeFailureState,
  realtimeSubscriptionErrorMessage,
  shouldRecoverRealtimeAfterForeground,
} from "./realtimeRecovery";

describe("PRODUCTION-REALTIME-RECOVERY-1 helpers", () => {
  it("classifies only terminal/degraded channel states as recovery candidates", () => {
    for (const state of [
      REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR,
      REALTIME_SUBSCRIBE_STATES.TIMED_OUT,
      REALTIME_SUBSCRIBE_STATES.CLOSED,
    ]) {
      expect(isRealtimeFailureState(state)).toBe(true);
    }

    expect(
      isRealtimeFailureState(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED),
    ).toBe(false);
    expect(isRealtimeFailureState("INITIAL")).toBe(false);
  });

  it("uses a bounded stepped recovery backoff", () => {
    expect(getRealtimeRecoveryDelayMs(0)).toBe(1_000);
    expect(getRealtimeRecoveryDelayMs(1)).toBe(2_000);
    expect(getRealtimeRecoveryDelayMs(2)).toBe(5_000);
    expect(getRealtimeRecoveryDelayMs(3)).toBe(10_000);
    expect(getRealtimeRecoveryDelayMs(20)).toBe(10_000);
    expect(getRealtimeRecoveryDelayMs(-1)).toBe(1_000);
    expect(getRealtimeRecoveryDelayMs(Number.NaN)).toBe(1_000);
  });

  it("recovers after a meaningful background interval but not a short visibility transition", () => {
    expect(
      shouldRecoverRealtimeAfterForeground({
        hiddenAt: 1_000,
        now: 31_000,
      }),
    ).toBe(true);

    expect(
      shouldRecoverRealtimeAfterForeground({
        hiddenAt: 1_000,
        now: 30_999,
      }),
    ).toBe(false);

    expect(
      shouldRecoverRealtimeAfterForeground({
        hiddenAt: null,
        now: 31_000,
      }),
    ).toBe(false);
  });

  it("bounds subscription diagnostics and never serializes arbitrary payloads", () => {
    expect(
      realtimeSubscriptionErrorMessage(new Error("socket unavailable")),
    ).toBe("socket unavailable");
    expect(realtimeSubscriptionErrorMessage("timed out")).toBe("timed out");
    expect(realtimeSubscriptionErrorMessage("x".repeat(500))).toHaveLength(240);
    expect(realtimeSubscriptionErrorMessage({ token: "secret" })).toBe(
      "Realtime subscription error.",
    );
  });
});