import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const header = readFileSync(
  path.resolve(__dirname, "Header.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const bottomNav = readFileSync(
  path.resolve(__dirname, "BottomNav.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function region(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MOBILE-NAV-DISCOVERABILITY-1", () => {
  it("makes the four non-bottom-nav destinations discoverable from the mobile account menu", () => {
    const mobile = region(
      header,
      'data-mobile-account-navigation="true"',
      'data-desktop-account-navigation="true"',
    );

    for (const [href, label] of [
      ["/ai-insights", "Cố vấn AI"],
      ["/activity", "Hoạt động"],
      ["/settings", "Cài đặt"],
      ["/help", "Hướng dẫn"],
    ]) {
      expect(mobile).toContain(`href="${href}"`);
      expect(mobile).toContain(label);
    }

    expect(mobile).toContain("md:hidden");
  });

  it("keeps these utility destinations out of the mobile Thêm bottom sheet", () => {
    const more = region(bottomNav, "const MORE_GROUPS = [", "const MORE_ROUTES =");

    for (const excluded of [
      "/ai-insights",
      "/activity",
      "/settings",
      "/help",
    ]) {
      expect(more).not.toContain(`href: "${excluded}"`);
    }
  });

  it("keeps desktop profile/settings actions separate from the mobile quick-access group", () => {
    const desktop = region(
      header,
      'data-desktop-account-navigation="true"',
      "{/* Logout */}",
    );

    expect(desktop).toContain("hidden md:block");
    expect(desktop).toContain('href="/settings#settings-profile"');
    expect(desktop).toContain("Hồ sơ cá nhân");
    expect(desktop).toContain('href="/settings"');
    expect(desktop).toContain("Cài đặt");
  });

  it("gives the account popup explicit accessible dialog semantics and mobile-safe scrolling", () => {
    expect(header).toContain('aria-label="Mở menu tài khoản"');
    expect(header).toContain('aria-haspopup="dialog"');
    expect(header).toContain("aria-expanded={dropdownOpen}");
    expect(header).toContain('aria-controls="header-account-menu"');
    expect(header).toContain('id="header-account-menu"');
    expect(header).toContain('role="dialog"');
    expect(header).toContain('aria-label="Menu tài khoản"');
    expect(header).toContain("max-h-[calc(100dvh-5rem)]");
    expect(header).toContain("overflow-y-auto");
    expect(header).toContain("overscroll-contain");
    expect(header).toContain("env(safe-area-inset-bottom)");
  });

  it("closes the account popup with Escape while preserving outside-click and logout close paths", () => {
    expect(header).toContain("if (!dropdownOpen) return;");
    expect(header).toContain('event.key === "Escape"');
    expect(header).toContain('document.addEventListener("keydown", handleKeyDown)');
    expect(header).toContain('document.removeEventListener("keydown", handleKeyDown)');
    expect(header).toContain("onClick={() => setDropdownOpen(false)}");
    expect(header).toContain("setDropdownOpen(false);");
  });
});
