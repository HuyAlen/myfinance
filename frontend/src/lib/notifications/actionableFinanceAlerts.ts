import type { FinanceReviewInbox } from "@/src/lib/dashboard/dashboardIntelligence";
import { buildTransactionsHref } from "@/src/lib/navigation/financeNavigation";
import type {
  FinanceNotification,
  FinanceNotificationTone,
} from "@/src/lib/notifications/financeNotifications";

export type ActionableFinanceAlertPriority = "urgent" | "action" | "info";

export type ActionableFinanceAlertKind =
  | "transaction-review"
  | "recurring-config"
  | "recurring-due"
  | "budget"
  | "cash-flow"
  | "debt"
  | "goal"
  | "finance";

export type ActionableFinanceAlert = FinanceNotification & {
  actionLabel: string;
  priority: ActionableFinanceAlertPriority;
  kind: ActionableFinanceAlertKind;
};

type ActionMeta = Pick<
  ActionableFinanceAlert,
  "actionLabel" | "priority" | "kind"
>;

function baseNotificationActionMeta(notification: FinanceNotification): ActionMeta {
  if (notification.id.startsWith("bover-")) {
    return {
      actionLabel: "Xem ngân sách",
      priority: "urgent",
      kind: "budget",
    };
  }

  if (
    notification.id.startsWith("batlimit-") ||
    notification.id.startsWith("bnear-")
  ) {
    return {
      actionLabel: "Xem ngân sách",
      priority: "action",
      kind: "budget",
    };
  }

  if (notification.id === "cashflow") {
    return {
      actionLabel: "Xem dòng tiền",
      priority: "urgent",
      kind: "cash-flow",
    };
  }

  if (notification.id.startsWith("drisk-")) {
    return {
      actionLabel: "Xem khoản nợ",
      priority: "action",
      kind: "debt",
    };
  }

  if (
    notification.id.startsWith("gdone-") ||
    notification.id.startsWith("gnear-")
  ) {
    return {
      actionLabel: "Xem mục tiêu",
      priority: "info",
      kind: "goal",
    };
  }

  return {
    actionLabel: "Mở chi tiết",
    priority: notification.tone === "warning" ? "action" : "info",
    kind: "finance",
  };
}

function enrichBaseNotification(
  notification: FinanceNotification,
): ActionableFinanceAlert {
  return {
    ...notification,
    ...baseNotificationActionMeta(notification),
  };
}

function buildReviewBody(reviewInbox: FinanceReviewInbox) {
  const parts: string[] = [];
  if (reviewInbox.uncategorizedCount > 0) {
    parts.push(`${reviewInbox.uncategorizedCount} chưa phân loại`);
  }
  if (reviewInbox.duplicateCount > 0) {
    parts.push(`${reviewInbox.duplicateCount} có thể trùng`);
  }
  if (reviewInbox.unusualExpenseCount > 0) {
    parts.push(`${reviewInbox.unusualExpenseCount} chi tiêu bất thường`);
  }

  return parts.length > 0
    ? `${parts.join(" · ")}. Rà soát trước khi dùng số liệu để ra quyết định.`
    : `${reviewInbox.total} giao dịch cần rà soát trước khi dùng số liệu để ra quyết định.`;
}

function buildTransactionReviewAlert(input: {
  reviewInbox: FinanceReviewInbox;
  currentMonth: string;
}): ActionableFinanceAlert | null {
  if (input.reviewInbox.total <= 0) return null;

  const reviewId = [
    "action-review",
    input.currentMonth,
    input.reviewInbox.total,
    input.reviewInbox.uncategorizedCount,
    input.reviewInbox.duplicateCount,
    input.reviewInbox.unusualExpenseCount,
  ].join("-");

  return {
    id: reviewId,
    title: `${input.reviewInbox.total} giao dịch cần rà soát`,
    body: buildReviewBody(input.reviewInbox),
    href: buildTransactionsHref({
      month: input.currentMonth,
      review: true,
    }),
    tone: "warning",
    actionLabel: "Rà soát ngay",
    priority: input.reviewInbox.duplicateCount > 0 ? "urgent" : "action",
    kind: "transaction-review",
  };
}

