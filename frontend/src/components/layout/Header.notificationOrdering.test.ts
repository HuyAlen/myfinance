import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NOTIFICATION ORDERING FIX — Newest Notification Must Appear First.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching the established pattern for this
 * file. The deterministic ordering/dedup math itself is genuinely unit
 * tested in notificationOrdering.test.ts; these tests only prove
 * Header.tsx actually wires that logic into the ONE place the active
 * notification set is (re)computed, and that it never re-sorts or
 * duplicates the sort elsewhere.
 */
describe("Header applies canonical newest-first ordering at the single source of truth", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("imports the canonical ordering helpers rather than reimplementing sort/dedup inline", () => {
    expect(source).toContain(
      'from "@/src/lib/notifications/notificationOrdering"',
    );
    expect(source).toContain("advanceNotificationFirstSeen");
    expect(source).toContain("sortNotificationsNewestFirst");
  });

  it("reloadHeaderData advances the first-seen map, persists it, and sorts BEFORE merging read state — exactly once", () => {
    const start = source.indexOf("const freshNotifications = buildNotifications(data);");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("setHasHeaderDataLoaded(true);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    const advanceIdx = fnSource.indexOf("advanceNotificationFirstSeen(");
    const persistIdx = fnSource.indexOf("persistNotificationFirstSeen(firstSeen);");
    const sortIdx = fnSource.indexOf("sortNotificationsNewestFirst(");
    const setNotifListIdx = fnSource.indexOf("setNotifList(");

    expect(advanceIdx).toBeGreaterThan(-1);
    expect(persistIdx).toBeGreaterThan(advanceIdx);
    expect(sortIdx).toBeGreaterThan(persistIdx);
    expect(setNotifListIdx).toBeGreaterThan(sortIdx);

    // Exactly one call each — a single source of truth, not a second sort
    // applied anywhere else in this function.
    expect(fnSource.split("advanceNotificationFirstSeen(").length - 1).toBe(1);
    expect(fnSource.split("sortNotificationsNewestFirst(").length - 1).toBe(1);
  });

  it("advanceNotificationFirstSeen is called with the FRESH notification ids, the PERSISTED previous map, and the real clock — not a locally reinvented timestamp source", () => {
    const start = source.indexOf("const firstSeen = advanceNotificationFirstSeen(");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(");", start);
    const callSource = source.slice(start, end);

    expect(callSource).toContain(
      "freshNotifications.map((notification) => notification.id)",
    );
    expect(callSource).toContain("readNotificationFirstSeen()");
    expect(callSource).toContain("Date.now()");
  });

  it("this ordering runs inside the SAME reloadHeaderData function used by both the initial idle load and every realtime-triggered reconciliation — no separate/duplicated reload path", () => {
    const reloadFnStart = source.indexOf(
      "const reloadHeaderData = useCallback(async () => {",
    );
    expect(reloadFnStart).toBeGreaterThan(-1);
    const sortIdx = source.indexOf("sortNotificationsNewestFirst(", reloadFnStart);
    const reloadFnEnd = source.indexOf("}, []);", reloadFnStart);
    expect(sortIdx).toBeGreaterThan(reloadFnStart);
    expect(sortIdx).toBeLessThan(reloadFnEnd);
  });

  it("mark-as-read and mark-all-read remain order-preserving (.map, not a re-sort or filter/re-insert) and never touch the first-seen ordering map", () => {
    const clickStart = source.indexOf("function handleNotifClick(");
    const clickEnd = source.indexOf("function handleMarkAllRead(");
    expect(clickStart).toBeGreaterThan(-1);
    expect(clickEnd).toBeGreaterThan(clickStart);
    const clickSource = source.slice(clickStart, clickEnd);

    expect(clickSource).toContain("setNotifList((prev) =>");
    expect(clickSource).toContain("prev.map((n) => (n.id === id ? { ...n, read: true } : n))");
    expect(clickSource).not.toContain("sortNotificationsNewestFirst");
    expect(clickSource).not.toContain("advanceNotificationFirstSeen");

    const markAllStart = clickEnd;
    const markAllEnd = source.indexOf("function handleAIAdvisor(", markAllStart);
    expect(markAllEnd).toBeGreaterThan(markAllStart);
    const markAllSource = source.slice(markAllStart, markAllEnd);

    expect(markAllSource).toContain("prev.map((n) => ({ ...n, read: true }))");
    expect(markAllSource).not.toContain("sortNotificationsNewestFirst");
    expect(markAllSource).not.toContain("advanceNotificationFirstSeen");
  });

  it("the first-seen storage key is separate from the read-ids storage key — ordering and read state are independent, never cross-influencing", () => {
    expect(source).toContain(
      'const NOTIFICATION_ORDER_STORAGE_KEY = "myfinance_notification_first_seen";',
    );
    expect(source).toContain(
      'const NOTIFICATION_STORAGE_KEY = "myfinance_read_notifications";',
    );
  });

  it("does not add a new getBudgets/getTransactions/getGoals/getDebts/getCategories call site — ordering reuses the existing single fetch, no new queries", () => {
    for (const fn of [
      "getBudgets(",
      "getTransactions(",
      "getGoals(",
      "getDebts(",
      "getCategories(",
    ]) {
      expect(source.split(fn).length - 1).toBe(1);
    }
  });
});
