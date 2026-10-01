import { describe, expect, it } from "vitest";
import {
  buildActionableFinanceAlerts,
  getActionableAlertPriorityLabel,
  isActionRequiredPriority,
} from "./actionableFinanceAlerts";
import type { FinanceReviewInbox } from "@/src/lib/dashboard/dashboardIntelligence";
import type { FinanceNotification } from "./financeNotifications";

const emptyReview: FinanceReviewInbox = {
  total: 0,
  uncategorizedCount: 0,
  duplicateCount: 0,
  unusualExpenseCount: 0,
  items: [],
};

function base(overrides: Partial<FinanceNotification> & { id: string }): FinanceNotification {
  return {
    title: "Thông báo",
    body: "Chi tiết",
    href: "/reports",
    tone: "warning",
    ...overrides,
  };
}

describe("ACTIONABLE-FINANCE-ALERTS-1 — canonical alert enrichment", () => {
  it("preserves canonical notification identity/content/navigation while adding an explicit next action", () => {
    const original = base({
      id: "bover-budget-1",
      title: "Vượt ngân sách · Ăn uống",
      body: "Đã chi 125% ngân sách tháng này.",
      href: "/budgets?budgetId=budget-1",
    });

    const [alert] = buildActionableFinanceAlerts({
      baseNotifications: [original],
      reviewInbox: emptyReview,
      invalidRecurringScheduleCount: 0,
      currentMonth: "2026-10",
    });

    expect(alert).toMatchObject(original);
    expect(alert.actionLabel).toBe("Xem ngân sách");
    expect(alert.priority).toBe("urgent");
    expect(alert.kind).toBe("budget");
    expect(original).not.toHaveProperty("actionLabel");
  });

  it("maps canonical finance conditions structurally by stable id — never by presentation title/body text", () => {
    const alerts = buildActionableFinanceAlerts({
      baseNotifications: [
        base({ id: "batlimit-b1" }),
        base({ id: "bnear-b2" }),
        base({ id: "cashflow" }),
        base({ id: "drisk-d1" }),
        base({ id: "gdone-g1", tone: "success" }),
        base({ id: "gnear-g2", tone: "success" }),
      ],
      reviewInbox: emptyReview,
      invalidRecurringScheduleCount: 0,
      currentMonth: "2026-10",
    });

    expect(alerts.map((item) => [item.id, item.priority, item.actionLabel])).toEqual([
      ["batlimit-b1", "action", "Xem ngân sách"],
      ["bnear-b2", "action", "Xem ngân sách"],
      ["cashflow", "urgent", "Xem dòng tiền"],
      ["drisk-d1", "action", "Xem khoản nợ"],
      ["gdone-g1", "info", "Xem mục tiêu"],
      ["gnear-g2", "info", "Xem mục tiêu"],
    ]);
  });

  it("creates one actionable Transaction Review alert from the already-reconciled review inbox", () => {
    const reviewInbox: FinanceReviewInbox = {
      total: 4,
      uncategorizedCount: 2,
      duplicateCount: 1,
      unusualExpenseCount: 1,
      items: [],
    };

    const [alert] = buildActionableFinanceAlerts({
      baseNotifications: [],
      reviewInbox,
      invalidRecurringScheduleCount: 0,
      currentMonth: "2026-10",
    });

    expect(alert.id).toBe("action-review-2026-10-4-2-1-1");
    expect(alert.href).toBe("/transactions?month=2026-10&review=1");
    expect(alert.actionLabel).toBe("Rà soát ngay");
    expect(alert.priority).toBe("urgent");
    expect(alert.body).toContain("2 chưa phân loại");
    expect(alert.body).toContain("1 có thể trùng");
    expect(alert.body).toContain("1 chi tiêu bất thường");
  });

  it("a review queue without possible duplicates is actionable but not escalated to urgent", () => {
    const [alert] = buildActionableFinanceAlerts({
      baseNotifications: [],
      reviewInbox: {
        ...emptyReview,
        total: 1,
        uncategorizedCount: 1,
      },
      invalidRecurringScheduleCount: 0,
      currentMonth: "2026-10",
    });

    expect(alert.priority).toBe("action");
  });

  it("creates one Recurring configuration action only when canonical invalid-schedule count is non-zero", () => {
    const alerts = buildActionableFinanceAlerts({
      baseNotifications: [],
      reviewInbox: emptyReview,
      invalidRecurringScheduleCount: 3,
      currentMonth: "2026-10",
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "action-recurring-config-3",
      href: "/recurring",
      actionLabel: "Sửa lịch định kỳ",
      priority: "action",
      kind: "recurring-config",
    });
  });

  it("emits no synthetic data-quality alert when Review and Recurring are clean", () => {
    expect(
      buildActionableFinanceAlerts({
        baseNotifications: [],
        reviewInbox: emptyReview,
        invalidRecurringScheduleCount: 0,
        currentMonth: "2026-10",
      }),
    ).toEqual([]);
  });

  it("does not impose a second ordering/cap policy — Header remains the single newest-first ordering authority", () => {
    const baseNotifications = Array.from({ length: 8 }, (_, index) =>
      base({ id: `bover-${index}` }),
    );
    const alerts = buildActionableFinanceAlerts({
      baseNotifications,
      reviewInbox: { ...emptyReview, total: 1, uncategorizedCount: 1 },
      invalidRecurringScheduleCount: 1,
      currentMonth: "2026-10",
    });

    expect(alerts).toHaveLength(10);
    expect(alerts.slice(2).map((item) => item.id)).toEqual(
      baseNotifications.map((item) => item.id),
    );
  });
});

describe("action-required semantics", () => {
  it("counts urgent/action as work to do, while info stays informational", () => {
    expect(isActionRequiredPriority("urgent")).toBe(true);
    expect(isActionRequiredPriority("action")).toBe(true);
    expect(isActionRequiredPriority("info")).toBe(false);
    expect(isActionRequiredPriority(undefined)).toBe(false);
  });

  it("exposes stable Vietnamese priority labels for the Header UI", () => {
    expect(getActionableAlertPriorityLabel("urgent")).toBe("Ưu tiên cao");
    expect(getActionableAlertPriorityLabel("action")).toBe("Cần xử lý");
    expect(getActionableAlertPriorityLabel("info")).toBe("Theo dõi");
  });
});
