import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) =>
  readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const shell = read("src/components/layout/AppShell.tsx");
const css = read("app/globals.css");
const header = read("src/components/layout/Header.tsx");

describe("FINANCE-CONTENT-SCROLL-OWNER-2", () => {
  it("binds the authenticated shell to one viewport", () => {
    expect(shell).toContain(
      "finance-shell h-(--app-height) overflow-hidden",
    );
    expect(shell).toContain(
      'className="flex h-full min-w-0 flex-col lg:pl-72"',
    );
  });

  it("makes finance-main the single authenticated vertical scroll owner", () => {
    expect(shell).toContain(
      "finance-main min-h-0 flex-1 overflow-x-clip overflow-y-auto",
    );
    expect(shell).not.toContain(
      "finance-main min-w-0 flex-1 overflow-x-clip",
    );
  });

  it("locks html/body only while AppShell is mounted", () => {
    expect(shell).toContain(
      'root.classList.add("finance-app-shell-active")',
    );
    expect(shell).toContain(
      'body.classList.add("finance-app-shell-active")',
    );
    expect(shell).toContain(
      'root.classList.remove("finance-app-shell-active")',
    );
    expect(shell).toContain(
      'body.classList.remove("finance-app-shell-active")',
    );
    expect(css).toMatch(
      /html\.finance-app-shell-active,\s*body\.finance-app-shell-active\s*\{[\s\S]*?overflow:\s*hidden;/,
    );
  });

  it("keeps normal public-route body rules free of a vertical lock", () => {
    const body = css.match(/(?<![,A-Za-z0-9_-])body\s*\{[\s\S]*?\}/)?.[0] ?? "";
    expect(body).toContain("overflow-x: clip;");
    expect(body).not.toContain("overflow-y: hidden;");
    expect(body).not.toContain("overflow-y: auto;");
  });

  it("keeps the Header outside finance-main scrolling", () => {
    expect(header).toContain("finance-header sticky top-0 z-30");
    expect(shell.indexOf("<Header")).toBeLessThan(shell.indexOf("<main"));
  });

  it("prevents Dashboard root from becoming another vertical scroller", () => {
    const dashboard = read("src/components/dashboard/DashboardPage.tsx");
    const start = dashboard.indexOf('data-dashboard-depth="true"');
    const region = dashboard.slice(start, start + 350);
    expect(start).toBeGreaterThan(-1);
    expect(region).toContain("overflow-x-clip");
    expect(region).not.toContain("overflow-y-auto");
    expect(region).not.toContain("overflow-y-scroll");
  });
});
