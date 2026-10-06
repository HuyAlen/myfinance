import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const normalized = source.replace(/\s+/g, " ");

describe("TRANSACTION-QUICK-REPEAT-1 — P0", () => {
  it("derives repeat suggestions from the already-loaded transaction ledger with no extra finance queries", () => {
    expect(source).toContain(
      'import { buildTransactionQuickRepeatCandidates } from "@/src/lib/transactions/transactionQuickRepeat";',
    );
    expect(source).toContain(
      "() => buildTransactionQuickRepeatCandidates(transactions, 3)",
    );
    expect(source.split("getTransactionsInRange(").length - 1).toBe(1);
    expect(source.split("getWallets(").length - 1).toBe(1);
    expect(source.split("getCategories(").length - 1).toBe(1);
  });

  it("keeps repeat on the existing canonical create/save path instead of adding a direct mutation", () => {
    expect(source).toContain(
      "onClick={() => openDuplicateForm(transaction)}",
    );
    expect(source.split("addTransaction(").length - 1).toBe(1);
    expect(source.split("updateTransaction(").length - 1).toBe(1);
    expect(source).not.toContain("quickRepeatTransactionMutation");
    expect(source).not.toContain("repeatTransactionMutation");
  });

  it("surfaces at most three repeat suggestions in a compact horizontal rail", () => {
    expect(source).toContain('data-transaction-quick-repeat="true"');
    expect(source).toContain("quickRepeatCandidates.length > 0");
    expect(source).toContain("Ghi lại nhanh");
    expect(source).toContain("Các giao dịch xuất hiện ít nhất 2 lần trong kỳ này.");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("w-60 shrink-0");
  });

  it("does not show stale or context-noisy suggestions during loading, read failure or review mode", () => {
    expect(normalized).toContain(
      "!reviewMode && !isLoadingTransactions && !transactionsLoadError && quickRepeatCandidates.length > 0",
    );
  });

  it("gives every repeat suggestion a mobile-sized target and an explicit Vietnamese accessible name", () => {
    expect(source).toContain("min-h-16 w-60 shrink-0");
    expect(source).toContain(
      "aria-label={`Ghi lại ${note} hôm nay`}",
    );
    expect(source).toContain("Ghi hôm nay");
    expect(source).toContain("focus-visible:ring-2");
  });

  it("reuses duplicate-form safety: today date, no id reuse, no recurring metadata", () => {
    const start = source.indexOf("function openDuplicateForm(t: Transaction) {");
    const end = source.indexOf("function handleTypeChange(", start);
    const region = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(region).toContain("...createEmptyForm()");
    expect(region).not.toContain("id: t.id");
    expect(region).toContain("date: getLocalDateInputValue()");
    expect(region).toContain("isRecurring: false");
    expect(region).toContain('nextRunDate: ""');
  });

  it("keeps Savings-managed rows behind their canonical Savings boundary", () => {
    const start = source.indexOf("function openDuplicateForm(t: Transaction) {");
    const end = source.indexOf("function handleTypeChange(", start);
    const region = source.slice(start, end);

    expect(region).toContain("isSavingsManagedTransaction(t)");
    expect(region).toContain("không thể nhân bản từ Giao dịch");
  });

  it("keeps the existing row duplicate affordance and capture-speed defaults intact", () => {
    expect(source.split('aria-label="Nhân bản giao dịch"').length - 1).toBe(2);
    expect(source).toContain("resolveCreateCaptureDefaults(formMode)");
    expect(source).toContain("rememberTransactionCaptureSuccess(");
  });
});