import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "TransactionsPage.tsx"), "utf8").replace(/\r\n/g, "\n");
const readStart = source.indexOf("const reloadData = useCallback(async () => {");
const readEnd = source.indexOf("const latestReloadDataRef = useRef(reloadData);", readStart);
const readRegion = source.slice(readStart, readEnd);
const feedStart = source.indexOf("const filtered = useMemo(() => {");
const feedEnd = source.indexOf("const sorted = useMemo(() => {", feedStart);
const feedRegion = source.slice(feedStart, feedEnd);
const summaryStart = source.indexOf("{/* SECTION 1 · Transaction Summary */}");
const summaryEnd = source.indexOf("SECTION 2 · Smart Filter Command Bar", summaryStart);
const summaryRegion = source.slice(summaryStart, summaryEnd);

describe("TRANSACTIONS-CASH-MOVEMENT-CARDS-1 adoption", () => {
  it("fetches period bounded Savings and Forex sources alongside ordinary ledger and categories", () => {
    expect(readRegion).toContain("getTransactionsInRange(startDate, endDate)");
    expect(readRegion).toContain("getSavingTransactionsInRange(startDate, endDate)");
    expect(readRegion).toContain("getForexCashTransactionsInRange(startDate, endDate)");
    expect(readRegion).toContain("savingResult.status === \"fulfilled\"");
    expect(readRegion).toContain("forexResult.status === \"fulfilled\"");
    expect(readRegion).toContain("setCashMovementReadState({");
  });

  it("does not certify cash totals when any required read fails or a period changes", () => {
    expect(source).toContain('cashMovementReadState?.periodKey === cashMovementPeriodKey');
    expect(source).toContain('cashMovementReadState.status === "ready"');
    expect(source).toContain('role={cashMovementError ? "alert" : "status"}');
    expect(source).toContain('value={cashMovementReady ? formatVND(totalIncome)');
    expect(source).toContain('value={cashMovementReady ? formatVND(totalExpense)');
    expect(source).toContain('netCashFlow={cashMovementReady ? netCashFlow : null}');
  });

  it("hides system-owned capital mirror rows from the editable, searchable, exportable feed", () => {
    expect(feedRegion).toContain("if (!isOrdinaryTransactionFeedRow(t)) return false;");
    expect(source).toContain("const sorted = useMemo(");
    expect(source).toContain("serializeTransactionsCsv({");
    expect(source.split("addTransaction(").length - 1).toBe(1);
    expect(source.split("deleteTransaction(").length - 1).toBe(2);
  });

  it("keeps iPhone 2x2 cards and an accessible optional flow breakdown", () => {
    for (const label of ["Tiền vào ví", "Tiền ra ví", "Dòng tiền ròng", "Chuyển giữa ví"]) {
      expect(summaryRegion).toContain(`label="${label}"`);
    }
    expect(summaryRegion).toContain('className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 xl:grid-cols-4"');
    expect(summaryRegion).toContain('aria-expanded={showCashMovementBreakdown}');
    expect(summaryRegion).toContain('data-cash-movement-breakdown="true"');
    expect(summaryRegion).toContain("cashMovementSnapshot.forexCashIn");
    expect(summaryRegion).toContain("cashMovementSnapshot.portfolioInvestmentCashOut");
  });

  it("uses financial flow SSOT without changing the database or investment mutation path", () => {
    expect(source).toContain("summarizeTransactionWalletCashMovement({");
    expect(source).not.toContain("createInvestmentCapitalMovement(");
    expect(source).not.toContain("addSavingMovement(");
    expect(source).not.toContain('from("transactions")');
  });
});
