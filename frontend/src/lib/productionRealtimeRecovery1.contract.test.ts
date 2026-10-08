import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const provider = read("src/components/realtime/RealtimeProvider.tsx");
const household = read("src/components/household/HouseholdProvider.tsx");
const helper = read("src/lib/realtime/realtimeRecovery.ts");

describe("PRODUCTION-REALTIME-RECOVERY-1 — P1", () => {
  it("recognizes degraded channel states and applies bounded recovery backoff", () => {
    expect(helper).toContain("CHANNEL_ERROR");
    expect(helper).toContain("TIMED_OUT");
    expect(helper).toContain("CLOSED");
    expect(helper).toContain(
      "const REALTIME_RECOVERY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000]",
    );
    expect(provider).toContain("scheduleFailureRecovery");
    expect(provider).toContain("getRealtimeRecoveryDelayMs(attempt)");
  });

  it("lets Supabase auto-reconnect first and recreates the channel only if degradation persists", () => {
    expect(provider).toContain("recoveryTimerId !== null");
    expect(provider).toContain("scheduleRecovery(getRealtimeRecoveryDelayMs(attempt))");
    expect(provider).toContain(
      "setRecoveryRevision((current) => current + 1)",
    );
    expect(provider).toContain("clearRecoveryTimer()");
    expect(provider).toContain(
      "state === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED",
    );
  });

  it("does not spin reconnect attempts while the browser is explicitly offline", () => {
    expect(provider).toContain("navigator.onLine === false");
    expect(provider).toContain('window.addEventListener("offline", onOffline)');
    expect(provider).toContain('window.addEventListener("online", onOnline)');
    expect(provider).toContain(
      "statusRef.current = REALTIME_SUBSCRIBE_STATES.CLOSED",
    );
  });

  it("recovers after meaningful iPhone-style background/sleep and avoids reconnecting on every focus", () => {
    expect(helper).toContain("REALTIME_FOREGROUND_STALE_MS = 30_000");
    expect(provider).toContain("hiddenAtRef.current = Date.now()");
    expect(provider).toContain("shouldRecoverRealtimeAfterForeground");
    expect(provider).toContain(
      'document.addEventListener("visibilitychange", onVisibilityChange)',
    );
    expect(provider).toMatch(
      /onFocus[\s\S]*statusRef\.current !== REALTIME_SUBSCRIBE_STATES\.SUBSCRIBED/,
    );
  });

  it("re-subscribes when the auth access token changes without manually forcing realtime.setAuth", () => {
    expect(provider).toContain(
      "const sessionAccessToken = session?.access_token ?? null;",
    );
    expect(provider).toMatch(
      /\[\s*financeOwnerUserId,\s*recoveryRevision,\s*sessionAccessToken,\s*user\?\.id,\s*\]/,
    );
    expect(provider).not.toContain("realtime.setAuth");
  });

  it("reconciles each registered page callback once after a successful re-subscription", () => {
    expect(provider).toContain(
      "const uniqueCallbacks = new Set<ReloadCallback>()",
    );
    expect(provider).toContain("hasEverSubscribedRef.current");
    expect(provider).toContain("reconcileRegisteredListeners()");
    expect(provider).toContain('invokeReloadCallback(cb, "recovery")');
  });

  it("guards stale channel callbacks and handles async page refresh failures without unhandled rejection", () => {
    expect(provider).toContain("channelGenerationRef");
    expect(provider).toContain(
      "channelGenerationRef.current !== generation",
    );
    expect(provider).toContain("Promise.resolve(cb()).catch");
    expect(provider).toContain(
      "[RealtimeProvider] ${reason} refresh callback failed.",
    );
  });

  it("cleans browser listeners/timers/channels and adds online reconciliation for household invites", () => {
    expect(provider).toContain('window.removeEventListener("offline", onOffline)');
    expect(provider).toContain('window.removeEventListener("online", onOnline)');
    expect(provider).toContain('window.removeEventListener("focus", onFocus)');
    expect(provider).toContain(
      'document.removeEventListener("visibilitychange", onVisibilityChange)',
    );
    expect(provider).toContain("void supabase.removeChannel(channel)");

    expect(household).toContain(
      'window.addEventListener("online", scheduleRefresh)',
    );
    expect(household).toContain(
      'window.removeEventListener("online", scheduleRefresh)',
    );
  });

  it("keeps realtime finance scoping server-authoritative through financeOwnerUserId", () => {
    expect(provider).toContain("financeOwnerUserId");
    expect(provider).toContain(
      "filter: `user_id=eq.${financeOwnerUserId}`",
    );
    expect(provider).toContain(
      "if (!user?.id || !financeOwnerUserId)",
    );
  });
});