function buildRecurringDueAlert(input: {
  total: number;
  dueTodayCount: number;
  upcomingCount: number;
}): ActionableFinanceAlert | null {
  const dueTodayCount = Math.max(0, Math.floor(input.dueTodayCount || 0));
  const upcomingCount = Math.max(0, Math.floor(input.upcomingCount || 0));
  const total = Math.max(0, Math.floor(input.total || 0));
  if (total <= 0) return null;

  if (dueTodayCount > 0) {
    return {
      id: `action-recurring-due-${dueTodayCount}-${upcomingCount}`,
      title: `${dueTodayCount} khoản định kỳ đến hạn hôm nay`,
      body:
        upcomingCount > 0
          ? `Có thêm ${upcomingCount} khoản sắp đến hạn trong 3 ngày tới.`
          : "Mở Định Kỳ để ghi giao dịch khi bạn thực sự thanh toán hoặc nhận tiền.",
      href: "/recurring",
      tone: "warning",
      actionLabel: "Ghi giao dịch",
      priority: "action",
      kind: "recurring-due",
    };
  }

  return {
    id: `action-recurring-upcoming-${upcomingCount}`,
    title: `${upcomingCount} khoản định kỳ sắp đến hạn`,
    body: "Các khoản này đến hạn trong 3 ngày tới. MyFinance chỉ nhắc, không tự ghi giao dịch.",
    href: "/recurring",
    tone: "info",
    actionLabel: "Xem lịch định kỳ",
    priority: "info",
    kind: "recurring-due",
  };
}
function buildRecurringConfigAlert(
  invalidRecurringScheduleCount: number,
): ActionableFinanceAlert | null {
  const count = Math.max(0, Math.floor(invalidRecurringScheduleCount || 0));
  if (count <= 0) return null;

  return {
    id: `action-recurring-config-${count}`,
    title: `${count} lịch định kỳ cần sửa`,
    body: "Thiếu ngày chạy tiếp theo hoặc số tiền hợp lệ. Hoàn tất cấu hình để forecast không bị thiếu dữ liệu.",
    href: "/recurring",
    tone: "warning",
    actionLabel: "Sửa lịch định kỳ",
    priority: "action",
    kind: "recurring-config",
  };
}

/**
 * ACTIONABLE-FINANCE-ALERTS-1
 *
 * Converts the existing canonical finance notifications into explicit next
 * actions and adds two data-quality actions that already have canonical
 * detectors elsewhere in the app: Transaction Review and invalid Recurring
 * schedules. This layer NEVER re-derives Budget/Goal/Debt/Cash Flow math; the
 * base notifications remain the source of truth for those conditions.
 *
 * Ordering is intentionally NOT decided here. Header's established
 * notificationOrdering.ts first-seen contract remains the one ordering source
 * of truth, so read state and actionable metadata cannot silently reorder the
 * feed.
 */
export function buildActionableFinanceAlerts(input: {
  baseNotifications: FinanceNotification[];
  reviewInbox: FinanceReviewInbox;
  invalidRecurringScheduleCount: number;
  recurringDueSummary?: {
    total: number;
    dueTodayCount: number;
    upcomingCount: number;
  };
  currentMonth: string;
}): ActionableFinanceAlert[] {
  const reviewAlert = buildTransactionReviewAlert({
    reviewInbox: input.reviewInbox,
    currentMonth: input.currentMonth,
  });
  const recurringAlert = buildRecurringConfigAlert(
    input.invalidRecurringScheduleCount,
  );
  const recurringDueAlert = input.recurringDueSummary
    ? buildRecurringDueAlert(input.recurringDueSummary)
    : null;

  return [
    ...(reviewAlert ? [reviewAlert] : []),
    ...(recurringDueAlert ? [recurringDueAlert] : []),
    ...(recurringAlert ? [recurringAlert] : []),
    ...input.baseNotifications.map(enrichBaseNotification),
  ];
}

export function isActionRequiredPriority(
  priority: ActionableFinanceAlertPriority | undefined,
) {
  return priority === "urgent" || priority === "action";
}

export function getActionableAlertPriorityLabel(
  priority: ActionableFinanceAlertPriority,
) {
  if (priority === "urgent") return "Ưu tiên cao";
  if (priority === "action") return "Cần xử lý";
  return "Theo dõi";
}

export function getActionableAlertPriorityTone(
  priority: ActionableFinanceAlertPriority,
): FinanceNotificationTone {
  if (priority === "urgent" || priority === "action") return "warning";
  return "info";
}
