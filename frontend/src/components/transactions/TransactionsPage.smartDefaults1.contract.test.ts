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
const normalized = page.replace(/\s+/g, " ");

describe("TRANSACTION-SMART-DEFAULTS-1 category-only regression", () => {
  it("uses only the already-loaded ledger and creates no extra finance queries", () => {
    expect(page).toContain(
      'import { buildTransactionSmartDefaultsSuggestion } from "@/src/lib/transactions/transactionSmartDefaults";',
    );
    expect(page).toContain("buildTransactionSmartDefaultsSuggestion({");
    expect(page).toContain("transactions,");
    expect(page.split("getTransactionsInRange(").length - 1).toBe(1);
    expect(page.split("getCategories(").length - 1).toBe(1);
    expect(page.split("getWallets(").length - 1).toBe(1);
  });

  it("waits for a note, remains create-only, and excludes transfer/review suggestion", () => {
    const start = page.indexOf("const activeSmartDefaultsSuggestion = useMemo(() => {");
    const end = page.indexOf("function applyActiveSmartDefaultsSuggestion()", start);
    const region = page.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(region).toContain('form.id || form.formMode === "transfer"');
    expect(region).toContain("if (!form.note.trim()) return null;");
    expect(region).toContain("mode: form.formMode");
    expect(region).not.toContain("form.amount");
    expect(region).not.toContain("form.walletId");
  });

  it("gives explicit user rules priority over learned history", () => {
    expect(normalized).toContain(
      'if (form.id || form.formMode === "transfer" || activeRuleSuggestion) { return null; }',
    );
    expect(page).toContain('data-transaction-rule-suggestion="true"');
    expect(page).toContain('data-transaction-smart-defaults="true"');
  });

  it("requires a tap, not automatic application", () => {
    expect(page).toContain("function applyActiveSmartDefaultsSuggestion() {");
    expect(page).toContain("onClick={applyActiveSmartDefaultsSuggestion}");
    expect(page).not.toContain("useEffect(() => applyActiveSmartDefaultsSuggestion");
    expect(page).not.toContain("autoApplySmartDefaults");
  });

  it("applies only category without overwriting amount, wallet, date, note or recurrence", () => {
    const start = page.indexOf("function applyActiveSmartDefaultsSuggestion() {");
    const end = page.indexOf("const activeEntryConfidenceWarnings", start);
    const region = page.slice(start, end);
    expect(region).toContain("categoryId: activeSmartDefaultsSuggestion.categoryId");
    expect(region).not.toContain("amount:");
    expect(region).not.toContain("walletId:");
    expect(region).not.toContain("date:");
    expect(region).not.toContain("note:");
    expect(region).not.toContain("isRecurring:");
    expect(region).not.toContain("addTransaction(");
  });

  it("filters valid categories, recurring, transfer and Savings-managed rows", () => {
    expect(page).toContain(
      "validCategoryIds: filteredCategories.map((category) => category.id)",
    );
    expect(smartDefaults).toContain("isInternalTransferTransaction(transaction)");
    expect(smartDefaults).toContain("isSavingsManagedTransaction(transaction)");
    expect(smartDefaults).toContain("hasRecurringMetadata(transaction)");
    expect(smartDefaults).not.toContain("transaction.amount");
    expect(smartDefaults).not.toContain("transaction.walletId");
  });

  it("never persists learned transaction content", () => {
    expect(smartDefaults).not.toContain("localStorage");
    expect(smartDefaults).not.toContain("sessionStorage");
    expect(smartDefaults).not.toContain("persistTransactionCapturePreferences");
    expect(smartDefaults).not.toContain("JSON.stringify");
  });

  it("preserves one canonical mutation path and quick repeat plumbing", () => {
    expect(page.split("addTransaction(").length - 1).toBe(1);
    expect(page.split("updateTransaction(").length - 1).toBe(1);
    expect(page).toContain("buildTransactionQuickRepeatCandidates(transactions, 3)");
    expect(page).toContain("rememberTransactionCaptureSuccess(");
    expect(page).toContain("openDuplicateForm(transaction)");
    expect(page).not.toContain("smartDefaultsTransactionMutation");
  });
});
