import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "transactionCsvImport.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const modal = readFileSync(
  path.resolve(__dirname, "../../components/transactions/TransactionCsvImportModal.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("TRANSACTION-RULES-1 CSV integration", () => {
  it("evaluates rules in preview and recomputes fingerprints before import", () => {
    expect(source).toContain("buildTransactionCsvImportPreviewWithRules");
    expect(source).toContain("evaluateTransactionRules(input.rules");
    expect(source).toContain("buildTransactionCsvFingerprint(nextDraft)");
    expect(source).toContain("appliedRuleName");
  });

  it("keeps rule changes visible before the canonical addTransaction mutation", () => {
    expect(modal).toContain("buildTransactionCsvImportPreviewWithRules");
    expect(modal).toContain("ruleAppliedCount");
    expect(modal).toContain("Quy tắc:");
    expect(modal).toContain("addTransaction(row.transaction)");
  });
});
