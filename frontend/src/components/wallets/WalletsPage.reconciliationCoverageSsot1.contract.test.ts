import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const normalized = source.replace(/\s+/g, " ");

describe("WALLET-RECONCILIATION-COVERAGE-SSOT-1 page adoption", () => {
  it("loads uncapped coverage separately from the capped recent-history feed", () => {
    expect(source).toContain("getWalletReconciliationCoverage");
    expect(source).toContain("const reconciliationCoverageTask =");
    expect(source).toContain(
      "const reconciliationHistoryTask = getWalletReconciliations({ limit: 100 })",
    );
    expect(source).toContain("reconciliationCoverageTask,");
    expect(source).toContain("reconciliationHistoryTask,");
  });

  it("fails coverage closed without converting recent history into a fallback", () => {
    expect(source).toContain("setReconciliationCoverageError(");
    expect(source).not.toContain(
      "setReconciliationCoverage(reconciliationHistory)",
    );
  });

  it("passes coverage and history through distinct center props", () => {
    expect(normalized).toContain("records={reconciliationCoverage}");
    expect(normalized).toContain(
      "historyRecords={reconciliationHistory}",
    );
    expect(normalized).toContain(
      "isLoading={isLoadingReconciliationCoverage}",
    );
    expect(normalized).toContain(
      "isHistoryLoading={isLoadingReconciliationHistory}",
    );
  });
});
