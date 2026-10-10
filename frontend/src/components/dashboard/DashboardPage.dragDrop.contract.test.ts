import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const dialogStart = source.indexOf("{isDashboardCustomizationOpen && (");
const dialogEnd = source.indexOf('data-dashboard-customization-zone="supporting-sections"', dialogStart);
const dialog = source.slice(dialogStart, dialogEnd);

describe("DASHBOARD-CUSTOMIZATION-DRAG-DROP-1 UI integration", () => {
  it("adds a dedicated touch-safe grip without hijacking visibility or arrow buttons", () => {
    expect(dialog).toContain("<GripVertical size={18}");
    expect(dialog).toContain("touch-none cursor-grab");
    expect(dialog).toContain('aria-keyshortcuts="ArrowUp ArrowDown"');
    expect(dialog).toContain("onPointerDown={(event) => handleDashboardSectionPointerDown(event, sectionId)}");
    expect(dialog).toContain("onPointerMove={handleDashboardSectionPointerMove}");
    expect(dialog).toContain("onPointerUp={handleDashboardSectionPointerUp}");
    expect(dialog).toContain("onPointerCancel={handleDashboardSectionPointerCancel}");
    expect(dialog).toContain("onLostPointerCapture={handleDashboardSectionPointerCancel}");
    expect(dialog).toContain("handleToggleDashboardSection(sectionId)");
    expect(dialog).toContain('handleMoveDashboardSection(sectionId, "up")');
    expect(dialog).toContain('handleMoveDashboardSection(sectionId, "down")');
  });

  it("shows the drop indicator and auto-scrolls inside the modal scroll region", () => {
    expect(dialog).toContain("dashboardDropMarker?.sectionId === sectionId");
    expect(dialog).toContain('data-dashboard-customization-row-id={sectionId}');
    expect(dialog).toContain("ref={dashboardCustomizationScrollRef}");
    expect(dialog).toContain("touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain");
    expect(source).toContain("requestAnimationFrame(dashboardSectionDragAutoScroll)");
    expect(source).toContain("scroller.scrollTop = Math.max(");
    expect(source).toContain("setPointerCapture(event.pointerId)");
    expect(source).toContain("releasePointerCapture(event.pointerId)");
  });

  it("persists one reordering only on pointer release and retains pinned sections", () => {
    const upStart = source.indexOf("function handleDashboardSectionPointerUp(");
    const upEnd = source.indexOf("function handleDashboardSectionPointerCancel(", upStart);
    const up = source.slice(upStart, upEnd);
    expect(up).toContain("reorderDashboardSection(dashboardCustomization, drag.sectionId, drag.targetIndex)");
    expect(up).toContain("applyDashboardCustomization(");
    expect(source).toContain("persistDashboardCustomization(nextCustomization)");
    expect(dialog).toContain("Khôi phục mặc định");
    expect(dialog).toContain("Tài sản ròng và các KPI vận hành luôn được ghim");
    expect(source).toContain('data-dashboard-customization-zone="supporting-sections"');
    expect(source).toContain("getDashboardSectionOrder(dashboardCustomization,");
  });
});
