import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NOTIF-FRESHNESS-1 — Header Notification Reconciliation & Realtime
 * Freshness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the established pattern for this
 * file (Header.loadState.test.ts, Header.notificationReadability.test.ts).
 *
 * NOTIF-CORRECTNESS-1 fixed the notification RULE ENGINE (what a
 * notification says). This ticket fixes the remaining FRESHNESS gap: the
 * finance data feeding that engine only ever loaded once on mount, so a
 * transaction/budget/goal/debt mutation committed after mount had no way
 * to reach Header until a full route remount. These tests lock in that
 * Header now reconciles via the EXISTING app-level RealtimeProvider (no
 * Header-owned Supabase channel, no polling, no interval timer), coalesced
 * through the same single-flight + debounce shape already used by
 * Dashboard/Transactions/Wallets for their own realtime reloads.
 */
describe("one canonical reload path shared by initial load and realtime reconciliation", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("reloadHeaderData is the only place that ever calls setAppData/setHasHeaderDataLoaded, and the only place that assigns a freshly-fetched notifList (the other 2 setNotifList call sites are the pre-existing, unrelated read/mark-all-read handlers)", () => {
    expect(source.split("setAppData(").length - 1).toBe(1);
    expect(source.split("setHasHeaderDataLoaded(").length - 1).toBe(1);

    const start = source.indexOf(
      "const reloadHeaderData = useCallback(async () => {",
    );
    const end = source.indexOf("}, []);", start);
    const fnSource = source.slice(start, end);
    expect(fnSource.split("setNotifList(").length - 1).toBe(1);

    // The other 2 are handleNotifClick/handleMarkAllRead updating `read`
    // in place — not a data reload.
    expect(source.split("setNotifList(").length - 1).toBe(3);
  });

  it("does not add a second getTransactions/getWallets/getCategories/getGoals/getBudgets/getDebts/getInvestments call site", () => {
    for (const fn of [
      "getTransactions(",
      "getWallets(",
      "getCategories(",
      "getGoals(",
      "getBudgets(",
      "getDebts(",
      "getInvestments(",
    ]) {
      expect(source.split(fn).length - 1).toBe(1);
    }
  });

  it("the idle-scheduled initial load and the realtime/visibility triggers all funnel through the same runHeaderReload single-flight coordinator", () => {
    expect(source).toContain("void runHeaderReload();");
    // Exactly two call sites: the idle-scheduling effect, and inside
    // requestHeaderRefresh's debounce timeout.
    expect(source.split("void runHeaderReload();").length - 1).toBe(2);
  });

  it("read-state (readNotificationIds) is merged in exactly one place, reused by every reload", () => {
    expect(source.split("readNotificationIds()").length - 1).toBeGreaterThanOrEqual(1);
    const start = source.indexOf(
      "const reloadHeaderData = useCallback(async () => {",
    );
    const end = source.indexOf("}, []);", start);
    const fnSource = source.slice(start, end);
    expect(fnSource).toContain("readNotificationIds()");
    expect(fnSource).toContain("read: readIds.has(notification.id)");
  });
});

describe("single-flight + pending-reload coalescing (no lost event during an in-flight reload)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("runHeaderReload sets a pending flag instead of starting a second concurrent reload while one is in flight", () => {
    const start = source.indexOf(
      "const runHeaderReload = useCallback(async () => {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("if (isReloadingHeaderDataRef.current) {");
    expect(fnSource).toContain("hasPendingHeaderReloadRef.current = true;");
    expect(fnSource).toContain("return;");
  });

  it("a pending request arriving during an in-flight reload causes exactly one trailing follow-up run (do/while on the pending flag)", () => {
    const start = source.indexOf(
      "const runHeaderReload = useCallback(async () => {",
    );
    const end = source.indexOf("}, []);", start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("do {");
    expect(fnSource).toContain("hasPendingHeaderReloadRef.current = false;");
    expect(fnSource).toContain("await reloadHeaderDataRef.current();");
    expect(fnSource).toContain("} while (hasPendingHeaderReloadRef.current);");
  });

  it("the in-flight guard is always released in a finally block, even if reloadHeaderData throws", () => {
    const start = source.indexOf(
      "const runHeaderReload = useCallback(async () => {",
    );
    const end = source.indexOf("}, []);", start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("} finally {");
    expect(fnSource).toContain("isReloadingHeaderDataRef.current = false;");
  });
});

describe("realtime event burst coalescing (debounce)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("requestHeaderRefresh debounces via a single re-armed timer, matching Dashboard/Transactions/Wallets' existing 100ms convention", () => {
    expect(source).toContain(
      "const HEADER_REALTIME_REFRESH_DEBOUNCE_MS = 100;",
    );
    const start = source.indexOf(
      "const requestHeaderRefresh = useCallback(() => {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [runHeaderReload]);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("window.clearTimeout(headerRefreshDebounceTimerRef.current);");
    expect(fnSource).toContain("window.setTimeout(() => {");
    expect(fnSource).toContain("HEADER_REALTIME_REFRESH_DEBOUNCE_MS");
  });

  it("the debounce timer is cleared on unmount (a second clearTimeout call site, inside a cleanup return, beyond requestHeaderRefresh's own re-arming clear)", () => {
    const clearTimeoutOccurrences =
      source.split("window.clearTimeout(headerRefreshDebounceTimerRef.current);")
        .length - 1;
    // One inside requestHeaderRefresh (re-arms the timer on each call), one
    // inside a cleanup effect's `return () => { ... }` (runs on unmount).
    expect(clearTimeoutOccurrences).toBe(2);

    const returnCleanupStart = source.indexOf("return () => {");
    expect(returnCleanupStart).toBeGreaterThan(-1);
    const returnCleanupEnd = source.indexOf("};", returnCleanupStart);
    const cleanupSource = source.slice(returnCleanupStart, returnCleanupEnd);
    expect(cleanupSource).toContain(
      "window.clearTimeout(headerRefreshDebounceTimerRef.current);",
    );
  });
});

