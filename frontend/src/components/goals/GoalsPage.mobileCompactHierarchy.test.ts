import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GOALS-MOBILE-POLISH-1/2 — Compact hierarchy plus single-line card value integrity.
 *
 * Source-inspection contract: preserve goal/data semantics while making the
 * iPhone layout materially denser — 2x2 KPIs, compact overview counters,
 * grouped priority rows, 3-up per-goal stats, and a shorter forecast block.
 */
describe("GoalsPage compacts the mobile financial hierarchy", () => {
  const source = readFileSync(
    path.resolve(__dirname, "GoalsPage.tsx"),
    "utf8",
  );

  it("marks the dedicated mobile polish contract and tightens the page rhythm", () => {
    expect(source).toContain(
      "GOALS-MOBILE-POLISH-1 · Compact Goal Hierarchy & Scroll Efficiency",
    );
    expect(source).toContain(
      'className="space-y-4 overflow-x-hidden pb-24 md:space-y-6 md:pb-0"',
    );
  });

  it("keeps the hero concise and shows the four KPI cards as 2x2 on iPhone", () => {
    expect(source).toContain(
      'className="mt-1 hidden max-w-2xl text-sm text-[#61788F] sm:block"',
    );
    expect(source).toContain(
      'className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4"',
    );
    expect(source).toContain(
      "GOALS-MOBILE-POLISH-2 · Single-Line Card Value Integrity",
    );
    expect(source).toContain("min-h-[108px] min-w-0 rounded-2xl border p-3");
    expect(source).toContain("mobileValueSize");
    expect(source).toContain("mobileSubSize");
    expect(source).toContain("whitespace-nowrap");
  });

  it("turns overall tier counters into a compact 2x2 mobile grid", () => {
    expect(source).toContain(
      'className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-4 sm:gap-3"',
    );
    expect(source).toContain(
      'className="rounded-xl border border-[#E4ECF3] bg-[#F8FBFD] p-2.5',
    );
    expect(source).toContain(
      'className="shrink-0 text-3xl font-black tracking-tight text-[#2F80ED]',
    );
  });

  it("renders priority goals as one compact ranked surface instead of three large cards", () => {
    expect(source).toContain(
      'className="mt-3 overflow-hidden rounded-2xl border border-[#DCE6EF] bg-[#F8FBFF]',
    );
    expect(source).toContain(
      'className="border-b border-[#E4ECF3] px-3 py-2.5 last:border-b-0',
    );
    expect(source).not.toContain(
      'className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3"',
    );
    expect(source).toContain(
      '"whitespace-nowrap font-black text-[#36536B] sm:text-sm " +',
    );
  });

  it("keeps each goal card dense with three stats on the first mobile row", () => {
    expect(source).toContain(
      'className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[#F6F9FC] p-2.5',
    );
    expect(source).toContain(
      '"group rounded-3xl border bg-white p-4 shadow-[0_5px_16px_rgba(54,83,107,0.06)]',
    );
    expect(source).toContain(
      '"flex size-10 shrink-0 items-center justify-center rounded-xl',
    );
    expect(source).not.toContain(
      'mt-5 grid grid-cols-1 gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-3',
    );
    expect(source).toContain("getMobileSingleLineNameSize(g.name)");
    expect(source).toContain(
      'whitespace-nowrap text-[11px] font-black text-[#2F80ED]',
    );
  });

  it("keeps precise progress and forecast values while hiding explanatory forecast copy on mobile", () => {
    expect(source).toContain("{formatVND(g.effectiveCurrentAmount)}");
    expect(source).toContain("/ {formatVND(g.targetAmount)}");
    expect(source).toContain("formatVND(g.suggestedMonthly) + \"/tháng\"");
    expect(source).toContain(
      'className="mt-2 hidden text-[11px] leading-5 text-[#61788F] sm:block"',
    );
    expect(source).toContain(
      'whitespace-nowrap text-[11px] font-black tracking-[-0.02em] text-[#2F80ED]',
    );
  });

  it("never hides card text behind truncation or line-clamp utilities", () => {
    expect(source).not.toContain("truncate");
    expect(source).not.toContain("line-clamp");
    expect(source).not.toContain("wrap-break-word");
    expect(source).toContain("getMobileSummaryPairSize(");
    expect(source).toContain("getMobileSingleLineNameSize(");
  });

  it("does not change authoritative goal balance, savings-linking, CRUD, or failure-state semantics", () => {
    expect(source).toContain("getGoalEffectiveCurrentAmount({");
    expect(source).toContain("getGoalLinkedSavingAmount({");
    expect(source).toContain("getSupabaseSavingAmountForGoal(g, savings)");
    expect(source).toMatch(
      /Math\.max\(\s*baseEffectiveCurrentAmount,\s*g\.currentAmount \+ supabaseSavingAmount,\s*\)/,
    );
    expect(source).toContain("const { error } = form.id ? await updateGoal(goal) : await addGoal(goal);");
    expect(source).toContain("await deleteGoal(id)");
    expect(source).toContain("if (savingRows.error) {");
    expect(source).toContain("throw savingRows.error;");
    expect(source).toContain(
      "goals.length === 0 && !isLoadingGoals && goalsLoadError",
    );
  });
});
