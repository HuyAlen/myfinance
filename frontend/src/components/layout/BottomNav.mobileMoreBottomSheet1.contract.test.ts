import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (fileName: string) =>
  readFileSync(path.resolve(__dirname, fileName), "utf8").replace(/\r\n/g, "\n");

const source = read("BottomNav.tsx");
const mobileNavigation = read("mobileNavigation.ts");

function region(sourceText: string, startMarker: string, endMarker: string) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start + startMarker.length);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return sourceText.slice(start, end);
}

describe("MOBILE-MORE-BOTTOM-SHEET-1", () => {
  it("turns Thêm into a dialog trigger instead of navigating directly to Danh mục", () => {
    expect(source).toContain('aria-haspopup="dialog"');
    expect(source).toContain('aria-controls="mobile-more-menu"');
    expect(source).toContain('aria-expanded={moreOpen}');
    expect(source).toContain('onClick={() => setMoreOpen(true)}');
    expect(source).not.toContain(
      '{ label: "Thêm", icon: MoreHorizontal, href: "/categories" }',
    );
  });

  it("keeps the five primary mobile destinations unchanged except for Thêm becoming the sheet trigger", () => {
    const primary = region(
      mobileNavigation,
      "export const MOBILE_PRIMARY_NAV_ITEMS = [",
      "export const MOBILE_MORE_GROUPS = [",
    );
    expect(primary).toContain('{ label: "Tổng quan", icon: Home, href: "/" }');
    expect(primary).toContain(
      '{ label: "Giao dịch", icon: ReceiptText, href: "/transactions" }',
    );
    expect(primary).toContain(
      '{ label: "Ngân sách", icon: ChartPie, href: "/budgets" }',
    );
    expect(primary).toContain(
      '{ label: "Tiết kiệm", icon: PiggyBank, href: "/savings" }',
    );
    expect(source).toContain("MOBILE_PRIMARY_NAV_ITEMS.map");
    expect(source).toContain("grid-cols-5");
  });

  it("shows only the agreed seven secondary destinations in two groups", () => {
    const more = region(
      mobileNavigation,
      "export const MOBILE_MORE_GROUPS = [",
      "export const MOBILE_ACCOUNT_NAV_ITEMS = [",
    );

    for (const href of [
      "/wallets",
      "/goals",
      "/recurring",
      "/categories",
      "/reports",
      "/investments",
      "/debts",
    ]) {
      expect(more).toContain(`href: "${href}"`);
    }

    for (const excluded of [
      "/savings",
      "/ai-insights",
      "/activity",
      "/settings",
      "/help",
    ]) {
      expect(more).not.toContain(`href: "${excluded}"`);
    }

    expect(more).toContain('label: "Quản lý"');
    expect(more).toContain('label: "Phân tích & tài sản"');
    expect(source).toContain("MOBILE_MORE_GROUPS.map");
  });

  it("uses an iPhone-safe modal bottom sheet above the persistent bottom navigation", () => {
    expect(source).toContain('data-mobile-more-sheet="true"');
    expect(source).toContain("fixed inset-0 z-80 lg:hidden");
    expect(source).toContain('id="mobile-more-menu"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("max-h-[min(78dvh,42rem)]");
    expect(source).toContain("overscroll-contain");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("closes from backdrop, close control, destination selection, Escape and route changes", () => {
    expect(source).toContain('aria-label="Đóng menu Thêm"');
    expect(source).toContain("onClick={() => setMoreOpen(false)}");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('document.addEventListener("keydown", handleKeyDown)');
    expect(source).toContain('document.removeEventListener("keydown", handleKeyDown)');
    expect(source).toContain("setMoreOpen(false);");
    expect(source).toContain("}, [pathname]);");
  });

  it("derives Thêm active state from the same grouped destinations rendered by the sheet", () => {
    expect(mobileNavigation).toContain(
      "export const MOBILE_MORE_ROUTES = MOBILE_MORE_GROUPS.flatMap((group) =>",
    );
    expect(mobileNavigation).toContain("group.items.map((item) => item.href)");
    expect(mobileNavigation).toContain("export function isMobileMorePath(pathname: string)");
    expect(source).toContain("const moreRouteActive = isMobileMorePath(pathname);");
    expect(source).toContain(
      'aria-current={moreRouteActive ? "page" : undefined}',
    );
  });
});