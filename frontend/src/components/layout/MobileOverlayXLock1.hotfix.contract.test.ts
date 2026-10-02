import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("MOBILE-OVERLAY-X-LOCK-1 hotfix", () => {
  it("keeps legacy z-index assertions semantic instead of class-order brittle", () => {
    const legacy = read("src/components/layout/MobileViewportOverlayIntegrity.contract.test.ts");
    expect(legacy).toContain('toMatch(/fixed\\s+inset-0[^"]*\\bz-100\\b/)');
    expect(legacy).not.toContain('toContain("fixed inset-0 z-100")');
  });

  it("x-locks AppModal's array-composed vertical scroll panel", () => {
    const source = read("src/components/ui/AppModal.tsx");
    expect(source).toContain(
      "max-h-[92dvh] w-full overflow-x-hidden overflow-y-auto",
    );
  });
});
