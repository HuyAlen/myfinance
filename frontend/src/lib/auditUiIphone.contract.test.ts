import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const activityPage = readFileSync(
  path.join(repoRoot, "frontend/src/components/activity/ActivityPage.tsx"),
  "utf8",
);

describe("AUDIT-UI-1.3 iPhone filter sheet, readability and touch targets", () => {
  it("replaces the tall sticky mobile filter form with one compact trigger", () => {
    expect(activityPage).toContain("mobileFiltersOpen");
    expect(activityPage).toContain("setMobileFiltersOpen(true)");
    expect(activityPage).toContain('aria-haspopup="dialog"');
    expect(activityPage).toContain("selectedFilterLabels");
    expect(activityPage).toContain("Tất cả dữ liệu · Tất cả thao tác · Tất cả thành viên");
    expect(activityPage).toContain('className="sticky top-0 z-20 sm:hidden"');
    expect(activityPage).toContain('className="sticky top-0 z-20 hidden');
  });

  it("uses an iPhone bottom sheet with safe-area padding and explicit dismiss affordances", () => {
    expect(activityPage).toContain('role="dialog"');
    expect(activityPage).toContain('aria-modal="true"');
    expect(activityPage).toContain("fixed inset-0 z-[80]");
    expect(activityPage).toContain("safe-area-inset-bottom");
    expect(activityPage).toContain("Đóng bộ lọc");
    expect(activityPage).toContain("Xem kết quả");
    expect(activityPage).toContain('event.key === "Escape"');
    expect(activityPage).toContain('document.body.style.overflow = "hidden"');
  });

  it("keeps mobile filter controls and refresh actions at least 44px tall", () => {
    expect(activityPage).toContain("flex size-11 shrink-0 items-center justify-center");
    expect(activityPage).toContain("min-h-11 w-full items-center justify-between");
    expect(activityPage).toContain("min-h-12 w-full rounded-2xl");
    expect(activityPage).toContain("min-h-12 rounded-2xl bg-blue-600");
  });

  it("raises summary typography above micro-text on narrow iPhone widths", () => {
    expect(activityPage).toContain("text-[10px] font-black ${actionMeta.badge}");
    expect(activityPage).toContain('text-[10px] font-black uppercase tracking-wide text-slate-400');
    expect(activityPage).toContain('mt-1 truncate text-[13px] font-black text-slate-900');
    expect(activityPage).toContain('mt-0.5 truncate text-[10px] font-semibold text-slate-400 sm:text-[11px]');
    expect(activityPage).toContain('truncate text-[11px] font-bold text-slate-500 sm:text-[12px]');
  });

  it("stacks before and after values vertically on mobile while retaining desktop side-by-side comparison", () => {
    expect(activityPage).toContain("sm:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)]");
    expect(activityPage).toContain("sm:hidden\">\n                                            Trước");
    expect(activityPage).toContain("sm:hidden\">\n                                            Sau");
    expect(activityPage).toContain("↓");
    expect(activityPage).toContain("hidden text-center font-black text-slate-300 sm:block");
    expect(activityPage).toContain("bg-blue-50/70");
  });

  it("preserves the high-volume cursor ledger instead of reverting to unbounded cards", () => {
    expect(activityPage).toContain("const PAGE_SIZE = 30");
    expect(activityPage).toContain("cursorHistory");
    expect(activityPage).toContain("Mới hơn");
    expect(activityPage).toContain("Cũ hơn");
    expect(activityPage).toContain("<details");
    expect(activityPage).not.toContain("Tải thêm lịch sử");
  });
});
