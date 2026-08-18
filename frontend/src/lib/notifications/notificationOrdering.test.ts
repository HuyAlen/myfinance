import { describe, expect, it } from "vitest";
import {
  advanceNotificationFirstSeen,
  sortNotificationsNewestFirst,
  type NotificationFirstSeenMap,
} from "./notificationOrdering";

/**
 * NOTIFICATION ORDERING FIX — Newest Notification Must Appear First.
 *
 * MyFinance's finance notifications have no database `created_at` (see
 * this module's own doc comment) — they are synthesized fresh from
 * budgets/transactions/goals/debts on every load, not read as persisted,
 * individually-timestamped event rows. These tests exercise the two pure
 * functions with SYNTHETIC timestamps standing in for "when this client
 * first observed this notification id" — the actual, honest substitute
 * this codebase has for a creation timestamp. The exact wall-clock values
 * below (10:00/11:00/12:00-style) mirror the ticket's own edge-case
 * framing; what matters is the RELATIVE ordering behavior, which is
 * identical regardless of what real-world event produced each timestamp.
 */

type Notification = { id: string; read: boolean };

function makeMap(entries: Array<[string, number]>): NotificationFirstSeenMap {
  return Object.fromEntries(entries);
}

describe("sortNotificationsNewestFirst — newest first, canonical rule", () => {
  it("Edge case A: initial load — three notifications sort strictly newest-to-oldest by first-seen time", () => {
    const firstSeen = makeMap([
      ["N1", 10_00],
      ["N2", 11_00],
      ["N3", 12_00],
    ]);
    const notifications: Notification[] = [
      { id: "N1", read: false },
      { id: "N2", read: false },
      { id: "N3", read: false },
    ];

    const result = sortNotificationsNewestFirst(notifications, firstSeen);

    expect(result.map((n) => n.id)).toEqual(["N3", "N2", "N1"]);
  });

  it("does not sort by read/unread, category, severity, or any field other than first-seen time", () => {
    const firstSeen = makeMap([
      ["over-budget", 300],
      ["near-budget", 200],
      ["goal-done", 100],
    ]);
    // Deliberately shuffled input order AND read-state that would suggest
    // a different order if (incorrectly) used as a sort key.
    const notifications: Notification[] = [
      { id: "goal-done", read: false }, // oldest, but unread
      { id: "over-budget", read: true }, // newest, but already read
      { id: "near-budget", read: false },
    ];

    const result = sortNotificationsNewestFirst(notifications, firstSeen);

    expect(result.map((n) => n.id)).toEqual([
      "over-budget",
      "near-budget",
      "goal-done",
    ]);
  });

  it("Edge case G: equal timestamps use a deterministic id DESC tiebreaker, never random/unstable ordering", () => {
    const firstSeen = makeMap([
      ["b-alpha", 1000],
      ["b-zulu", 1000],
      ["b-mike", 1000],
    ]);
    const notifications: Notification[] = [
      { id: "b-alpha", read: false },
      { id: "b-zulu", read: false },
      { id: "b-mike", read: false },
    ];

    const resultA = sortNotificationsNewestFirst(notifications, firstSeen);
    const resultB = sortNotificationsNewestFirst(
      [...notifications].reverse(),
      firstSeen,
    );

    // Same deterministic order regardless of input order — id DESC.
    expect(resultA.map((n) => n.id)).toEqual(["b-zulu", "b-mike", "b-alpha"]);
    expect(resultB.map((n) => n.id)).toEqual(["b-zulu", "b-mike", "b-alpha"]);
  });

  it("an id with no first-seen entry at all sorts as oldest (treated as timestamp 0), never crashes", () => {
    const firstSeen = makeMap([["known", 500]]);
    const notifications: Notification[] = [
      { id: "unknown", read: false },
      { id: "known", read: false },
    ];

    const result = sortNotificationsNewestFirst(notifications, firstSeen);

    expect(result.map((n) => n.id)).toEqual(["known", "unknown"]);
  });

  it("Edge case F: a duplicate id is de-duplicated, keeping only the first occurrence", () => {
    const firstSeen = makeMap([
      ["dup", 200],
      ["other", 100],
    ]);
    const notifications: Notification[] = [
      { id: "dup", read: false },
      { id: "other", read: false },
      { id: "dup", read: true }, // duplicate — e.g. realtime + refetch race
    ];

    const result = sortNotificationsNewestFirst(notifications, firstSeen);

    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id)).toEqual(["dup", "other"]);
    // The kept copy is the FIRST occurrence's data.
    expect(result[0].read).toBe(false);
  });

  it("returns a new array — never mutates the input array in place", () => {
    const firstSeen = makeMap([
      ["a", 1],
      ["b", 2],
    ]);
    const notifications: Notification[] = [
      { id: "a", read: false },
      { id: "b", read: false },
    ];
    const original = [...notifications];

    sortNotificationsNewestFirst(notifications, firstSeen);

    expect(notifications).toEqual(original);
  });
});

