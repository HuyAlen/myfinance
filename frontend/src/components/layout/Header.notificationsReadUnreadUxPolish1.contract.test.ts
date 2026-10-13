import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/layout/Header.tsx"),
  "utf8",
).replace(/\r\n?/g, "\n");

function notificationRow() {
  const start = source.indexOf("filteredNotifList.map((n) => {");
  const end = source.indexOf("                      })", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MYFINANCE-NOTIFICATIONS-READ-UNREAD-UX-POLISH-1 compact & accessible bell", () => {
  it("renders a compact, responsive row without a bottom-line mark-as-read button", () => {
    const row = notificationRow();
    expect(row).toContain("group flex w-full items-start border-b border-slate-100");
    expect(row).toContain("gap-2.5 px-3 py-3 text-left");
    expect(row).toContain("hover:bg-white/50");
    expect(row).not.toContain("pb-12 text-left");
    expect(row).not.toContain("absolute bottom-1 right-3");
    expect(row).not.toContain("Đánh dấu chưa đọc</button>");
  });

  it("keeps navigation and read toggle as sibling buttons, never nested", () => {
    const row = notificationRow();
    const navigate = row.indexOf("onClick={() => handleNotifClick(n.href, n.id)}");
    const closeNavigation = row.indexOf("</button>", navigate);
    const toggle = row.indexOf('data-notification-read-toggle="true"');
    const closeToggle = row.indexOf("</button>", toggle);
    expect(navigate).toBeGreaterThan(-1);
    expect(closeNavigation).toBeGreaterThan(navigate);
    expect(toggle).toBeGreaterThan(closeNavigation);
    expect(closeToggle).toBeGreaterThan(toggle);
    expect(row.slice(navigate, closeNavigation)).not.toContain("<button");
  });

  it("provides an accessible 44px icon-only read toggle with keyboard focus", () => {
    const row = notificationRow();
    expect(row).toContain("min-h-11 min-w-11 shrink-0");
    expect(row).toContain('aria-label={(n.read ? "Đánh dấu chưa đọc: " : "Đánh dấu đã đọc: ") + n.title}');
    expect(row).toContain('title={n.read ? "Đánh dấu chưa đọc" : "Đánh dấu đã đọc"}');
    expect(row).toContain("focus-visible:outline");
    expect(row).toContain('<Mail size={17} aria-hidden="true" />');
    expect(row).toContain('<MailOpen size={17} aria-hidden="true" />');
    expect(source).toContain("function handleSetNotificationRead(id: string, read: boolean)");
  });

  it("uses dot and background for read status, not severity", () => {
    const row = notificationRow();
    expect(row).toContain('const dot = n.read ? "bg-slate-300" : "bg-blue-500";');
    expect(row).toContain('const bg = n.read ? "bg-white" : "bg-blue-50/60";');
    expect(row).toContain('data-notification-read-state={n.read ? "read" : "unread"}');
    expect(row).toContain('aria-hidden="true"');
    expect(row).not.toContain('n.tone === "warning"\n                            ? "bg-amber-400"');
  });

  it("retains priority badges and direct next-action text", () => {
    const row = notificationRow();
    expect(row).toContain("data-notification-priority={n.priority}");
    expect(row).toContain("getActionableAlertPriorityLabel(n.priority)");
    expect(row).toContain('data-notification-action="true"');
    expect(row).toContain("{n.actionLabel}");
    expect(source).toContain("buildActionableFinanceAlerts({");
  });

  it("preserves the three filters, unread badge, mark-all, scroll, and iPhone width", () => {
    expect(source).toContain('aria-label="Lọc trạng thái thông báo"');
    expect(source).toContain("filterNotificationsByRead(visibleNotifList, notificationReadFilter)");
    expect(source).toContain("const unreadCount = visibleNotifList.filter((n) => !n.read).length;");
    expect(source).toContain("onClick={handleMarkAllRead}");
    expect(source).toContain("max-h-105 overflow-y-auto");
    expect(source).toContain("sm:w-[min(420px,calc(100vw-24px))]");
    expect(source).toContain("fixed inset-x-3 top-16");
  });

  it("does not add finance queries, new realtime channels, or new notification stores", () => {
    for (const name of ["getTransactions(", "getBudgets(", "getCategories(", "getGoals(", "getDebts("]) {
      expect(source.split(name).length - 1).toBe(1);
    }
    expect(source).not.toContain("supabase.channel(");
    expect(source).toContain('const NOTIFICATION_STORAGE_KEY = "myfinance_read_notifications";');
    expect(source).toContain("scopedNotificationStorageKey(NOTIFICATION_STORAGE_KEY, scope)");
  });
});
