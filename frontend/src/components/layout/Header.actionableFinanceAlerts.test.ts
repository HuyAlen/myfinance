import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ACTIONABLE-FINANCE-ALERTS-1 — Header wiring", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8").replace(/\r\n/g, "\n");
  const normalized = source.replace(/\s+/g, " ");

  it("keeps the canonical finance rule engine and layers actions on top instead of re-deriving Budget/Goal/Debt/Cash Flow rules in Header", () => {
    expect(source).toContain('from "@/src/lib/notifications/financeNotifications"');
    expect(source).toContain("buildFinanceNotifications({");
    expect(source).toContain('from "@/src/lib/notifications/actionableFinanceAlerts"');
    expect(source).toContain("buildActionableFinanceAlerts({");
    expect(source).not.toContain("if (pct >= 100)");
    expect(source).not.toContain("pct >= 80");
  });

  it("uses the exact Transaction Review detector + acknowledgement semantics already used by Transactions/Dashboard", () => {
    expect(source).toContain("buildFinanceReviewInbox({");
    expect(source).toContain("limit: Number.MAX_SAFE_INTEGER");
    expect(source).toContain("applyTransactionReviewAcknowledgements(");
    expect(source).toContain("readTransactionReviewAcknowledgements()");
  });

  it("uses the canonical invalid-recurring detector rather than a Header-specific copy", () => {
    expect(source).toContain("countInvalidRecurringSchedules({");
    expect(normalized).toContain("categories: data.categories, transactions: data.transactions");
  });

  it("refreshes the existing single-flight Header reconciliation when same-tab or cross-tab review acknowledgements change", () => {
    expect(source).toContain("TRANSACTION_REVIEW_ACK_EVENT");
    expect(source).toContain("TRANSACTION_REVIEW_ACK_STORAGE_KEY");
    expect(normalized).toContain("window.addEventListener( TRANSACTION_REVIEW_ACK_EVENT, handleReviewAcknowledgementChange, );");
    expect(source).toContain('window.addEventListener("storage", handleReviewAcknowledgementStorage);');
    expect(source).toContain("requestHeaderRefresh();");
  });

  it("adds no data-fetch call sites — actionable alerts reuse the existing Header snapshot", () => {
    for (const fn of [
      "getTransactions(",
      "getWallets(",
      "getCategories(",
      "getGoals(",
      "getBudgets(",
      "getDebts(",
      "getInvestments(",
      "getForexAccounts(",
      "getSavings(",
    ]) {
      expect(source.split(fn).length - 1).toBe(1);
    }
  });

  it("keeps first-seen ordering as the single ordering authority and does not sort by alert priority in the UI", () => {
    expect(source.split("sortNotificationsNewestFirst(").length - 1).toBe(1);
    expect(source).not.toContain("sortActionableFinanceAlerts");
  });

  it("exposes action-required count, priority badge and direct next-action affordance without nesting another button inside the notification row", () => {
    expect(source).toContain("const actionRequiredCount = visibleNotifList.filter(");
    expect(source).toContain("isActionRequiredPriority(n.priority)");
    expect(source).toContain('data-notification-priority={n.priority}');
    expect(source).toContain('data-notification-action="true"');
    expect(source).toContain("getActionableAlertPriorityLabel(n.priority)");
    expect(source).toContain("{n.actionLabel}");
    expect(source).toContain("<ArrowRight size={12} aria-hidden=\"true\" />");
  });

  it("household invite keeps participating in the global action count with an explicit next action", () => {
    const start = source.indexOf("const householdInviteNotifications");
    const end = source.indexOf("const visibleNotifList", start);
    const region = source.slice(start, end);
    expect(region).toContain('actionLabel: "Xem lời mời"');
    expect(region).toContain('priority: "action" as const');
  });
});
