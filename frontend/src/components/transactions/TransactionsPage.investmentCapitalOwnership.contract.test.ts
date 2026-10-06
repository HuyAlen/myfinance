import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("INVESTMENT-CAPITAL-FLOW-SSOT-1 generic Transactions ownership", () => {
  it("imports the canonical Investment-managed classifier", () => {
    expect(source).toContain("isInvestmentManagedTransaction");
  });

  it("preflights bulk delete before any independently committed delete", () => {
    const start = source.indexOf("function handleBulkDelete() {");
    const end = source.indexOf("setPendingAction({", start);
    const preflight = source.slice(start, end);

    expect(preflight).toContain("isSavingsManagedTransaction(transaction)");
    expect(preflight).toContain("isInvestmentManagedTransaction(transaction)");
    expect(preflight).toContain("systemManagedCount > 0");
  });

  it("blocks generic edit and duplicate for Investment-owned capital rows", () => {
    const editStart = source.indexOf("function openEditForm(t: Transaction) {");
    const duplicateStart = source.indexOf("function openDuplicateForm(t: Transaction) {");
    const submitStart = source.indexOf("function handleTypeChange(", duplicateStart);

    expect(source.slice(editStart, duplicateStart)).toContain(
      "isInvestmentManagedTransaction(t)",
    );
    expect(source.slice(duplicateStart, submitStart)).toContain(
      "isInvestmentManagedTransaction(t)",
    );
  });

  it("blocks generic single delete before transfer wallet reversal can run", () => {
    const start = source.indexOf("function handleDelete(id: string) {");
    const end = source.indexOf("setPendingAction({", start);
    const guard = source.slice(start, end);

    expect(guard).toContain("isInvestmentManagedTransaction(item)");
    expect(guard).toContain("return;");
  });

  it("blocks review mutations for Investment-owned capital rows", () => {
    expect(source).toContain(
      "isInvestmentManagedTransaction(transaction)",
    );
    expect(source).toContain(
      "isInvestmentManagedTransaction(activeReviewTransaction)",
    );
  });
});