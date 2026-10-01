import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("TRANSACTION-CSV-IMPORT-1 — import modal contract", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionCsvImportModal.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("preflights duplicates against the all-time ordinary transaction ledger before previewing", () => {
    expect(source).toContain("getTransactions()");
    expect(source).toContain("buildTransactionCsvImportPreview({");
    expect(source).toContain("existingTransactions,");
    expect(source.indexOf("getTransactions()"))
      .toBeLessThan(source.indexOf("buildTransactionCsvImportPreview({"));
  });

  it("writes every accepted row through the canonical addTransaction Finance Engine boundary", () => {
    expect(source).toContain("const result = await addTransaction(row.transaction);");
    expect(source).not.toContain("updateWallet(");
    expect(source).not.toContain('.from("transactions")');
    expect(source).not.toContain("supabase.rpc");
  });

  it("requires a clean preview: invalid rows block commit while exact duplicates are explicitly skipped", () => {
    expect(source).toContain("preview.readyCount > 0");
    expect(source).toContain("preview.errorCount === 0");
    expect(source).toContain("duplicateCount: preview.duplicateCount");
    expect(source).toContain("MyFinance không âm thầm bỏ qua dữ liệu không hợp lệ.");
  });

  it("keeps file and batch bounds explicit", () => {
    expect(source).toContain("const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;");
    expect(source).toContain("TRANSACTION_CSV_IMPORT_MAX_ROWS");
    expect(source).toContain("file.size > MAX_FILE_SIZE_BYTES");
  });

  it("has accessible dialog semantics and real iPhone-safe scrolling/actions", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="transaction-csv-import-title"');
    expect(source).toContain("h-dvh");
    expect(source).toContain("overflow-y-auto overscroll-contain");
    expect(source).toContain("env(safe-area-inset-top)");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("does not claim browser-level all-or-nothing behavior for a multi-row import", () => {
    expect(source).toContain("earlier successful rows remain real");
    expect(source).toContain("failures.push({ rowNumber: row.rowNumber, error: result.error })");
  });

  it("does not own Savings or external cash-ledger mutations", () => {
    for (const token of [
      "createSavingMovement",
      "createSavingAccount",
      "getForexAccounts",
      "createForexCashTransaction",
      "forex_cash_transactions",
    ]) {
      expect(source).not.toContain(token);
    }
  });
});