describe("no Header-owned Supabase realtime channel — reuses the existing RealtimeProvider", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("does not create its own supabase.channel(...)/.on('postgres_changes', ...)/.subscribe() — no new realtime infrastructure", () => {
    expect(source).not.toContain("supabase.channel(");
    expect(source).not.toContain("postgres_changes");
    expect(source).not.toContain(".subscribe(");
  });

  it("imports and uses the shared useRealtimeTable hook from the existing RealtimeProvider", () => {
    expect(source).toContain(
      "} from \"@/src/components/realtime/RealtimeProvider\";",
    );
    expect(source).toContain("useRealtimeTable(");
  });

  it("keeps notification realtime dependencies separate from search-only investment dependencies", () => {
    const notificationStart = source.indexOf("useRealtimeTable(");
    expect(notificationStart).toBeGreaterThan(-1);
    const notificationEnd = source.indexOf(");", notificationStart);
    const notificationCall = source.slice(notificationStart, notificationEnd);

    for (const table of [
      "transactions",
      "budgets",
      "categories",
      "goals",
      "debts",
      "savings",
    ]) {
      expect(notificationCall).toContain(`"${table}"`);
    }
    for (const searchOnlyTable of [
      "wallets",
      "investments",
      "forex_accounts",
      "forex_cash_transactions",
    ]) {
      expect(notificationCall).not.toContain(`"${searchOnlyTable}"`);
    }
    expect(notificationCall).toContain("requestHeaderRefresh");

    const searchStart = source.indexOf("useRealtimeTable(", notificationEnd);
    expect(searchStart).toBeGreaterThan(notificationEnd);
    const searchEnd = source.indexOf(");", searchStart);
    const searchCall = source.slice(searchStart, searchEnd);
    expect(searchCall).toContain('"investments"');
    expect(searchCall).toContain('"forex_accounts"');
    expect(searchCall).not.toContain('"forex_cash_transactions"');
    expect(searchCall).toContain("requestHeaderRefresh");
  });

  it("no new polling/interval timer is introduced (setInterval never appears)", () => {
    expect(source).not.toContain("setInterval(");
  });
});

describe("month-rollover via tab visibility (no polling)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("re-checks the current local month only on an actual visibilitychange event, using the canonical getCurrentLocalMonthKey — not a captured-once value", () => {
    const start = source.indexOf(
      "function handleVisibilityChange() {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(
      "document.addEventListener(\"visibilitychange\", handleVisibilityChange);",
      start,
    );
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain('document.visibilityState !== "visible"');
    expect(fnSource).toContain("getCurrentLocalMonthKey()");
    expect(fnSource).toContain("requestHeaderRefresh()");
  });

  it("the visibilitychange listener is installed and cleaned up correctly (no permanent unremoved listener)", () => {
    expect(source).toContain(
      'document.addEventListener("visibilitychange", handleVisibilityChange);',
    );
    expect(source).toContain(
      'document.removeEventListener("visibilitychange", handleVisibilityChange)',
    );
  });

  it("only requests a refresh when the month key actually changed, not on every visibility toggle", () => {
    const start = source.indexOf("function handleVisibilityChange() {");
    const end = source.indexOf(
      'document.addEventListener("visibilitychange", handleVisibilityChange);',
      start,
    );
    const fnSource = source.slice(start, end);
    expect(fnSource).toContain(
      "if (currentMonthKey === lastKnownMonthKeyRef.current) return;",
    );
  });
});

describe("idle-load / realtime-load duplicate-fetch guard", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("the idle-scheduled initial load skips its own fetch if a realtime-triggered reload already completed first", () => {
    const start = source.indexOf("runWhenIdle(() => {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("});", start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("if (hasHeaderDataLoadedRef.current) return;");
    expect(fnSource).toContain("void runHeaderReload();");
  });

  it("loadedRef still guards only the SCHEDULING of the idle callback (once per mount), not reload eligibility itself", () => {
    const start = source.indexOf(
      "// Load all data once on mount",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [runHeaderReload]);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("if (loadedRef.current) return;");
    expect(fnSource).toContain("loadedRef.current = true;");
  });
});

describe("failure semantics preserved (last-known-good, no fake empty)", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("a reload failure (initial or later) leaves appData/notifList/hasHeaderDataLoaded untouched — no setState in the catch branch", () => {
    const start = source.indexOf(
      "const reloadHeaderData = useCallback(async () => {",
    );
    const end = source.indexOf("}, []);", start);
    const fnSource = source.slice(start, end);

    const catchStart = fnSource.indexOf("} catch (error) {");
    expect(catchStart).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchStart);
    expect(catchSource).not.toContain("setAppData");
    expect(catchSource).not.toContain("setNotifList");
    expect(catchSource).not.toContain("setHasHeaderDataLoaded");
    expect(catchSource).toContain("console.error(");
  });
});
