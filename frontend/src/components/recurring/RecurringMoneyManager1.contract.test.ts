import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const page = read("src/components/recurring/RecurringMoneyPage.tsx");
const route = read("app/recurring/page.tsx");
const dashboard = read("src/components/dashboard/DashboardPage.tsx");
const sidebar = read("src/components/layout/Sidebar.tsx");
const bottomNav = read("src/components/layout/BottomNav.tsx");
const header = read("src/components/layout/Header.tsx");

describe("RECURRING-MONEY-MANAGER-1 product wiring", () => {
  it("adds one authenticated recurring-money workspace", () => {
    expect(route).toContain("<AppShell>");
    expect(route).toContain("<RecurringMoneyPage />");
    expect(sidebar).toContain('href: "/recurring"');
    expect(sidebar).toContain('label: "Định Kỳ"');
    expect(bottomNav).toContain('"/recurring"');
    expect(header).toContain('"/recurring": {');
  });

  it("manages category schedules and legacy transaction schedules without creating wallet movements", () => {
    expect(page).toContain("updateCategoryRecurringSchedule");
    expect(page).toContain("updateTransactionRecurringSchedule");
    expect(page).toContain("clearShadowedLegacySchedules");
    expect(page).not.toContain("addTransaction(");
    expect(page).not.toContain("updateTransaction(");
    expect(page).toContain("Nguồn: giao dịch cũ");
    expect(page).toContain("Nguồn: danh mục");
  });

  it("supports list/calendar, pause/resume, edit and remove schedule flows", () => {
    expect(page).toContain('type ViewMode = "list" | "calendar"');
    expect(page).toContain("Tạm dừng");
    expect(page).toContain("Đã bật lịch định kỳ");
    expect(page).toContain("Xóa lịch định kỳ?");
    expect(page).toContain("30 ngày");
  });

  it("makes Dashboard consume the same canonical recurring read model", () => {
    expect(dashboard).toContain("buildRecurringMoneySchedules({");
    expect(dashboard).toContain("toRecurringScheduleInputs(");
    expect(dashboard).toContain("expandRecurringScheduleOccurrences(recurringSchedules, new Date(), 90)");
    expect(dashboard).toContain('router.push("/recurring")');
  });

  it("keeps forecast inputs fail-closed when schedule data is incomplete", () => {
    expect(page).toContain("toRecurringScheduleInputs(schedules)");
    expect(page).toContain("schedule.issues.length > 0");
    expect(page).toContain("Hãy hoàn tất cấu hình còn thiếu trước khi bật lại lịch.");
  });
});
