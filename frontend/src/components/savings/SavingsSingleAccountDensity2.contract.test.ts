import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-SINGLE-ACCOUNT-DENSITY-2", () => {
  it("centers a single account instead of stretching it across the workspace", () => {
    expect(source).toContain('"md:grid-cols-1 md:place-items-center"');
    expect(source).toContain(
      'filteredSavings.length === 1 ? "w-full md:max-w-3xl" : ""',
    );
  });

  it("preserves two-account and many-account responsive layouts", () => {
    expect(source).toContain('"md:grid-cols-2 xl:grid-cols-2"');
    expect(source).toContain('"md:grid-cols-2 xl:grid-cols-3"');
  });

  it("keeps four money actions and compact spacing", () => {
    expect(source).toContain(
      'className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5"',
    );
    expect(source).toContain("openInternalTransfer(item)");
    expect(source).toContain("openHistoryModal(item)");
  });
});
