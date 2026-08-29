import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8");

const css = read("app/globals.css");
const appShell = read("src/components/layout/AppShell.tsx");
const header = read("src/components/layout/Header.tsx");
const sidebar = read("src/components/layout/Sidebar.tsx");
const bottomNav = read("src/components/layout/BottomNav.tsx");
const skeleton = read("src/components/layout/StartupShellSkeleton.tsx");

describe("APP-VISUAL-CONTRAST-1 unified financial surface contract", () => {
  it("defines one stronger soft-blue financial surface token system", () => {
    expect(css).toContain("--finance-page: #edf3f8");
    expect(css).toContain("--finance-border: #c7d5e2");
    expect(css).toContain("--finance-border-strong: #adc0d0");
    expect(css).toContain("--finance-text: #294760");
    expect(css).toContain("--finance-text-secondary: #4e687e");
    expect(css).toContain("--finance-primary: #2f80ed");
  });

  it("binds every authenticated page to the shared shell and page background", () => {
    expect(appShell).toContain("finance-shell h-(--app-height)");
    expect(appShell).toContain("finance-main min-h-0 flex-1");
    expect(appShell).toContain("bg-[var(--finance-page)]");
    expect(css).toContain(".finance-main {");
  });

  it("gives header, sidebar and bottom navigation explicit cross-page surface hierarchy", () => {
    expect(header).toContain("finance-header sticky top-0");
    expect(sidebar).toContain("finance-sidebar fixed inset-y-0");
    expect(bottomNav).toContain("finance-bottom-nav border-t");
    expect(css).toContain(".finance-header {");
    expect(css).toContain(".finance-sidebar {");
    expect(css).toContain(".finance-bottom-nav {");
  });

  it("bridges the two legacy palettes used across financial pages into the same hierarchy", () => {
    expect(css).toContain(".finance-shell .border-slate-200");
    expect(css).toContain(".finance-shell .text-slate-400");
    expect(css).toContain('[class~="border-[#DCE6EF]"]');
    expect(css).toContain('[class~="border-[#D7E3EE]"]');
    expect(css).toContain('[class~="text-[#36536B]"]');
    expect(css).toContain('[class~="text-[#687E93]"]');
  });

  it("strengthens card depth without overriding primary blue or semantic status colors", () => {
    expect(css).toContain("--finance-shadow-card:");
    expect(css).toContain(".finance-main section.shadow-sm");
    expect(css).not.toContain(".finance-shell .text-blue-600 {");
    expect(css).not.toContain(".finance-shell .text-emerald-600 {");
    expect(css).not.toContain(".finance-shell .text-rose-600 {");
  });

  it("keeps pre-auth loading chrome on the same surface system to avoid a washed-out flash", () => {
    expect(skeleton).toContain("finance-shell h-(--app-height)");
    expect(skeleton).toContain("finance-sidebar fixed inset-y-0");
    expect(skeleton).toContain("finance-header flex shrink-0");
    expect(skeleton).toContain("finance-main min-h-0 flex-1");
    expect(skeleton).toContain("finance-bottom-nav fixed inset-x-0");
  });
});
