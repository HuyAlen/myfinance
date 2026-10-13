import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/layout/Header.tsx"), "utf8")
  .replace(/\r\n?/g, "\n");

function between(start: string, end: string) {
  const a = source.indexOf(start);
  expect(a).toBeGreaterThan(-1);
  const b = source.indexOf(end, a + start.length);
  expect(b).toBeGreaterThan(a);
  return source.slice(a, b);
}

describe("MYFINANCE-NOTIFICATIONS-READ-UNREAD-1", () => {
  it("scopes both read state and first-seen order to user and active workspace", () => {
    expect(source).toContain("buildNotificationScope(user?.id, householdContext?.household?.id)");
    expect(source).toContain("scopedNotificationStorageKey(NOTIFICATION_STORAGE_KEY, scope)");
    expect(source).toContain("scopedNotificationStorageKey(NOTIFICATION_ORDER_STORAGE_KEY, scope)");
    expect(source).not.toContain("window.localStorage.getItem(NOTIFICATION_STORAGE_KEY)");
    expect(source).not.toContain("window.localStorage.setItem(NOTIFICATION_STORAGE_KEY");
  });

  it("offers all, unread and read filters while retaining the global unread badge", () => {
    expect(source).toContain('type NotificationReadFilter');
    expect(source).toContain('aria-label="Lọc trạng thái thông báo"');
    for (const label of ['label: "Tất cả"', 'label: "Chưa đọc"', 'label: "Đã đọc"']) {
      expect(source).toContain(label);
    }
    expect(source).toContain("filterNotificationsByRead(visibleNotifList, notificationReadFilter)");
    expect(source).toContain("const unreadCount = visibleNotifList.filter((n) => !n.read).length;");
    expect(source).toContain("{filteredNotifList.length > 0 ? (");
    expect(source).toContain("filteredNotifList.map((n) => {");
    expect(source).toContain('aria-pressed={notificationReadFilter === tab.value}');
  });

  it("provides one separate button to toggle each notification without navigating", () => {
    const markup = between("{/* List */}", "{/* Realtime status */}");
    expect(markup).toContain('data-notification-read-state={n.read ? "read" : "unread"}');
    expect(markup).toContain('onClick={() => handleNotifClick(n.href, n.id)}');
    expect(markup).toContain('onClick={() => handleSetNotificationRead(n.id, !n.read)}');
    expect(markup).toContain('aria-label={(n.read ? "Đánh dấu chưa đọc: " : "Đánh dấu đã đọc: ") + n.title}');
    expect(markup).toMatch(/<\/button>\s*<button\s+type="button"/);
  });

  it("updates a single item reversibly, without an extra finance query or changing first-seen order", () => {
    const action = between("function handleSetNotificationRead(", "function handleMarkAllRead(");
    expect(action).toContain("setNotificationReadState(readNotificationIds(), id, read)");
    expect(action).toContain("persistNotificationIds(readIds)");
    expect(action).toContain("setNotificationReadRevision");
    expect(action).not.toContain("sortNotificationsNewestFirst");
    expect(action).not.toContain("getTransactions");
  });

  it("reacts to other tabs and prevents stale async data after workspace switching", () => {
    expect(source).toContain('window.addEventListener("storage", onNotificationStorage)');
    expect(source).toContain('window.removeEventListener("storage", onNotificationStorage)');
    expect(source).toContain("if (requestedScope !== notificationScopeRef.current) return;");
    expect(source).toContain("setNotifDataScope(requestedScope)");
    expect(source).toContain("notifDataScope === notificationScope ? notifList : []");
    expect(source).toContain("requestHeaderRefresh");
    expect(source).toContain("previousFirstSeen");
    expect(source).toContain("readIds.delete(notification.id)");
    expect(source).not.toContain("supabase.channel(");
  });

  it("preserves finance classification, click-to-read, and whole-list mark-as-read", () => {
    expect(source).toContain("buildActionableFinanceAlerts({");
    expect(source).toContain("buildFinanceNotifications({");
    expect(source).toContain("router.push(href);");
    expect(source).toContain("for (const notification of visibleNotifList) readIds.add(notification.id)");
    expect(source).toContain("isActionRequiredPriority(n.priority)");
  });
});
