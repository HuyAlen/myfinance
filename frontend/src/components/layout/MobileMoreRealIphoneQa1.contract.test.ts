import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

const appShell = read("src/components/layout/AppShell.tsx");
const header = read("src/components/layout/Header.tsx");
const bottomNav = read("src/components/layout/BottomNav.tsx");
const sidebar = read("src/components/layout/Sidebar.tsx");
const appModal = read("src/components/ui/AppModal.tsx");

describe("MOBILE-MORE-REAL-IPHONE-QA-1", () => {
  it("binds More and the account popup to the real iPhone visual viewport", () => {
    for (const [source, prefix, syncName] of [
      [bottomNav, "mobile-more", "syncMobileMoreVisualViewport"],
      [header, "header-account", "syncHeaderAccountVisualViewport"],
    ] as const) {
      expect(source).toContain("window.visualViewport");
      expect(source).toContain(`--${prefix}-visual-viewport-height`);
      expect(source).toContain(`--${prefix}-visual-viewport-offset-top`);
      expect(source).toContain(`viewport?.addEventListener(\"resize\", ${syncName})`);
      expect(source).toContain(`viewport?.addEventListener(\"scroll\", ${syncName})`);
      expect(source).toContain(`window.addEventListener(\"orientationchange\", ${syncName})`);
      expect(source).toContain(`viewport?.removeEventListener(\"resize\", ${syncName})`);
      expect(source).toContain(`viewport?.removeEventListener(\"scroll\", ${syncName})`);
      expect(source).toContain(`window.removeEventListener(\"orientationchange\", ${syncName})`);
    }
  });

  it("keeps the More sheet inside the visible viewport with safe-area and internal scrolling", () => {
    expect(bottomNav).toContain(
      'top: "var(--mobile-more-visual-viewport-offset-top, 0px)"',
    );
    expect(bottomNav).toContain(
      'height: "var(--mobile-more-visual-viewport-height, 100dvh)"',
    );
    expect(bottomNav).toContain(
      'maxHeight: "min(calc(var(--mobile-more-visual-viewport-height, 100dvh) - 0.75rem), 42rem)"',
    );
    expect(bottomNav).toContain("overscroll-none");
    expect(bottomNav).toContain("touch-pan-y");
    expect(bottomNav).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps the mobile account popup inside the visible viewport and above persistent navigation", () => {
    expect(header).toContain('data-header-account-backdrop="true"');
    expect(header).toContain("fixed inset-x-0 top-0 z-60");
    expect(header).toContain("z-70");
    expect(header).toContain(
      'top: "var(--header-account-visual-viewport-offset-top, 0px)"',
    );
    expect(header).toContain(
      'height: "var(--header-account-visual-viewport-height, 100dvh)"',
    );
    expect(header).toContain(
      'maxHeight: "calc(var(--header-account-visual-viewport-height, 100dvh) - 5rem)"',
    );
    expect(header).toContain("touch-pan-y");
    expect(header).toContain("env(safe-area-inset-bottom)");
  });

  it("centralizes shell-overlay state so the finance scroller cannot move behind mobile chrome", () => {
    expect(appShell).toContain("const [headerAccountOpen, setHeaderAccountOpen] = useState(false);");
    expect(appShell).toContain("const [moreMenuOpen, setMoreMenuOpen] = useState(false);");
    expect(appShell).toContain("const shellChromeOverlayOpen =");
    expect(appShell).toContain(
      "sidebarOpen || headerAccountOpen || moreMenuOpen;",
    );
    expect(appShell).toContain("onAccountMenuOpenChange={setHeaderAccountOpen}");
    expect(appShell).toContain("onMoreMenuOpenChange={setMoreMenuOpen}");
    expect(appShell).toContain(
      'data-mobile-chrome-overlay-open={shellChromeOverlayOpen ? "true" : undefined}',
    );
    expect(appShell).toContain(
      "data-[mobile-chrome-overlay-open=true]:overflow-y-hidden",
    );
    expect(appShell).toContain(
      "data-[mobile-chrome-overlay-open=true]:overscroll-none",
    );
  });

  it("suppresses floating actions while global mobile chrome owns interaction", () => {
    expect(appShell).toContain("!shellChromeOverlayOpen && (");
    expect(appShell).toContain(
      "!aiAgentOpen && !isGlobalFabSuppressed && !shellChromeOverlayOpen && <QuickActionFab />",
    );
  });

  it("uses an explicit overlay layer order: header < bottom nav < sidebar/account < More < page dialogs", () => {
    expect(header).toContain("sticky top-0 z-30");
    expect(bottomNav).toContain("fixed inset-x-0 bottom-0 z-50");
    expect(sidebar).toContain("fixed inset-y-0 left-0 z-70");
    expect(header).toContain("fixed inset-x-0 top-0 z-60");
    expect(header).toContain("z-70");
    expect(bottomNav).toContain("fixed inset-0 z-80 lg:hidden");
    expect(appModal).toMatch(/fixed\s+inset-0[^\"]*\bz-100\b/);
  });

  it("reports overlay lifecycle to AppShell and closes the account popup when the sidebar takes over", () => {
    expect(bottomNav).toContain("onMoreMenuOpenChange?.(moreOpen)");
    expect(bottomNav).toContain("onMoreMenuOpenChange?.(false)");
    expect(header).toContain("onAccountMenuOpenChange?.(dropdownOpen)");
    expect(header).toContain("onAccountMenuOpenChange?.(false)");
    expect(header).toContain("if (sidebarOpen) setDropdownOpen(false);");
  });
});
