import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "./SettingsPage.tsx"),
  "utf8",
);

describe("FINANCE-DATA-3 Settings destructive-action copy", () => {
  it("explicitly tells the user that Reset and Clear include Savings and Forex", () => {
    expect(source).toContain("bao gồm Tiết kiệm và Forex");
    expect(source).toContain("resetFinanceDemoData()");
    expect(source).toContain("clearAllUserData()");
  });
});
