import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "./SettingsPage.tsx"),
  "utf8",
);

describe("SETTINGS-DOMAIN-CONSISTENCY-1 destructive-action copy", () => {
  it("explicitly covers Budgets, Investments, Savings and Forex for Reset and Clear", () => {
    const resetStart = source.indexOf("async function handleResetDemo()");
    const clearStart = source.indexOf("async function handleClearAll()");
    const exportStart = source.indexOf("async function handleExportJson()");

    const resetRegion = source.slice(resetStart, clearStart);
    const clearRegion = source.slice(clearStart, exportStart);

    for (const label of ["Ngân sách", "Đầu tư", "Tiết kiệm", "Forex"]) {
      expect(resetRegion).toContain(label);
      expect(clearRegion).toContain(label);
    }

    expect(resetRegion).toContain("resetFinanceDemoData()");
    expect(clearRegion).toContain("clearAllUserData()");
    expect(clearRegion).toContain("lịch sử Net Worth");
  });
});
