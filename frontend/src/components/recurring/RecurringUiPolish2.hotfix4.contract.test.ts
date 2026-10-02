import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const polish1 = readFileSync(
  path.resolve(__dirname, "RecurringUiPolish1.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const page = readFileSync(
  path.resolve(__dirname, "RecurringMoneyPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("RECURRING-UI-POLISH-2 hotfix v4", () => {
  it("keeps POLISH-1 focus styling assertions semantic instead of order brittle", () => {
    expect(polish1).toContain(
      'expect(source).toContain("focus:border-blue-300");',
    );
    expect(polish1).toContain(
      'expect(source).toContain("focus:ring-4 focus:ring-blue-100");',
    );
    expect(polish1).not.toContain(
      'expect(source).toContain("focus:border-blue-300 focus:ring-4 focus:ring-blue-100");',
    );
  });

  it("keeps the POLISH-2 focus treatment present in the page", () => {
    expect(page).toContain("focus:border-blue-300");
    expect(page).toContain("focus:bg-white");
    expect(page).toContain("focus:ring-4 focus:ring-blue-100");
  });
});
