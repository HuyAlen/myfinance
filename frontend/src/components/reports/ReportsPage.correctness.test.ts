import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * REPORTS-CORRECTNESS-1 — Temporal Scope, Metric Semantics & Export Integrity.
 *
 * Source-inspection contract, matching the existing ReportsPage regression
 * style in this repo (no React Testing Library dependency).
 */
describe("ReportsPage temporal scope and metric integrity (REPORTS-CORRECTNESS-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "ReportsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("consumes the canonical global DateFilterProvider instead of owning a second report-period state", () => {
    expect(source).toContain('import { useDateFilter } from "@/src/components/layout/DateFilterProvider";');
    expect(source).toContain("filterMode: periodMode");
    expect(source).toContain("filterLabel: canonicalPeriodLabel");
    expect(source).toContain("dateRange");
    expect(source).not.toContain("useState<PeriodMode>");
    expect(source).not.toContain("getCurrentReportPeriodDefaults");
    expect(source).not.toContain('const [year, setYear] = useState');
    expect(source).not.toContain('const [month, setMonth] = useState');
    expect(source).not.toContain('const [quarter, setQuarter] = useState');
  });

  it("validates custom ranges in filtering and keeps the date controls ordered", () => {
    expect(source).toContain("function isValidCustomRange(customStart: string, customEnd: string)");
    expect(normalized).toContain('case "custom": if (!isValidCustomRange(customStart, customEnd)) return [];');
    expect(source).toContain("max={customEnd || undefined}");
    expect(source).toContain("min={customStart || undefined}");
    expect(source).toContain("setCustomRange(nextStart, nextStart > customEnd ? nextStart : customEnd)");
    expect(source).toContain("setCustomRange(nextEnd < customStart ? nextEnd : customStart, nextEnd)");
  });

  it("separates period cash-flow margin from future-allocation rate", () => {
    expect(source).toContain("const cashFlowAfterExpense = flow.netCashFlow;");
    expect(source).toContain("const cashFlowRate =");
    expect(source).toContain("const allocationRate =");
    expect(source).not.toContain("const savingRate =");
    expect(source).not.toContain("summary.savingRate");
    expect(source).toContain('label="Tỷ lệ tích lũy"');
    expect(source).toContain("value={summary.allocationRate + \"%\"}");
    expect(source).toContain("{summary.cashFlowRate}%");
  });

  it("uses the canonical finance-flow snapshot for real expense and Savings/Forex allocation", () => {
    expect(source).toContain("calculateFinanceFlowSnapshot({");
    expect(source).toContain("savingMovements");
    expect(source).toContain('from("saving_transactions")');
    expect(source).toContain("forexCashTransactions");
    expect(source).toContain("const savingAllocation = flow.savingAllocation;");
    expect(source).toContain(
      "const investmentAllocation = flow.investmentAllocation;",
    );
    expect(source).not.toContain("getSavingCapitalTotal");
    expect(source).not.toContain("getInvestmentCapitalTotal");
  });

  it("shares one canonical full balance-sheet snapshot across report KPIs and analytics", () => {
    expect(source).toContain("calculateBalanceSheetSnapshot({");
    expect(source).toContain("const balanceSheet = useMemo(");
    expect(source).toContain("forexAccounts,");
    expect(source).toContain("forexCashTransactions,");
    expect(source).toContain("const debtRatio = balanceSheet.debtRatio;");
    expect(source).toContain("balanceSheet.forex");
  });

  it("labels cash-flow deltas as cash flow rather than savings", () => {
    const comparisonStart = source.indexOf("const comparisons = useMemo(() => {");
    const comparisonEnd = source.indexOf("// ── Analytics engine", comparisonStart);
    const comparisonSource = source.slice(comparisonStart, comparisonEnd);
    expect(comparisonSource).toContain("cashFlow: delta(");
    expect(comparisonSource).not.toContain("saving: delta(");
    expect(source).toContain('label="Dòng tiền sau chi phí"');
    expect(source).toContain("delta={data.cashFlow}");
  });

  it("anchors MoM/QoQ/YoY to the selected report period instead of wall-clock now", () => {
    const start = source.indexOf("const comparisons = useMemo(() => {");
    const end = source.indexOf("// ── Analytics engine", start);
    const block = source.slice(start, end);
    expect(block).toContain("getComparisonAnchor(");
    expect(block).toContain("periodMode");
    expect(block).toContain("previousEquivalentPeriodTxns");
    expect(block).toContain("shiftIsoDateByYears(customStart, -1)");
    expect(block).toContain("getTotalIncome(filtered)");
    expect(block).not.toContain("const now = new Date()");
  });

  it("computes period monthly averages and strongest month from the selected scope using canonical Savings/Forex ledgers", () => {
    expect(source).toContain("const periodMonthKeys = useMemo(");
    expect(normalized).toContain(
      "buildMonthlyReportRow( monthKey, filtered, categories, periodSavingMovements, periodForexCashTransactions,",
    );
    expect(source).not.toContain("const periodSavings = useMemo(");
    expect(source).toContain("const periodSavingMovements = useMemo(");
    expect(source).toContain("const periodForexCashTransactions = useMemo(");
    expect(normalized).toContain(
      "filterByDateRange( savingMovements, dateRange, (movement) => movement.date",
    );
    expect(normalized).toContain(
      "filterByDateRange( forexCashTransactions, dateRange, (transaction) => transaction.transactionDate",
    );
    expect(source).toContain("const monthsWithData = periodMonthly.filter(");
    expect(source).toContain("[...periodMonthly].sort((a, b) => b.income - a.income)");
  });

  it("delegates goal funding to the canonical cross-page snapshot instead of reimplementing Savings matching", () => {
    expect(source).toContain("calculateGoalFundingSnapshot({");
    expect(source).toContain("const effectiveCurrentAmount = funding.effectiveCurrentAmount;");
    expect(source).toContain("const pct = funding.progressPercent;");
    expect(source).not.toContain("getSupabaseSavingAmountForReportGoal");
    expect(source).not.toContain("normalizeReportText");
  });

  it("treats asset allocation as assets only and keeps debt outside the pie denominator", () => {
    const start = source.indexOf("const assetAllocationData = useMemo(() => {");
    const end = source.indexOf("const goalMeta = useMemo(", start);
    const block = source.slice(start, end);
    expect(block).toContain('{ name: "Forex", value: balanceSheet.forex');
    expect(block).not.toContain('{ name: "Nợ"');
    expect(source).toContain("const assetAllocationTotal = useMemo(");
    expect(source).toContain("item.value / assetAllocationTotal");
    expect(source).toContain("Nợ phải trả · ngoài cơ cấu tài sản");
  });

  it("makes current-state snapshot semantics explicit beside period-scoped flows", () => {
    expect(source).toContain("Dòng tiền theo {label}");
    expect(source).toContain("snapshot hiện tại");
    expect(source).toContain('sub="Snapshot hiện tại · Tài sản − Nợ"');
    expect(source).toContain('label="Tiết kiệm hiện tại"');
    expect(source).toContain("summary.savingAllocation");
    expect(source).toContain('label="Danh mục đầu tư hiện tại"');
    expect(source).toContain("value={formatVND(summary.investmentAssets)}");
    expect(source).not.toContain("displayedInvestmentCapital");
    expect(source).toContain("Financial Health · hiện tại");
    expect(source).toContain("Giá trị và ROI là snapshot hiện tại; vốn phân bổ được tính theo kỳ báo cáo.");
  });

  it("does not mutate the memoized goalMeta array to find the lowest-progress goal", () => {
    expect(source).toContain("const priorityGoal = useMemo(");
    expect(source).toContain("[...goalMeta].sort((a, b) => a.pct - b.pct)[0]");
    expect(source).not.toContain("goalMeta.sort(");
    expect(source).toContain("priorityGoal ? priorityGoal.name : \"Chưa có\"");
  });

  it("exports only the selected report period with a period-specific filename and explicit snapshot metadata", () => {
    const start = source.indexOf("function exportCSV() {");
    const end = source.indexOf("function exportPDF()", start);
    const block = source.slice(start, end);
    expect(block).toContain("...periodMonthly.map((row) => [");
    expect(block).not.toContain("...monthly.map((m) => [");
    expect(block).toContain('["Tài sản / nợ / mục tiêu", "Snapshot hiện tại"]');
    expect(block).toContain('"\\uFEFF" +');
    expect(block).toContain('a.download = "myfinance-report-" + reportFileToken + ".csv"');
    expect(source).toContain("function getReportFileToken(");
  });

  it("keeps export UI honest about CSV period scope and PDF current-tab scope", () => {
    expect(source).toContain("CSV theo kỳ {label} · PDF in tab báo cáo đang mở");
    expect(source).toContain("if (!isReportPeriodValid) return;");
    expect(source).toContain("disabled={!isReportPeriodValid}");
  });
});
