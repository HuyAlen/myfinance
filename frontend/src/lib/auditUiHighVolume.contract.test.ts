import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const activityPage = read("frontend/src/components/activity/ActivityPage.tsx");
const service = read("frontend/src/services/finance/auditService.ts");
const header = read("frontend/src/components/layout/Header.tsx");

describe("AUDIT-UI-1.2 high-volume activity ledger", () => {
  it("uses a deterministic created_at + id cursor and one-row lookahead", () => {
    expect(service).toContain('.order("created_at", { ascending: false })');
    expect(service).toContain('.order("id", { ascending: false })');
    expect(service).toContain(".limit(pageSize + 1)");
    expect(service).toContain("created_at.lt.${createdAt}");
    expect(service).toContain("created_at.eq.${createdAt}");
    expect(service).toContain("id.lt.${id}");
    expect(service).toContain("rows.length > pageSize");
    expect(service).not.toContain(".range(");
  });

  it("bounds rendered DOM to one cursor page rather than appending forever", () => {
    expect(activityPage).toContain("const PAGE_SIZE = 30");
    expect(activityPage).toContain("setEvents(result.events)");
    expect(activityPage).toContain("cursorHistory");
    expect(activityPage).toContain("Trang {pageNumber} · tối đa {PAGE_SIZE} hoạt động");
    expect(activityPage).not.toContain("setEvents((current)");
    expect(activityPage).not.toContain("dedupeEvents");
  });

  it("applies the global date period as a server-side audit range", () => {
    expect(activityPage).toContain("useDateFilter");
    expect(activityPage).toContain("dateRange.startDate");
    expect(activityPage).toContain("dateRange.endDate");
    expect(activityPage).toContain("toAuditBounds");
    expect(service).toContain('.gte("created_at", options.createdFrom)');
    expect(service).toContain('.lte("created_at", options.createdTo)');
  });

  it("keeps filters sticky and uses day grouping for long ledgers", () => {
    expect(activityPage).toContain("sticky top-0 z-20");
    expect(activityPage).toContain("groupedEvents");
    expect(activityPage).toContain('if (key === todayKey) return "Hôm nay"');
    expect(activityPage).toContain('if (key === yesterdayKey) return "Hôm qua"');
  });

  it("uses compact expandable rows with 44px navigation targets on mobile", () => {
    expect(activityPage).toContain("<details");
    expect(activityPage).toContain('min-h-[72px]');
    expect(activityPage).toContain("min-h-11");
    expect(activityPage).toContain("Mới hơn");
    expect(activityPage).toContain("Cũ hơn");
  });

  it("shows lightweight skeletons instead of a large blocking loading card", () => {
    expect(activityPage).toContain("animate-pulse");
    expect(activityPage).toContain('h-[74px]');
    expect(activityPage).toContain("Đang cập nhật trang lịch sử...");
  });

  it("adds first-class /activity metadata to the shared application header", () => {
    expect(header).toContain('"/activity": {');
    expect(header).toContain('title: "Hoạt động"');
    expect(header).toContain('desc: "Lịch sử thay đổi tài chính & người thực hiện"');
  });
});
