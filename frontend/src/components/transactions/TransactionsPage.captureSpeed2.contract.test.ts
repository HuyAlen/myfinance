import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const normalized = source.replace(/\s+/g, " ");

describe("TRANSACTION-CAPTURE-SPEED-2 — P0", () => {
  it("reuses one local preference SSOT instead of adding finance queries", () => {
    expect(source).toContain(
      'from "@/src/lib/transactions/transactionCapturePreferences";',
    );
    expect(source).toContain("readTransactionCapturePreferences()");
    expect(source).toContain("resolveTransactionCaptureDefaults({");
    expect(source).toContain("rememberTransactionCaptureSuccess(");
    expect(source).toContain("persistTransactionCapturePreferences(");

    expect(source.split("getTransactionsInRange(").length - 1).toBe(1);
    expect(source.split("getCategories(").length - 1).toBe(1);
    expect(source.split("getWallets(").length - 1).toBe(1);
    expect(source.split("addTransaction(").length - 1).toBe(1);
    expect(source.split("updateTransaction(").length - 1).toBe(1);
  });

  it("puts the amount control before the type selector without auto-focusing the mobile keyboard", () => {
    const amountIndex = source.indexOf("{/* Amount — hero input */}");
    const typeIndex = source.indexOf("{/* Type selector — premium segmented control */}");
    expect(amountIndex).toBeGreaterThan(-1);
    expect(typeIndex).toBeGreaterThan(amountIndex);
    expect(source).not.toContain("autoFocus");
  });

  it("opens canonical create forms with remembered valid wallet/category/transfer defaults", () => {
    const start = source.indexOf("function openCreateFormWithMode(");
    const end = source.indexOf("function openCreateForm()", start);
    const region = source.slice(start, end);

    expect(region).toContain("resolveCreateCaptureDefaults(defaultMode)");
    expect(region).toContain("categoryId: defaults.categoryId");
    expect(region).toContain("walletId: defaults.walletId");
    expect(region).toContain("transferToWalletId: defaults.transferToWalletId");
    expect(region).toContain("beginNewFormSession();");
    expect(region).toContain("setIsFormOpen(true);");
  });

  it("offers up to three recent category shortcuts without creating a second category selector", () => {
    expect(source).toContain(
      'data-transaction-capture-speed="recent-categories"',
    );
    expect(source).toContain("getRecentTransactionCaptureCategoryIds(");
    expect(source).toContain("Danh mục gần đây");
    expect(source).toContain("aria-pressed={form.categoryId === category.id}");
    expect(source.split('label="Danh mục"').length - 1).toBe(1);
  });

  it("remembers preferences only after a canonical create actually succeeds", () => {
    const submitStart = source.indexOf(
      "async function handleSubmit(event: React.FormEvent) {",
    );
    const reloadIndex = source.indexOf("await runReload();", submitStart);
    const rememberIndex = source.indexOf(
      "rememberTransactionCaptureSuccess(",
      reloadIndex,
    );
    const closeIndex = source.indexOf("setIsFormOpen(false);", rememberIndex);

    expect(reloadIndex).toBeGreaterThan(submitStart);
    expect(rememberIndex).toBeGreaterThan(reloadIndex);
    expect(closeIndex).toBeGreaterThan(rememberIndex);
    expect(normalized).toContain(
      "if (!form.id) { const nextCapturePreferences = rememberTransactionCaptureSuccess(",
    );
  });

  it("makes repeated transfers fast with a remembered distinct pair and one-tap direction swap", () => {
    expect(source).toContain(
      'data-transaction-capture-speed="swap-transfer-wallets"',
    );
    expect(source).toContain("p.transferToWalletId === v ? \"\" : p.transferToWalletId");
    expect(normalized).toContain(
      "walletId: p.transferToWalletId, transferToWalletId: p.walletId",
    );
    expect(source).toContain("Đổi chiều ví");
  });

  it("duplicates into a NEW canonical form for today without copying recurrence metadata", () => {
    const start = source.indexOf("function openDuplicateForm(t: Transaction) {");
    const end = source.indexOf("function handleTypeChange(", start);
    const region = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(region).toContain("...createEmptyForm()");
    expect(region).not.toContain("id: t.id");
    expect(region).toContain("amount: String(t.amount)");
    expect(region).toContain("date: getLocalDateInputValue()");
    expect(region).toContain("isRecurring: false");
    expect(region).toContain('nextRunDate: ""');
    expect(region).toContain("beginNewFormSession();");
    expect(region).toContain("setIsFormOpen(true);");
  });

  it("does not let Savings-managed ledger rows escape their canonical domain through duplicate", () => {
    const start = source.indexOf("function openDuplicateForm(t: Transaction) {");
    const end = source.indexOf("function handleTypeChange(", start);
    const region = source.slice(start, end);

    expect(region).toContain("isSavingsManagedTransaction(t)");
    expect(region).toContain("không thể nhân bản từ Giao dịch");
    expect(region).toContain("return;");
  });

  it("exposes duplicate from the iPhone swipe drawer and Timeline without widening the desktop table contract", () => {
    expect(source.split('aria-label="Nhân bản giao dịch"').length - 1).toBe(2);
    expect(source).toContain("openDuplicateForm(t);");
    expect(source).toContain("-translate-x-[10.5rem] lg:translate-x-0");
    expect(source).toContain(
      "lg:grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px]",
    );
  });

  it("keeps the existing Quick Action deep link on the same create/save business path", () => {
    expect(source).toContain("useQuickActionCreateIntent(openQuickActionCreateForm);");
    expect(source).toContain(
      'openCreateFormWithMode(mode === "transfer" ? "transfer" : "expense")',
    );
    expect(source).not.toContain("quickAddTransaction");
    expect(source).not.toContain("duplicateTransactionMutation");
  });
});