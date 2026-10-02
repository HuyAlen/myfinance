import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "actionableFinanceAlerts.recurringDue.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-DUE-ACTION-1 hotfix v4", () => {
  it("supplies the pre-existing currentMonth contract to both alert test cases", () => {
    const matches = source.match(/currentMonth:\s*"2026-10"/g) ?? [];
    expect(matches).toHaveLength(2);
  });
});
