import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const smartDefaults = readFileSync(
  path.resolve(__dirname, "../../lib/transactions/transactionSmartDefaults.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const quickRepeat = readFileSync(
  path.resolve(__dirname, "../../lib/transactions/transactionQuickRepeat.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

function region(startMarker: string, endMarker: string) {
  const start = page.indexOf(startMarker);
  const end = page.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return page.slice(start, end);
}

describe("TRANSACTION-CATEGORY-ONLY-SUGGESTIONS-1", () => {
  it("opens every normal new transaction with an empty amount", () => {
    const emptyForm = region("function createEmptyForm(): FormState {", "function formatDrillDownRangeLabel(");
    const createForm = region("function openCreateFormWithMode(", "function openCreateForm()");
    expect(emptyForm).toContain('amount: ""');
    expect(createForm).toContain("...createEmptyForm()");
    expect(createForm).not.toContain("t.amount");
  });

  it("never reuses past money for Quick Repeat or explicit duplication", () => {
    const duplicate = region("function openDuplicateForm(t: Transaction) {", "function handleTypeChange(");
    const repeat = region("{quickRepeatCandidates.map((candidate) => {", "<LiquidityHeroCard");
    expect(duplicate).toContain('amount: ""');
    expect(duplicate).not.toContain("t.amount");
    expect(repeat).not.toContain("transaction.amount");
    expect(quickRepeat).not.toContain("transaction.amount");
  });

  it("keeps edit amounts intact: no destructive changes to existing transactions", () => {
    const edit = region("function openEditForm(t: Transaction) {", "function openDuplicateForm(");
    expect(edit).toContain("amount: String(t.amount)");
    expect(page.split("addTransaction(").length - 1).toBe(1);
    expect(page.split("updateTransaction(").length - 1).toBe(1);
  });

  it("limits historical smart defaults to category both in data and UI", () => {
    const apply = region("function applyActiveSmartDefaultsSuggestion() {", "const activeEntryConfidenceWarnings");
    const smartPanel = region("{activeSmartDefaultsSuggestion ? (", "{activeRuleSuggestion ? (");
    expect(apply).toContain("categoryId: activeSmartDefaultsSuggestion.categoryId");
    expect(apply).not.toContain("amount:");
    expect(apply).not.toContain("walletId:");
    expect(smartPanel).not.toContain("formatVND(");
    expect(smartPanel).not.toContain("activeSmartDefaultsSuggestion.walletId");
    expect(smartDefaults).not.toContain("transaction.amount");
    expect(smartDefaults).not.toContain("transaction.walletId");
  });
});
