import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

describe("MONTH-END-REVIEW-HISTORY-1 Dashboard wiring", () => {
  it("uses the dedicated history module instead of writing localStorage inline", () => {
    expect(source).toContain(
      'from "@/src/lib/month-end/monthEndReviewHistory"',
    );
    expect(source).toContain("readMonthEndReviewHistory()");
    expect(source).toContain("upsertMonthEndReviewHistory(");
    expect(source).toContain("persistMonthEndReviewHistory(nextHistory)");
    expect(source).not.toContain(
      'localStorage.setItem("myfinance:month-end-review-history-v1"',
    );
  });

  it("saves only from an explicit user action, never automatically from an effect", () => {
    const start = source.indexOf("function handleSaveMonthEndReviewHistory() {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\n  return (", start);
    expect(end).toBeGreaterThan(start);
    const handlerSource = source.slice(start, end);

    expect(handlerSource).toContain("if (!monthEndCloseout.visible) return;");
    expect(handlerSource).toContain("createMonthEndReviewHistoryRecord({");
    expect(handlerSource).toContain("persistMonthEndReviewHistory(nextHistory)");

    const effectsBeforeHandler = source.slice(0, start);
    expect(effectsBeforeHandler).not.toContain(
      "persistMonthEndReviewHistory(nextHistory)",
    );
  });

  it("renders an explicit save/update action and explains that the snapshot never locks the ledger", () => {
    expect(source).toContain('data-dashboard-decision="save-month-end-review"');
    expect(source).toContain("Lưu kết quả tháng");
    expect(source).toContain("Cập nhật bản lưu");
    expect(source).toContain("không khóa sổ cái");
    expect(source).toContain("trên thiết bị này");
  });

  it("renders persisted history outside the live closeout lifecycle surface", () => {
    expect(source).toContain('data-dashboard-decision="month-end-review-history"');
    expect(source).toContain("Lịch sử chốt tháng");
    expect(source).toContain("monthEndReviewHistory.slice(0, 6)");
    expect(source).toContain("getMonthEndReviewAttentionCount(record)");
  });

  it("reconciles another tab's local history without polling or adding a Supabase reader", () => {
    expect(source).toContain(
      'window.addEventListener("storage", handleMonthEndReviewHistoryStorage);',
    );
    expect(source).toContain(
      'window.removeEventListener("storage", handleMonthEndReviewHistoryStorage);',
    );
    expect(source).toContain("MONTH_END_REVIEW_HISTORY_STORAGE_KEY");
    expect(source).not.toContain("getMonthEndReviewHistory(");
  });

  it("keeps the existing month-end calculation as the source of snapshot values", () => {
    expect(source).toContain("monthKey: monthEndCloseout.monthKey");
    expect(source).toContain(
      "budgetConfigured: monthEndCloseout.budgetConfigured",
    );
    expect(source).toContain("budgetUsage: monthEndCloseout.budgetUsage");
    expect(source).toContain("reviewPending: monthEndCloseout.reviewPending");
    expect(source).toContain(
      "overBudgetCount: monthEndCloseout.overBudgetCount",
    );
    expect(source).toContain(
      "netCashMovement: monthEndCloseout.netCashMovement",
    );
    expect(source).toContain("netWorthDelta: monthEndCloseout.netWorthDelta");
  });
});
