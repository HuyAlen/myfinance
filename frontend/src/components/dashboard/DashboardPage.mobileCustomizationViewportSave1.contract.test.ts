import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "DashboardPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const dialogStart = source.indexOf("{isDashboardCustomizationOpen && (");
const dialogEnd = source.indexOf(
  'data-dashboard-customization-zone="supporting-sections"',
  dialogStart,
);
const dialog = source.slice(dialogStart, dialogEnd);

describe("DASHBOARD-MOBILE-CUSTOMIZATION-VIEWPORT-SAVE-1", () => {
  it("portals customization outside the isolated Dashboard stacking context", () => {
    expect(source).toContain('import { createPortal } from "react-dom";');
    expect(dialog).toContain("createPortal(");
    expect(dialog).toContain("document.body");
    expect(dialog).toContain('data-dashboard-customization-viewport="true"');
    expect(dialog).toMatch(/fixed\s+inset-0[^\"]*\bz-100\b/);
  });

  it("tracks the real iPhone visual viewport while customization is open", () => {
    expect(source).toContain("window.visualViewport");
    expect(source).toContain("--dashboard-customization-visual-viewport-height");
    expect(source).toContain("--dashboard-customization-visual-viewport-offset-top");
    expect(source).toContain('viewport?.addEventListener("resize", syncDashboardCustomizationVisualViewport)');
    expect(source).toContain('viewport?.addEventListener("scroll", syncDashboardCustomizationVisualViewport)');
    expect(dialog).toContain('top: "var(--dashboard-customization-visual-viewport-offset-top, 0px)"');
    expect(dialog).toContain('height: "var(--dashboard-customization-visual-viewport-height, 100dvh)"');
  });

  it("keeps mobile back navigation and completion controls outside the only scroll region", () => {
    expect(dialog).toContain('aria-label="Quay lại Tổng quan"');
    expect(dialog).toContain("<ArrowLeft size={18} />");
    expect(dialog).toContain('<span className="text-xs font-black">T\u1ed5ng quan</span>');
    expect(dialog).toContain("touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain");
    expect(dialog).toContain("Xong");
    expect(dialog).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
  });

  it("reports automatic save success and failure without changing persistence semantics", () => {
    expect(source).toContain('useState<"ready" | "saved" | "error">("ready")');
    expect(source).toContain('setDashboardCustomizationSaveState("saved")');
    expect(source).toContain('setDashboardCustomizationSaveState("error")');
    expect(dialog).toContain('aria-live="polite"');
    expect(dialog).toContain("Đã lưu tự động");
    expect(dialog).toContain("Chưa lưu được");
    expect(dialog).toContain("Tự động lưu");
    expect(source).toContain("persistDashboardCustomization(nextCustomization)");
  });

  it("preserves reset, Escape, backdrop, and close behavior", () => {
    expect(source).toContain("createDefaultDashboardCustomization()");
    expect(source).toContain('if (event.key === "Escape") setIsDashboardCustomizationOpen(false);');
    expect(dialog).toContain('aria-label="Đóng tùy chỉnh Tổng quan"');
    expect(dialog).toContain('onClick={() => setIsDashboardCustomizationOpen(false)}');
    expect(dialog).toContain('<span className="sm:hidden">Mặc định</span>');
  });
});
