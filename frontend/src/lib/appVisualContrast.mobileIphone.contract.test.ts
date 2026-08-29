import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8");

const css = read("app/globals.css");
const sidebar = read("src/components/layout/Sidebar.tsx");
const bottomNav = read("src/components/layout/BottomNav.tsx");
const header = read("src/components/layout/Header.tsx");

describe("APP-VISUAL-CONTRAST-1.1 iPhone readability and touch contract", () => {
  it("keeps the desktop palette but uses stronger small-text tokens on iPhone", () => {
    expect(css).toContain("--finance-muted: #6f8597");
    expect(css).toContain("--finance-primary-text: #2563eb");
    expect(css).toContain("APP-VISUAL-CONTRAST-1.1: iPhone readability + surface balance");
    expect(css).toContain("--finance-muted: #586f82");
  });

  it("reduces shell/card chrome shadows specifically on iPhone", () => {
    expect(css).toContain("--finance-shadow-soft: 0 3px 10px rgba(35, 67, 92, 0.065)");
    expect(css).toContain("--finance-shadow-card: 0 7px 18px rgba(35, 67, 92, 0.085)");
    expect(css).toContain("box-shadow: 0 -6px 18px rgba(35, 67, 92, 0.085)");
    expect(css).toContain("box-shadow: 0 3px 10px rgba(35, 67, 92, 0.055)");
  });

  it("gives the mobile sidebar close control a 44px target", () => {
    expect(sidebar).toContain("flex size-11 items-center justify-center");
    expect(sidebar).toContain('aria-label="Đóng menu"');
    expect(sidebar).toContain("focus-visible:ring-2");
  });

  it("keeps sidebar rows touch-safe and tiny section labels readable", () => {
    expect(sidebar).toContain("flex min-h-11 w-full items-center");
    expect(sidebar).toContain("text-[10px] font-black uppercase");
  });

  it("makes bottom navigation labels more legible without increasing its safe-area footprint", () => {
    expect(bottomNav).toContain("text-[11px] leading-tight");
    expect(bottomNav).toContain("font-bold text-[var(--finance-primary-text)]");
    expect(bottomNav).toContain("font-semibold text-[var(--finance-muted)]");
    expect(bottomNav).toContain("pb-[max(env(safe-area-inset-bottom),0.5rem)]");
  });

  it("preserves the existing 44px mobile header controls", () => {
    expect(header).toContain("min-h-11 min-w-11");
    expect(header).toContain("relative flex h-11 w-11 items-center justify-center");
    expect(header).toContain("flex h-11 w-11 shrink-0 items-center justify-center");
  });
});
