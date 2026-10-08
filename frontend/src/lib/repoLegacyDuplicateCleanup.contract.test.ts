import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(frontendRoot, "..");

const legacyRootSrc = path.join(repoRoot, "src");
const canonicalSavingsPage = path.join(
  frontendRoot,
  "src/components/savings/SavingsPage.tsx",
);
const canonicalSavingsViewportTest = path.join(
  frontendRoot,
  "src/components/savings/SavingsPage.mobileSingleViewport.test.ts",
);
const savingsRoute = path.join(frontendRoot, "app/savings/page.tsx");

describe("REPO-LEGACY-DUPLICATE-CLEANUP-1 — P2", () => {
  it("keeps application source under frontend/src instead of a parallel repository-root src tree", () => {
    expect(existsSync(legacyRootSrc)).toBe(false);
  });

  it("preserves the canonical Savings implementation and viewport regression contract", () => {
    expect(existsSync(canonicalSavingsPage)).toBe(true);
    expect(existsSync(canonicalSavingsViewportTest)).toBe(true);
  });

  it("keeps the /savings route wired to the canonical frontend SavingsPage", () => {
    const routeSource = readFileSync(savingsRoute, "utf8").replace(
      /\r\n/g,
      "\n",
    );

    expect(routeSource).toContain(
      'import SavingsPage from "@/src/components/savings/SavingsPage"',
    );
    expect(routeSource).toContain("<SavingsPage />");
  });

  it("does not reintroduce the accidental September 2026 root Savings duplicates", () => {
    expect(
      existsSync(path.join(repoRoot, "src/savings/SavingsPage.tsx")),
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          repoRoot,
          "src/savings/SavingsPage.mobileSingleViewport.test.ts",
        ),
      ),
    ).toBe(false);
  });
});