import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("MOBILE-OVERLAY-X-LOCK-1 contract hotfix v2", () => {
  it("keeps Activity sheet z-index checks class-order agnostic", () => {
    const source = read("src/lib/auditUiIphone.contract.test.ts");
    expect(source).toContain("toMatch(/fixed\\s+inset-0");
    expect(source).not.toContain('toContain("fixed inset-0 z-[80]")');
  });

  it("keeps Categories drawer coverage while requiring the x-lock", () => {
    const source = read(
      "src/components/categories/CategoriesPage.mobileFirstViewport.test.ts",
    );
    expect(source).toContain("fixed inset-0 overflow-x-hidden z-90");
    expect(source).not.toContain(
      'fixed inset-0 z-90 flex items-end bg-slate-900/35 sm:hidden',
    );
  });
});
