import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const shell = read("src/components/layout/AppShell.tsx");
const controller = read("src/components/layout/MobileBottomNavScrollHide.tsx");
const css = read("src/components/layout/MobileBottomNavScrollHide.module.css");

describe("mobile iPhone bottom navigation visibility contract", () => {
  it("only replaces AppShell's BottomNav integration", () => {
    expect(shell).toContain('import MobileBottomNavScrollHide from "./MobileBottomNavScrollHide";');
    expect(shell).toContain("<MobileBottomNavScrollHide");
    expect(shell).toContain("onMoreMenuOpenChange={setMoreMenuOpen}");
    expect(shell).toContain("holdVisible={shellChromeOverlayOpen || sidebarOpen}");
    expect(shell).toContain('className="finance-main ');
    expect(shell).toContain("--mobile-bottom-nav-height");
  });

  it("listens to the real finance-main scroll owner with a passive listener", () => {
    expect(controller).toContain('querySelector<HTMLElement>(".finance-main")');
    expect(controller).toContain('addEventListener("scroll", onScroll, { passive: true })');
    expect(controller).toContain('removeEventListener("scroll", onScroll)');
    expect(controller).toContain('usePathname()');
    expect(controller).toContain('window.innerWidth !== lastWidth');
  });

  it("preserves BottomNav implementation, menus, and responsive breakpoint", () => {
    expect(controller).toContain('import BottomNav from "./BottomNav"');
    expect(controller).toContain("<BottomNav onMoreMenuOpenChange={onMoreMenuOpenChange} />");
    expect(controller).toContain('matchMedia("(max-width: 767px)")');
    expect(controller).toContain('data-myfinance-mobile-bottom-nav-target');
    expect(controller).toContain("target.inert = false");
  });

  it("moves only the bottom bar, preserving iPhone safe area", () => {
    expect(css).toContain("display: contents;");
    expect(css).toContain("translate: 0 calc(100% + env(safe-area-inset-bottom, 0px) + 12px);");
    expect(css).toContain('data-hidden="true"');
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
