import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "BottomNav.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function region(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThan(-1);
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MOBILE-BOTTOM-NAV-SAVINGS-1", () => {
  it("uses Tiết kiệm as the fourth primary mobile tab instead of Mục tiêu", () => {
    const primary = region("const PRIMARY_TABS = [", "const MORE_GROUPS = [");

    expect(primary).toContain(
      '{ label: "Tiết kiệm", icon: PiggyBank, href: "/savings" }',
    );
    expect(primary).not.toContain(
      '{ label: "Mục tiêu", icon: Target, href: "/goals" }',
    );
  });

  it("keeps exactly five primary mobile slots and the existing mobile-only navigation", () => {
    expect(source).toContain("grid-cols-5");
    expect(source).toContain("fixed inset-x-0 bottom-0 z-50 lg:hidden");
  });

  it("keeps Tiết kiệm primary while Mục tiêu remains reachable from Thêm", () => {
    const primary = region("const PRIMARY_TABS = [", "const MORE_GROUPS = [");
    const more = region("const MORE_GROUPS = [", "const MORE_ROUTES =");

    expect(primary).toContain(
      '{ label: "Tiết kiệm", icon: PiggyBank, href: "/savings" }',
    );
    expect(primary).not.toContain('href: "/goals"');

    expect(more).toContain('label: "Mục tiêu"');
    expect(more).toContain('href: "/goals"');
    expect(more).not.toContain('href: "/savings"');
  });
});
