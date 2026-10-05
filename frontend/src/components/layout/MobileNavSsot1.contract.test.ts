import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const layoutRoot = __dirname;
const read = (fileName: string) =>
  readFileSync(path.resolve(layoutRoot, fileName), "utf8").replace(/\r\n/g, "\n");

const bottomNav = read("BottomNav.tsx");
const header = read("Header.tsx");
const ssotPath = path.resolve(layoutRoot, "mobileNavigation.ts");
const ssotExists = existsSync(ssotPath);
const ssot = ssotExists ? read("mobileNavigation.ts") : "";

function region(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, Math.max(0, start) + startMarker.length);
  if (start < 0 || end <= start) return "";
  return source.slice(start, end);
}

function hrefs(source: string) {
  return Array.from(source.matchAll(/href:\s*"([^"]+)"/g), (match) => match[1]);
}

describe("MOBILE-NAV-SSOT-1", () => {
  it("moves all mobile destination metadata into one shared registry", () => {
    expect(ssotExists).toBe(true);
    expect(ssot).toContain("export const MOBILE_PRIMARY_NAV_ITEMS = [");
    expect(ssot).toContain("export const MOBILE_MORE_GROUPS = [");
    expect(ssot).toContain("export const MOBILE_ACCOUNT_NAV_ITEMS = [");
    expect(ssot).toContain("export const MOBILE_MORE_ROUTES = MOBILE_MORE_GROUPS.flatMap");
    expect(ssot).toContain("export const MOBILE_NAV_ROUTE_HREFS = [");
  });

  it("keeps each mobile destination in exactly one placement with the agreed order", () => {
    const allHrefs = hrefs(ssot);
    expect(allHrefs).toEqual([
      "/",
      "/transactions",
      "/budgets",
      "/savings",
      "/wallets",
      "/goals",
      "/recurring",
      "/categories",
      "/reports",
      "/investments",
      "/debts",
      "/ai-insights",
      "/activity",
      "/settings",
      "/help",
    ]);
    expect(new Set(allHrefs).size).toBe(allHrefs.length);
  });

  it("keeps BottomNav as a pure consumer of primary and More placement", () => {
    expect(bottomNav).toContain(
      'import {\n  MOBILE_MORE_GROUPS,\n  MOBILE_PRIMARY_NAV_ITEMS,\n  isMobileMorePath,\n  isMobileNavigationPathActive,\n} from "./mobileNavigation";',
    );
    expect(bottomNav).toContain("MOBILE_PRIMARY_NAV_ITEMS.map");
    expect(bottomNav).toContain("MOBILE_MORE_GROUPS.map");
    expect(bottomNav).toContain("isMobileMorePath(pathname)");
    expect(bottomNav).toContain("isMobileNavigationPathActive(pathname, href)");
    expect(bottomNav).not.toContain("const PRIMARY_TABS = [");
    expect(bottomNav).not.toContain("const MORE_GROUPS = [");
    expect(bottomNav).not.toContain("const MORE_ROUTES =");
  });

  it("keeps Header mobile account navigation as a pure consumer of the same registry", () => {
    const mobileAccount = region(
      header,
      'data-mobile-account-navigation="true"',
      'data-desktop-account-navigation="true"',
    );

    expect(header).toContain(
      'import {\n  MOBILE_ACCOUNT_NAV_ITEMS,\n  isMobileNavigationPathActive,\n} from "./mobileNavigation";',
    );
    expect(mobileAccount).toContain("MOBILE_ACCOUNT_NAV_ITEMS.map((item) => {");
    expect(mobileAccount).toMatch(
      /isMobileNavigationPathActive\s*\(\s*pathname,\s*item\.href,\s*\)/,
    );
    for (const href of ["/ai-insights", "/activity", "/settings", "/help"]) {
      expect(mobileAccount).not.toContain(`href="${href}"`);
    }
  });

  it("owns active-route semantics beside the route registry instead of duplicating them in consumers", () => {
    expect(ssot).toContain("export function isMobileNavigationPathActive");
    expect(ssot).toContain('if (href === "/") return pathname === "/";');
    expect(ssot).toContain("return pathname.startsWith(href);");
    expect(ssot).toContain("export function isMobileMorePath(pathname: string)");
    expect(ssot).toContain("return MOBILE_MORE_ROUTES.some((href) =>");
    expect(bottomNav).not.toContain("function isActivePath");
    expect(bottomNav).not.toContain("function isMorePath");
  });
});