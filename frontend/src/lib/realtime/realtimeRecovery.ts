import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

export const REALTIME_FOREGROUND_STALE_MS = 30_000;

const REALTIME_RECOVERY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
const REALTIME_ERROR_MESSAGE_MAX_LENGTH = 240;

export function isRealtimeFailureState(
  state: REALTIME_SUBSCRIBE_STATES | "INITIAL",
) {
  return (
    state === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
    state === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
    state === REALTIME_SUBSCRIBE_STATES.CLOSED
  );
}

export function getRealtimeRecoveryDelayMs(attempt: number) {
  const normalizedAttempt = Number.isFinite(attempt)
    ? Math.max(0, Math.trunc(attempt))
    : 0;
  const index = Math.min(
    normalizedAttempt,
    REALTIME_RECOVERY_DELAYS_MS.length - 1,
  );

  return REALTIME_RECOVERY_DELAYS_MS[index];
}

export function shouldRecoverRealtimeAfterForeground(input: {
  hiddenAt: number | null;
  now: number;
  thresholdMs?: number;
}) {
  const thresholdMs =
    input.thresholdMs ?? REALTIME_FOREGROUND_STALE_MS;

  return (
    input.hiddenAt !== null &&
    Number.isFinite(input.hiddenAt) &&
    Number.isFinite(input.now) &&
    input.now >= input.hiddenAt &&
    input.now - input.hiddenAt >= thresholdMs
  );
}

export function realtimeSubscriptionErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Realtime subscription error.";

  return message.slice(0, REALTIME_ERROR_MESSAGE_MAX_LENGTH);
}