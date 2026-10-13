import { describe, expect, it } from "vitest";
import {
  buildNotificationScope,
  filterNotificationsByRead,
  scopedNotificationStorageKey,
  setNotificationReadState,
} from "./notificationReadState";

describe("MYFINANCE-NOTIFICATIONS-READ-UNREAD-1 state and isolation", () => {
  it("requires a real authenticated account and workspace", () => {
    expect(buildNotificationScope(null, "workspace-a")).toBeNull();
    expect(buildNotificationScope("account-a", null)).toBeNull();
    expect(buildNotificationScope("", "workspace-a")).toBeNull();
  });

  it("never shares read/first-seen keys across accounts or workspaces", () => {
    const a = buildNotificationScope("account-a", "workspace-a");
    const b = buildNotificationScope("account-b", "workspace-a");
    const c = buildNotificationScope("account-a", "workspace-b");
    const base = "myfinance_read_notifications";
    const keyA = scopedNotificationStorageKey(base, a);
    const keyB = scopedNotificationStorageKey(base, b);
    const keyC = scopedNotificationStorageKey(base, c);
    expect(new Set([keyA, keyB, keyC]).size).toBe(3);
    expect(scopedNotificationStorageKey(base, null)).toBeNull();
    expect(scopedNotificationStorageKey("myfinance_notification_first_seen", a))
      .not.toBe(keyA);
  });

  it("encodes scope pieces, preventing ambiguous delimiters", () => {
    expect(buildNotificationScope("a:b", "c")).not.toBe(buildNotificationScope("a", "b:c"));
  });

  it("supports reversible single-item read and unread without mutating input", () => {
    const existing = new Set(["item-a"]);
    const unread = setNotificationReadState(existing, "item-a", false);
    expect([...unread]).toEqual([]);
    expect([...existing]).toEqual(["item-a"]);
    const read = setNotificationReadState(unread, "item-a", true);
    expect([...read]).toEqual(["item-a"]);
    expect(setNotificationReadState(read, "", true)).toEqual(read);
  });

  it("filters read/unread without changing the source order or severity", () => {
    const records = [
      { id: "newer", read: false, priority: "urgent" },
      { id: "middle", read: true, priority: "info" },
      { id: "older", read: false, priority: "action" },
    ];
    expect(filterNotificationsByRead(records, "all").map((n) => n.id))
      .toEqual(["newer", "middle", "older"]);
    expect(filterNotificationsByRead(records, "unread").map((n) => n.id))
      .toEqual(["newer", "older"]);
    expect(filterNotificationsByRead(records, "read").map((n) => n.id))
      .toEqual(["middle"]);
    expect(records.map((n) => n.read)).toEqual([false, true, false]);
  });
});
