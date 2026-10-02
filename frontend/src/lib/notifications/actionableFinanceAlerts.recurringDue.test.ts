import { describe, expect, it } from "vitest";
import { buildActionableFinanceAlerts } from "./actionableFinanceAlerts";

const emptyReview = {
  total: 0,
  uncategorizedCount: 0,
  duplicateCount: 0,
  unusualExpenseCount: 0,
  items: [],
};

describe("RECURRING-DUE-ACTION-1 actionable notification", () => {
  it("creates an action-priority alert when something is due today", () => {
    const alerts = buildActionableFinanceAlerts({
      baseNotifications: [],
      reviewInbox: emptyReview,
      invalidRecurringScheduleCount: 0,
      currentMonth: "2026-10",
      recurringDueSummary: {
        total: 2,
        dueTodayCount: 1,
        upcomingCount: 1,
      },
    });
    expect(alerts[0]).toMatchObject({
      kind: "recurring-due",
      priority: "action",
      href: "/recurring",
      actionLabel: "Ghi giao dịch",
    });
    expect(alerts[0].title).toContain("đến hạn hôm nay");
  });

  it("creates an info reminder when only upcoming items exist", () => {
    const alerts = buildActionableFinanceAlerts({
      baseNotifications: [],
      reviewInbox: emptyReview,
      invalidRecurringScheduleCount: 0,
      currentMonth: "2026-10",
      recurringDueSummary: {
        total: 2,
        dueTodayCount: 0,
        upcomingCount: 2,
      },
    });
    expect(alerts[0]).toMatchObject({
      kind: "recurring-due",
      priority: "info",
      href: "/recurring",
      actionLabel: "Xem lịch định kỳ",
    });
  });
});
