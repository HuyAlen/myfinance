import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletReconciliationCenter.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("WALLET-RECONCILIATION-COVERAGE-SSOT-1 center", () => {
  it("derives coverage readiness only from the uncapped coverage dependency", () => {
    expect(source).toContain(
      "const reconciliationDataReady = !isLoading && !error;",
    );
    expect(source).toContain("historyRecords: WalletReconciliationRecord[];");
    expect(source).toContain("isHistoryLoading: boolean;");
    expect(source).toContain("historyError: string | null;");
  });

  it("finds the globally latest coverage receipt without depending on RPC row order", () => {
    expect(source).toContain(
      "const latestRecord = records.reduce<WalletReconciliationRecord | null>(",
    );
    expect(source).not.toContain("const latestRecord = records[0] ?? null;");
  });

  it("keeps recent receipt rendering on the capped history dependency", () => {
    expect(source).toContain("{isHistoryLoading ? (");
    expect(source).toContain("historyError ? (");
    expect(source).toContain("historyRecords.length > 0");
    expect(source).toContain("historyRecords.slice(0, 5).map");
  });
});
