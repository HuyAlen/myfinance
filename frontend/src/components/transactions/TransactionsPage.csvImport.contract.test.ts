import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("TRANSACTION-CSV-IMPORT-1 — TransactionsPage adoption", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("adds one accessible import affordance beside the existing CSV export controls", () => {
    expect(source).toContain('aria-label="Nhập CSV"');
    expect(source).toContain('title="Nhập CSV"');
    expect(source).toContain("<Upload size={14} />");
    expect(source).toContain("<TransactionCsvImportModal");
  });

  it("suppresses global FABs while any transaction workstation is open", () => {
    expect(source).toContain("const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);");
    expect(source).toContain("const [isRulesOpen, setIsRulesOpen] = useState(false);");
    expect(source).toContain(
      "useSuppressGlobalFabsWhileOpen(isFormOpen || isCsvImportOpen || isRulesOpen || !!pendingAction);",
    );
  });

  it("refreshes authoritative page data after any successful imported rows", () => {
    const modalStart = source.indexOf("<TransactionCsvImportModal");
    expect(modalStart).toBeGreaterThan(-1);
    const modalEnd = source.indexOf("/>", modalStart);
    const modalSource = source.slice(modalStart, modalEnd + 2);
    expect(modalSource).toContain("await runReload();");
    expect(modalSource).toContain("setCurrentPage(0);");
  });

  it("passes rule state into CSV preview without creating a second mutation path", () => {
    const modalStart = source.indexOf("<TransactionCsvImportModal");
    const modalEnd = source.indexOf("/>", modalStart);
    const modalSource = source.slice(modalStart, modalEnd + 2);
    expect(modalSource).toContain("rules={transactionRules}");
  });

  it("reuses the shared CSV serializer for quote-safe export/import round trips", () => {
    const exportStart = source.indexOf("function exportCSV() {");
    const exportEnd = source.indexOf("\n  const filteredCategories", exportStart);
    const exportSource = source.slice(exportStart, exportEnd);
    expect(exportSource).toContain("serializeTransactionsCsv({");
    expect(exportSource).not.toContain(`'"' + v + '"'`);
  });

  it("does not add a second addTransaction mutation call site to TransactionsPage", () => {
    expect(source.split("addTransaction(").length - 1).toBe(1);
  });
});
