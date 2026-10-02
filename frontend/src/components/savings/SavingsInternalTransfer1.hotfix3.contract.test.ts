import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const hotfix2 = readFileSync(
  path.resolve(__dirname, "SavingsInternalTransfer1.hotfix2.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-INTERNAL-TRANSFER-1 hotfix v3", () => {
  it("scopes the stale-grid guard to the old account-action assertion only", () => {
    expect(hotfix2).toContain(
      'expect(accounts).toContain("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4");',
    );
    expect(hotfix2).toContain(
      'expect(accounts).toContain("mt-3 grid grid-cols-3 gap-2");',
    );
    expect(hotfix2).not.toContain(
      'expect(mobileTest).not.toContain("grid-cols-3 gap-2");',
    );
    expect(hotfix2).not.toContain(
      'expect(polishTest).not.toContain("grid-cols-3 gap-2");',
    );
  });
});
