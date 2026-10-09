import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const pageReadStart = source.indexOf("const reloadData = useCallback(async () => {");
const pageReadEnd = source.indexOf("const latestReloadDataRef = useRef(reloadData);", pageReadStart);
const pageReads = source.slice(pageReadStart, pageReadEnd);
const feedStart = source.indexOf("const filtered = useMemo(() => {");
const feedEnd = source.indexOf("const sorted = useMemo(() => {", feedStart);
const feed = source.slice(feedStart, feedEnd);
const sectionStart = source.indexOf("SECTION 1");
const sectionEnd = source.indexOf("SECTION 2", sectionStart);
const summary = source.slice(sectionStart, sectionEnd);
const selector = readFileSync(
  path.resolve(__dirname, "../../lib/transactions/transactionIncomeExpenseScope.ts"),
  "utf8",
);

describe("TRANSACTIONS-INCOME-EXPENSE-SCOPE-1 page contract", () => {
  it("fetches only ordinary transactions, categories, and wallets for this page", () => {
    expect(pageReadStart).toBeGreaterThan(-1);
    expect(pageReads).toContain("getTransactionsInRange(startDate, endDate)");
    expect(pageReads).toContain("getCategories()");
    expect(pageReads).toContain("getWallets()");
    expect(pageReads).not.toContain("getSavingTransactionsInRange");
    expect(pageReads).not.toContain("getForexCashTransactionsInRange");
    expect(source).not.toContain("summarizeTransactionWalletCashMovement");
  });

  it("uses canonical category-aware real expense and ordinary income only", () => {
    expect(source).toContain("summarizeTransactionIncomeExpense({");
    expect(selector).toContain("getTotalIncome(scoped)");
    expect(selector).toContain("getRealExpenseTransactions(scoped, input.categories)");
    expect(source).toContain("const totalIncome = incomeExpenseSnapshot.income;");
    expect(source).toContain("const totalExpense = incomeExpenseSnapshot.expense;");
    expect(source).toContain("const netCashFlow = incomeExpenseSnapshot.net;");
    expect(source).not.toContain("cashMovementSnapshot");
  });

  it("fails closed if ledger/categories fail, or the selected period changes", () => {
    expect(source).toContain("incomeExpenseReadState?.periodKey === incomeExpensePeriodKey");
    expect(source).toContain('incomeExpenseReadState.status === "ready"');
    expect(source).toContain('role={incomeExpenseError ? "alert" : "status"}');
    expect(summary).toContain('incomeExpenseReady ? formatVND(totalIncome) : "\u2014"');
    expect(summary).toContain('incomeExpenseReady ? formatVND(totalExpense) : "\u2014"');
    expect(source).toContain("netCashFlow={incomeExpenseReady ? netCashFlow : null}");
  });

  it("shows four iPhone-friendly ordinary summary cards, without capital breakdown", () => {
    for (const label of ["Thu nh\u1eadp", "Chi ti\u00eau", "Thu \u2212 Chi", "Chuy\u1ec3n gi\u1eefa v\u00ed"]) {
      expect(summary).toContain(`label="${label}"`);
    }
    expect(summary).not.toContain('label="Ti\u1ec1n v\u00e0o v\u00ed"');
    expect(summary).not.toContain('label="Ti\u1ec1n ra v\u00ed"');
    expect(summary).toContain('className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 xl:grid-cols-4"');
    expect(source).not.toContain("cashMovementSnapshot.forexCashIn");
    expect(source).not.toContain("showCashMovementBreakdown");
  });

  it("keeps category/search/amount as list-only filters, with date/wallet for cards", () => {
    expect(source).toContain("({ effectiveRange, dateFrom, dateTo, walletId: walletFilter })");
    expect(selector).toContain('transaction.type === "transfer"');
    expect(selector).toContain("isOrdinaryTransactionFeedRow(transaction)");
    expect(selector).toContain("scope.dateFrom");
    expect(selector).toContain("scope.dateTo");
    expect(selector).not.toContain("getForexCashMovementFromLedger");
    expect(feed).toContain("if (!isOrdinaryTransactionFeedRow(t)) return false;");
  });

  it("keeps investment/savings mirrors persisted and excludes legacy investment wallets from liquidity", () => {
    expect(source).not.toContain("createInvestmentCapitalMovement(");
    expect(source).not.toContain("addSavingMovement(");
    expect(source).toContain('wallets.filter((wallet) => wallet.type !== "investment")');
    expect(source).toContain("walletCount={spendableWallets.length}");
    expect(source).toContain("serializeTransactionsCsv({");
    expect(source.split("addTransaction(").length - 1).toBe(1);
  });
});
