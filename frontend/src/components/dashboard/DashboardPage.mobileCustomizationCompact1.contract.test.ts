import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const toolbarStart = source.indexOf('data-dashboard-customization-toolbar="true"');
const dialogStart = source.indexOf("{isDashboardCustomizationOpen && (", toolbarStart);
const dialogEnd = source.indexOf('data-dashboard-customization-zone="supporting-sections"', dialogStart);
const toolbar = source.slice(toolbarStart, dialogStart);
const dialog = source.slice(dialogStart, dialogEnd);

describe("DASHBOARD-MOBILE-CUSTOMIZATION-COMPACT-1", () => {
  it("condenses the mobile toolbar to one row while preserving the richer desktop copy", () => {
    expect(toolbarStart).toBeGreaterThan(-1);
    expect(toolbar).toContain('<span className="sm:hidden">Tùy chỉnh Tổng quan</span>');
    expect(toolbar).toContain('<span className="hidden sm:inline">Tổng quan của bạn</span>');
    expect(toolbar).toContain("tabular-nums text-[#60778D] sm:hidden");
    expect(toolbar).toContain('aria-label="Tùy chỉnh Tổng quan"');
    expect(toolbar).toContain('<span className="hidden sm:inline">Tùy chỉnh</span>');
    expect(toolbar).toContain("px-3 py-2.5");
  });

  it("uses a compact mobile sheet header and keeps the explanatory paragraph for desktop", () => {
    expect(dialogStart).toBeGreaterThan(-1);
    expect(dialog).toContain(
      'className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-[#2F80ED] sm:block"',
    );
    expect(dialog).toContain(
      'className="text-base font-black text-[#294A66] sm:mt-1 sm:text-lg"',
    );
    expect(dialog).toContain("mục đang hiển thị");
    expect(dialog).toContain(
      'className="mt-1 hidden max-w-xl text-xs leading-5 text-[#60778D] sm:block"',
    );
  });

  it("fits more rows on iPhone without shrinking show-hide or reorder touch targets", () => {
    expect(dialog).toContain('className="space-y-1.5 sm:space-y-2"');
    expect(dialog).toContain(
      'className="flex items-center gap-1.5 rounded-xl border border-[#DCE8F1] bg-[#FCFEFF] p-1.5 sm:gap-2 sm:rounded-2xl sm:p-3"',
    );
    expect(dialog).toContain(
      'className="mt-0.5 hidden text-[11px] leading-4 text-[#71879A] sm:line-clamp-2 sm:block"',
    );
    expect(dialog).toContain("flex size-10 shrink-0 items-center justify-center");
    expect(dialog).toContain("flex size-10 items-center justify-center");
  });

  it("keeps the safe-area footer visible and shortens only the mobile reset label", () => {
    expect(dialog).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    expect(dialog).toContain('<span className="sm:hidden">Mặc định</span>');
    expect(dialog).toContain(
      '<span className="hidden sm:inline">Khôi phục mặc định</span>',
    );
    expect(dialog).toContain("Xong");
  });

  it("preserves the existing customization behavior and accessibility contracts", () => {
    expect(source).toContain("toggleDashboardSection(dashboardCustomization, sectionId)");
    expect(source).toContain(
      "moveDashboardSection(dashboardCustomization, sectionId, direction)",
    );
    expect(source).toContain("createDefaultDashboardCustomization()");
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("aria-pressed={visible}");
    expect(source).toContain("useSuppressGlobalFabsWhileOpen(isDashboardCustomizationOpen)");
  });
});
