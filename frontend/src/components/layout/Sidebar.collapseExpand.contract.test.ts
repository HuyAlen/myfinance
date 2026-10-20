import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sidebar = read("src/components/layout/Sidebar.tsx");
const shell = read("src/components/layout/AppShell.tsx");

describe("MYFINANCE-SIDEBAR-COLLAPSE-EXPAND-P1", () => {
  it("offers a desktop-only accessible width toggle", () => {
    expect(sidebar).toContain("PanelLeftClose");
    expect(sidebar).toContain("PanelLeftOpen");
    expect(sidebar).toContain("Mở rộng thanh bên");
    expect(sidebar).toContain("Thu gọn thanh bên");
    expect(sidebar).toContain("lg:inline-flex");
    expect(sidebar).toContain("aria-expanded={!collapsed}");
    expect(sidebar).toContain("lg:w-20");
    expect(sidebar).toContain("lg:w-64");
  });

  it("persists the chosen width safely without changing initial hydration markup", () => {
    expect(shell).toContain('useState(false)');
    expect(shell).toContain('SIDEBAR_COLLAPSED_STORAGE_KEY = "myfinance:sidebar-collapsed"');
    expect(shell).toContain("window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)");
    expect(shell).toContain("window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next))");
    expect(shell).toContain('sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"');
    expect(shell).toContain("collapsed={sidebarCollapsed}");
    expect(shell).toContain("onToggleCollapsed={toggleSidebarCollapsed}");
  });

  it("keeps all destinations accessible, tooltips unclipped and active-route styling", () => {
    expect(sidebar).toContain("NAV_GROUPS.map");
    expect(sidebar).toContain("group.items.map");
    expect(sidebar).toContain("aria-label={collapsed ? item.label : undefined}");
    expect(sidebar).toContain('aria-current={active ? "page" : undefined}');
    expect(sidebar).toContain("onMouseEnter={(event) => showTooltip(event, item.label)}");
    expect(sidebar).toContain("onFocus={(event) => showTooltip(event, item.label)}");
    expect(sidebar).toContain("aria-hidden=\"true\"");
    expect(sidebar).toContain("absolute left-full");
    expect(sidebar).toContain("lg:sr-only");
    expect(sidebar).toContain("navScrollRef");
  });

  it("preserves the mobile drawer and shows a minimal desktop connection indicator", () => {
    expect(sidebar).toContain("w-[min(18rem,85vw)]");
    expect(sidebar).toContain("lg:hidden");
    expect(sidebar).toContain("lg:visible lg:translate-x-0");
    expect(sidebar).toContain('role="status"');
    expect(sidebar).toContain("lg:justify-center");
    expect(sidebar).toContain("lg:hidden");
    expect(sidebar).toContain("onClose()");
    expect(shell).toContain("setSidebarOpen(false)");
  });

  it("does not disturb the existing scrolling, realtime or seasonal surfaces", () => {
    expect(sidebar).toContain("useLayoutEffect");
    expect(sidebar).toContain("nav.scrollTop = savedScrollTop");
    expect(sidebar).toContain('SeasonalWorkspaceAmbientMotion area="sidebar"');
    expect(sidebar).toContain("useRealtime()");
    expect(shell).toContain("finance-main min-h-0 flex-1 overflow-x-clip overflow-y-auto");
    expect(shell).toContain('data-mobile-chrome-overlay-open={shellChromeOverlayOpen ? "true" : undefined}');
  });
});
