import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "BottomNav.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("MOBILE-BOTTOM-NAV-SAVINGS-1", () => {
  it("uses Tiết kiệm as the fourth primary mobile tab instead of Mục tiêu", () => {
    expect(source).toContain(
      '{ label: "Tiết kiệm", icon: PiggyBank, href: "/savings" }',
    );
    expect(source).not.toContain(
      '{ label: "Mục tiêu", icon: Target, href: "/goals" }',
    );
  });

  it("keeps exactly five primary mobile slots and the existing mobile-only navigation", () => {
    expect(source).toContain("grid-cols-5");
    expect(source).toContain("fixed inset-x-0 bottom-0 z-50 lg:hidden");
  });

  it("moves Mục tiêu into the Thêm active-route family while Tiết kiệm stays a direct tab", () => {
    const moreStart = source.indexOf('if (href === "/categories")');
    const moreEnd = source.indexOf("return pathname.startsWith(href);", moreStart);
    const moreRegion = source.slice(moreStart, moreEnd);

    expect(moreStart).toBeGreaterThan(-1);
    expect(moreEnd).toBeGreaterThan(moreStart);
    expect(moreRegion).toContain('"/goals"');
    expect(moreRegion).not.toContain('"/savings"');
  });
});
