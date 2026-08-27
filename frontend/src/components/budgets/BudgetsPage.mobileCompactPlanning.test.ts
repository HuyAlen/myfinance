import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BUDGETS-MOBILE-POLISH-1 — Compact Planning Hierarchy & Mobile Action Access.
 *
 * Source-inspection contract only: mobile presentation is compacted without
 * changing budget calculations, CRUD, or FINANCE-DATA-1B/1C semantics.
 */
describe("BudgetsPage compacts planning hierarchy on mobile", () => {
  const source = readFileSync(
    path.resolve(__dirname, "BudgetsPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("keeps the hero and 2x2 KPI snapshot compact on iPhone", () => {
    expect(source).toContain(
      "from-white via-[#F9FCFF] to-[#F1F6FB] px-3.5 py-3.5",
    );
    expect(source).toContain(
      'className="mt-1 hidden text-sm text-[#61788F] sm:block"',
    );
    expect(source).toContain("min-h-10 w-full");
    expect(source).toContain("mt-3.5 grid grid-cols-2 gap-2.5");
    expect(source).toContain(
      "col-span-2 rounded-2xl border border-rose-200",
    );
  });

  it("shows fixed-cost metrics as a compact 3-column mobile snapshot", () => {
    expect(source).toContain('className="grid grid-cols-3 gap-2 sm:gap-3"');
    expect(source).toContain("min-w-0 rounded-xl bg-white/85 p-2.5");
    expect(source).toContain("truncate text-[11px] font-black");
  });

  it("compresses 50/30/20 rows without hiding canonical values", () => {
    expect(source).toContain("mt-3 space-y-2.5 sm:mt-5 sm:space-y-3");
    expect(source).toContain(
      "rounded-2xl border p-3 sm:rounded-3xl sm:p-4",
    );
    expect(source).toContain("mt-2.5 grid grid-cols-3 gap-1.5");
    expect(source).toContain("mt-3 grid grid-cols-2 gap-2");
    expect(source).toContain("bucket.actualAmount");
    expect(source).toContain("bucket.targetAmount");
    expect(source).toContain("bucket.difference");
  });

  it("reduces allocation-chart height for the mobile viewport", () => {
    expect(source).toContain("<PieChart width={152} height={152}>");
    expect(source).toContain("innerRadius={44}");
    expect(source).toContain("outerRadius={68}");
    expect(source).toContain("gap-x-6 gap-y-2 md:grid-cols-2");
  });

  it("gives mobile budget cards transaction, edit, and delete actions", () => {
    const marker = source.indexOf(
      "BUDGETS-MOBILE-POLISH-1: mobile keeps the same direct action access as desktop.",
    );
    expect(marker).toBeGreaterThan(-1);
    const actionSource = source.slice(marker, marker + 1800);

    expect(actionSource).toContain("grid grid-cols-3");
    expect(actionSource).toContain("buildTransactionsHref({");
    expect(actionSource).toContain("Giao dịch");
    expect(actionSource).toContain("openEditForm(budget)");
    expect(actionSource).toContain("handleDelete(budget.id)");
  });

  it("retains FINANCE-DATA-1B/1C and authoritative planning semantics", () => {
    expect(normalized).toContain(
      "{filteredBudgets.length === 0 && isLoadingBudgets && (",
    );
    expect(normalized).toContain(
      "{filteredBudgets.length === 0 && !isLoadingBudgets && budgetsLoadError && (",
    );
    expect(normalized).toContain(
      "{filteredBudgets.length === 0 && !isLoadingBudgets && !budgetsLoadError && (",
    );
    expect(source).toContain("if (savingsResult.error) {");
    expect(source).toContain("throw savingsResult.error;");
    expect(source).toContain("if (investmentsResult.error) {");
    expect(source).toContain("throw investmentsResult.error;");
    expect(source).toContain("calculateRule503020({");
    expect(source).toContain(
      "computeSmartBudget(transactions, categories, budgets)",
    );
  });

  it("keeps the create/edit form iPhone-safe without changing CRUD behavior", () => {
    expect(source).toContain(
      "p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
    );
    expect(source).toContain("px-4 py-3 text-base outline-none");
    expect(source).toContain("async function handleSubmit");
    expect(source).toContain("addBudget(budget)");
    expect(source).toContain("updateBudget(budget)");
  });
});
