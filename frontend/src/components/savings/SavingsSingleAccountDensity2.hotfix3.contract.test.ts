import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const density1 = readFileSync(
  path.resolve(__dirname, "SavingsSingleAccountDensity1.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const page = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-SINGLE-ACCOUNT-DENSITY-2 hotfix v3", () => {
  it("removes the stale full-width single-account target from the older contract", () => {
    expect(density1).toContain('"md:grid-cols-1 md:place-items-center"');
    expect(density1).not.toContain('"md:grid-cols-1 xl:grid-cols-1"');
  });

  it("keeps the runtime single-account card centered and capped", () => {
    expect(page).toContain('"md:grid-cols-1 md:place-items-center"');
    expect(page).toContain(
      'filteredSavings.length === 1 ? "w-full md:max-w-3xl" : ""',
    );
  });
});