describe("advanceNotificationFirstSeen — stamping and garbage collection", () => {
  it("Edge case B: a brand-new id is stamped with the current time, ranking it first on the next sort", () => {
    const previous = makeMap([
      ["N3", 12_00],
      ["N2", 11_00],
      ["N1", 10_00],
    ]);

    const next = advanceNotificationFirstSeen(
      ["N4", "N3", "N2", "N1"],
      previous,
      12_30,
    );

    expect(next).toEqual({ N4: 12_30, N3: 12_00, N2: 11_00, N1: 10_00 });

    const sorted = sortNotificationsNewestFirst(
      [
        { id: "N1", read: false },
        { id: "N2", read: false },
        { id: "N3", read: false },
        { id: "N4", read: false },
      ],
      next,
    );
    expect(sorted.map((n) => n.id)).toEqual(["N4", "N3", "N2", "N1"]);
  });

  it("Edge case E (reload): an id that stays active keeps its ORIGINAL timestamp, not a fresh 'now' — this is what makes ordering survive a reload", () => {
    const previous = makeMap([["still-active", 100]]);

    const next = advanceNotificationFirstSeen(
      ["still-active"],
      previous,
      99_999, // a much later "now", simulating time passing before reload
    );

    expect(next["still-active"]).toBe(100);
  });

  it("drops an id that is no longer active (its condition resolved) — no unbounded growth, no stale ghost entries", () => {
    const previous = makeMap([
      ["resolved", 100],
      ["still-active", 200],
    ]);

    const next = advanceNotificationFirstSeen(["still-active"], previous, 999);

    expect(next).toEqual({ "still-active": 200 });
    expect(next).not.toHaveProperty("resolved");
  });

  it("a resolved id that later recurs is treated as brand-new (fresh timestamp), not a revival of its old position", () => {
    const afterFirstOccurrence = advanceNotificationFirstSeen(
      ["bover-budget-1"],
      {},
      100,
    );
    const afterResolution = advanceNotificationFirstSeen(
      [],
      afterFirstOccurrence,
      200,
    );
    expect(afterResolution).toEqual({});

    const afterRecurrence = advanceNotificationFirstSeen(
      ["bover-budget-1"],
      afterResolution,
      300,
    );
    expect(afterRecurrence).toEqual({ "bover-budget-1": 300 });
  });

  it("returns a new object — never mutates the previous map in place", () => {
    const previous: NotificationFirstSeenMap = { a: 1 };
    const originalSnapshot = { ...previous };

    advanceNotificationFirstSeen(["a", "b"], previous, 500);

    expect(previous).toEqual(originalSnapshot);
  });

  it("handles an empty active-id list (all conditions resolved) by returning an empty map", () => {
    const previous = makeMap([["a", 1]]);
    expect(advanceNotificationFirstSeen([], previous, 100)).toEqual({});
  });
});

describe("mark-as-read / mark-all-read must never reorder (integration of both functions)", () => {
  it("Edge case C: marking the newest notification read does not change its position", () => {
    const firstSeen = makeMap([
      ["N4", 400],
      ["N3", 300],
      ["N2", 200],
    ]);
    const before: Notification[] = [
      { id: "N4", read: false },
      { id: "N3", read: false },
      { id: "N2", read: true },
    ];
    const beforeOrder = sortNotificationsNewestFirst(before, firstSeen).map(
      (n) => n.id,
    );

    // Simulate marking N4 read the way Header.tsx does — an order-
    // preserving .map(), never touching firstSeen at all.
    const after = before.map((n) => (n.id === "N4" ? { ...n, read: true } : n));
    const afterOrder = sortNotificationsNewestFirst(after, firstSeen).map(
      (n) => n.id,
    );

    expect(afterOrder).toEqual(beforeOrder);
    expect(afterOrder).toEqual(["N4", "N3", "N2"]);
    expect(after.find((n) => n.id === "N4")?.read).toBe(true);
  });

  it("Edge case D: mark-all-read does not reorder the list", () => {
    const firstSeen = makeMap([
      ["N4", 400],
      ["N3", 300],
      ["N2", 200],
    ]);
    const before: Notification[] = [
      { id: "N4", read: false },
      { id: "N3", read: false },
      { id: "N2", read: false },
    ];
    const beforeOrder = sortNotificationsNewestFirst(before, firstSeen).map(
      (n) => n.id,
    );

    const after = before.map((n) => ({ ...n, read: true }));
    const afterOrder = sortNotificationsNewestFirst(after, firstSeen).map(
      (n) => n.id,
    );

    expect(afterOrder).toEqual(beforeOrder);
    expect(after.every((n) => n.read)).toBe(true);
  });
});
