import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settings = readFileSync(
  resolve(process.cwd(), "src/components/settings/SettingsPage.tsx"),
  "utf8",
).replace(/\r\n?/g, "\n");
const shell = readFileSync(
  resolve(process.cwd(), "src/components/layout/AppShell.tsx"),
  "utf8",
).replace(/\r\n?/g, "\n");

describe("SETTINGS-DESKTOP-SCROLLSPY-1 wiring and regressions", () => {
  it("tracks the actual AppShell inner scroll root, not window or document scroll", () => {
    expect(shell).toContain('className="finance-main min-h-0 flex-1');
    expect(settings).toContain('document.querySelector<HTMLElement>("main.finance-main")');
    expect(settings).toContain('scrollRoot.addEventListener("scroll", scheduleSync, { passive: true })');
    expect(settings).toContain('scrollRoot.removeEventListener("scroll", scheduleSync)');
    expect(settings).toContain('window.cancelAnimationFrame(frameId)');
    expect(settings).toContain('window.requestAnimationFrame(syncActiveSection)');
  });

  it("highlights whichever section is in view without replacing explicit click navigation", () => {
    expect(settings).toContain('resolveActiveSettingsSection(positions, activationLine, atScrollEnd)');
    expect(settings).toContain('setActiveSection((current) => (current === next ? current : next))');
    expect(settings).toContain('onClick={() => scrollTo(s.id)}');
    expect(settings).toContain('?.scrollIntoView({ behavior: "smooth", block: "start" })');
  });

  it("keeps desktop menu sticky and internally scrollable on shorter displays", () => {
    expect(settings).toContain('className="hidden w-44 shrink-0 xl:block"');
    expect(settings).toContain('ref={desktopSectionNavRef}');
    expect(settings).toContain('sticky top-6 max-h-[calc(100dvh_-_8.5rem)] overflow-y-auto');
    expect(settings).toContain('aria-current={active ? "location" : undefined}');
    expect(settings).toContain('nav.scrollTop += itemRect.bottom - navRect.bottom + margin');
  });

  it("preserves existing fixed mobile navigation and responsive breakpoint", () => {
    expect(settings).toContain('className="fixed inset-x-0 top-[8.5625rem] z-20');
    expect(settings).toContain('aria-label="Điều hướng cài đặt"');
    expect(settings).toContain('xl:hidden');
  });
});
