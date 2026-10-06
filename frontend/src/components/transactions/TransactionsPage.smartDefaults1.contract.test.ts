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

describe("TRANSACTION-SMART-DEFAULTS-1 — P0", () => {
  it("derives advisory defaults from the already-loaded ledger without adding finance queries", () => {
    expect(page).toContain(
      'import { buildTransactionSmartDefaultsSuggestion } from "@/src/lib/transactions/transactionSmartDefaults";',
    );
    expect(page).toContain("buildTransactionSmartDefaultsSuggestion({");
    expect(page).toContain("transactions,");
    expect(page.split("getTransactionsInRange(").length - 1).toBe(1);
    expect(page.split("getCategories(").length - 1).toBe(1);
    expect(page.split("getWallets(").length - 1).toBe(1);
  });

  it("keeps smart defaults create-only for income/expense and waits for typed note context", () => {
    const start = page.indexOf("const activeSmartDefaultsSuggestion = useMemo(() => {");
    const end = page.indexOf("function applyActiveSmartDefaultsSuggestion()", start);
    const region = page.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(region).toContain('form.id || form.formMode === "transfer"');
    expect(region).toContain("if (!form.note.trim()) return null;");
    expect(region).toContain("mode: form.formMode");
  });

  it("gives explicit user rules priority over learned history", () => {
    expect(normalized).toContain(
      'if (form.id || form.formMode === "transfer" || activeRuleSuggestion) { return null; }',
    );
    expect(page).toContain('data-transaction-rule-suggestion="true"');
    expect(page).toContain('data-transaction-smart-defaults="true"');
  });

  it("never auto-applies: history only changes the form after the user taps Dùng gợi ý", () => {
    expect(page).toContain("function applyActiveSmartDefaultsSuggestion() {");
    expect(page).toContain("onClick={applyActiveSmartDefaultsSuggestion}");
    expect(page).toContain("Dùng gợi ý");
    expect(page).not.toContain("useEffect(() => applyActiveSmartDefaultsSuggestion");
    expect(page).not.toContain("autoApplySmartDefaults");
  });

  it("only applies amount/category/wallet and leaves date, note, recurrence and save flow untouched", () => {
    const start = page.indexOf("function applyActiveSmartDefaultsSuggestion() {");
    const end = page.indexOf("const quickRepeatCandidates", start);
    const region = page.slice(start, end);

    expect(region).toContain("amount: String(activeSmartDefaultsSuggestion.amount)");
    expect(region).toContain("categoryId: activeSmartDefaultsSuggestion.categoryId");
    expect(region).toContain("walletId: activeSmartDefaultsSuggestion.walletId");
    expect(region).not.toContain("date:");
    expect(region).not.toContain("note:");
    expect(region).not.toContain("isRecurring:");
    expect(region).not.toContain("nextRunDate:");
    expect(region).not.toContain("addTransaction(");
  });

  it("uses current valid category/wallet ids and excludes transfer/recurring/Savings rows in the pure SSOT", () => {
    expect(page).toContain(
      "validCategoryIds: filteredCategories.map((category) => category.id)",
    );
    expect(page).toContain("validWalletIds: wallets.map((wallet) => wallet.id)");
    expect(smartDefaults).toContain("isInternalTransferTransaction(transaction)");
    expect(smartDefaults).toContain("isSavingsManagedTransaction(transaction)");
    expect(smartDefaults).toContain("hasRecurringMetadata(transaction)");
  });

  it("does not persist learned transaction content to browser storage", () => {
    expect(smartDefaults).not.toContain("localStorage");
    expect(smartDefaults).not.toContain("sessionStorage");
    expect(smartDefaults).not.toContain("persistTransactionCapturePreferences");
    expect(smartDefaults).not.toContain("JSON.stringify");
  });

  it("keeps one canonical mutation path and preserves Quick Repeat + capture-speed behavior", () => {
    expect(page.split("addTransaction(").length - 1).toBe(1);
    expect(page.split("updateTransaction(").length - 1).toBe(1);
    expect(page).toContain("buildTransactionQuickRepeatCandidates(transactions, 3)");
    expect(page).toContain("rememberTransactionCaptureSuccess(");
    expect(page).toContain("openDuplicateForm(transaction)");
    expect(page).not.toContain("smartDefaultsTransactionMutation");
  });
});