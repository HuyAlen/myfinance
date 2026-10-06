import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const confidence = readFileSync(
  path.resolve(__dirname, "../../lib/transactions/transactionEntryConfidence.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const normalized = page.replace(/\s+/g, " ");

describe("TRANSACTION-ENTRY-CONFIDENCE-1 — P0", () => {
  it("derives confidence warnings from the already-loaded ledger without adding finance queries", () => {
    expect(page).toContain(
      'import { buildTransactionEntryConfidenceWarnings } from "@/src/lib/transactions/transactionEntryConfidence";',
    );
    expect(page).toContain("buildTransactionEntryConfidenceWarnings({");
    expect(page).toContain("transactions,");
    expect(page.split("getTransactionsInRange(").length - 1).toBe(1);
    expect(page.split("getCategories(").length - 1).toBe(1);
    expect(page.split("getWallets(").length - 1).toBe(1);
  });

  it("keeps P0 confidence create-only for ordinary non-recurring income/expense entries", () => {
    const start = page.indexOf("const activeEntryConfidenceWarnings = useMemo(() => {");
    const end = page.indexOf("const quickRepeatCandidates = useMemo(", start);
    const region = page.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(region).toContain('form.id || mode === "transfer" || form.isRecurring');
    expect(region).toContain("amount <= 0");
    expect(region).toContain("!form.categoryId");
    expect(region).toContain("!form.walletId");
  });

  it("validates confidence context against current category and wallet ids", () => {
    expect(page).toContain("mode,");
    expect(page).toContain("amount,");
    expect(page).toContain("categoryId: form.categoryId");
    expect(page).toContain("walletId: form.walletId");
    expect(page).toContain("note: form.note");
    expect(page).toContain("date: form.date");
    expect(page).toContain(
      "validCategoryIds: filteredCategories.map((category) => category.id)",
    );
    expect(page).toContain("validWalletIds: wallets.map((wallet) => wallet.id)");
  });

  it("reuses canonical duplicate fingerprint semantics and excludes unsafe history in the pure SSOT", () => {
    expect(confidence).toContain("buildTransactionReviewFingerprint");
    expect(confidence).toContain("isInternalTransferTransaction(transaction)");
    expect(confidence).toContain("isSavingsManagedTransaction(transaction)");
    expect(confidence).toContain("hasRecurringMetadata(transaction)");
    expect(confidence).toContain("share >= 0.8");
    expect(confidence).toContain("context.length < 3");
  });

  it("renders compact Vietnamese advisory warnings before save without a blocking confirmation", () => {
    expect(page).toContain('data-transaction-entry-confidence="true"');
    expect(page).toContain('aria-label="Cảnh báo độ tin cậy trước khi lưu"');
    expect(page).toContain("Kiểm tra trước khi lưu");
    expect(page).toContain("Chỉ là cảnh báo, bạn vẫn có thể lưu giao dịch.");
    expect(page).toContain("Có giao dịch rất giống trong cùng ngày.");
    expect(page).toContain("Số tiền cao hơn nhiều so với lịch sử.");
    expect(page).toContain("Ví đang chọn khác thói quen gần đây.");
    expect(page).not.toContain("confirmEntryConfidence");
  });

  it("does not let confidence warnings gate or fork the canonical submit path", () => {
    const start = page.indexOf("async function handleSubmit(event: React.FormEvent) {");
    const end = page.indexOf("function handleDelete(", start);
    const submitRegion = page.slice(start, end);

    expect(submitRegion).not.toContain("activeEntryConfidenceWarnings");
    expect(submitRegion).not.toContain("buildTransactionEntryConfidenceWarnings");
    expect(page.split("addTransaction(").length - 1).toBe(1);
    expect(page.split("updateTransaction(").length - 1).toBe(1);
    expect(normalized).toContain("disabled={isSubmitting}");
  });

  it("never auto-corrects the form or persists confidence history", () => {
    expect(page).not.toContain("applyEntryConfidence");
    expect(page).not.toContain("autoApplyEntryConfidence");
    expect(confidence).not.toContain("localStorage");
    expect(confidence).not.toContain("sessionStorage");
    expect(confidence).not.toContain("setItem(");
  });

  it("keeps amount and wallet checks conservative rather than warning on one-off history", () => {
    expect(confidence).toContain("context.length < 3");
    expect(confidence).toContain("Math.max(200_000, baselineAmount * 0.5)");
    expect(confidence).toContain("ratio >= 3");
    expect(confidence).toContain("ratio <= 1 / 3");
    expect(confidence).toContain("expectedWalletCount >= 3");
    expect(confidence).toContain("share >= 0.8");
  });

  it("preserves Smart Defaults, Quick Repeat, rules and mutation-session behavior", () => {
    expect(page).toContain("buildTransactionSmartDefaultsSuggestion({");
    expect(page).toContain("buildTransactionQuickRepeatCandidates(transactions, 3)");
    expect(page).toContain('data-transaction-rule-suggestion="true"');
    expect(page).toContain("isSubmittingThisSession(");
    expect(page).toContain("isSessionStillCurrent(");
    expect(page).not.toContain("entryConfidenceTransactionMutation");
  });
});