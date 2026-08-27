import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * REPORTS-MOBILE-POLISH-1 — Compact Report Hierarchy & iPhone Chart Ergonomics.
 *
 * Source-inspection contract. The repo intentionally avoids adding a React
 * mounting stack only for these layout regressions, so this suite locks the
 * responsive class contract and preserves REPORTS-CORRECTNESS-1 semantics.
 */
describe("ReportsPage mobile first-viewport contract (REPORTS-MOBILE-POLISH-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "ReportsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("keeps the iPhone hero compact while preserving the full desktop report context", () => {
    expect(source).toContain(
      'className="hidden text-[11px] font-black uppercase tracking-widest text-blue-500 sm:block"',
    );
    expect(source).toContain(
      'className="text-2xl font-black tracking-tight text-slate-900 sm:mt-1 sm:text-4xl"',
    );
    expect(source).toContain(
      'className="mt-1 hidden text-sm text-slate-500 sm:block"',
    );
    expect(source).toContain("<CalendarDays size={13} />");
  });

  it("uses one compact mobile export entry and hides the duplicate bottom export center on phones", () => {
    expect(source).toContain('<details className="group relative sm:hidden">');
    expect(source).toContain("Xuất");
    expect(source).toContain(
      'className="hidden rounded-4xl border border-slate-200 bg-white p-4 shadow-sm sm:block sm:p-6 print:hidden"',
    );
  });

  it("turns the five hero KPIs into a horizontal snap rail on phones", () => {
    expect(source).toContain(
      'className="no-scrollbar -mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mt-6 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-5"',
    );
    expect(source).toContain(
      '"w-[168px] shrink-0 snap-start rounded-2xl bg-linear-to-br p-3 shadow-sm sm:w-auto sm:min-w-0 sm:p-4 "',
    );
    expect(source).toContain(
      '"w-[168px] shrink-0 snap-start rounded-2xl bg-linear-to-br p-3 shadow-sm sm:w-auto sm:p-4 "',
    );
  });

  it("collapses period controls on iPhone and uses 16px form controls to avoid Safari auto-zoom", () => {
    expect(source).toContain(
      '<details className="group border-t border-slate-100 bg-slate-50/80 print:hidden sm:hidden">',
    );
    expect(source).toContain(
      'className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-bold text-slate-700 outline-none"',
    );
    expect(source).toContain(
      'className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-700 outline-none"',
    );
    expect(source).toContain(
      'className="hidden flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4 print:hidden sm:flex"',
    );
  });

  it("keeps report tabs sticky, horizontally scrollable and compact on mobile", () => {
    expect(source).toContain(
      'className="sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur print:hidden sm:rounded-3xl sm:p-2"',
    );
    expect(source).toContain(
      '"shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm "',
    );
  });

  it("removes the duplicate tab-description card from the phone viewport", () => {
    expect(source).toContain(
      '<section className="hidden rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:block">',
    );
  });

  it("turns overview insight summaries into a mobile rail instead of three tall stacked cards", () => {
    expect(source).toContain(
      'className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3"',
    );
    expect(source).toContain(
      '"w-[252px] shrink-0 snap-start rounded-3xl border p-4 shadow-sm sm:w-auto sm:p-5 "',
    );
  });

  it("keeps StatMini currency values on one line without ellipsis or word breaking", () => {
    const start = source.indexOf("function StatMini({");
    const end = source.indexOf("function SectionHeader({", start);
    const statMini = source.slice(start, end);

    expect(statMini).toContain("whitespace-nowrap");
    expect(statMini).toContain("tabular-nums");
    expect(statMini).not.toContain("truncate");
    expect(statMini).not.toContain("wrap-break-word");
    expect(statMini).toContain("p-3 sm:p-4");
  });

  it("reduces the three large axis charts on iPhone and lets Recharts thin month ticks", () => {
    expect(source).toContain('className="mt-4 h-[220px] sm:mt-5 sm:h-[280px]"');
    expect(source).toContain('className="mt-4 h-[220px] sm:mt-5 sm:h-[300px]"');
    expect(source).toContain('className="h-[220px] sm:h-[280px]"');
    expect((source.match(/minTickGap=\{12\}/g) ?? []).length).toBe(3);
    expect((source.match(/height="100%"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("makes statement tabs horizontally scrollable instead of squeezing or wrapping labels", () => {
    expect(source).toContain(
      'className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto border-b border-slate-100 pb-0 sm:mt-5 sm:gap-2"',
    );
    expect(source).toContain(
      '"shrink-0 whitespace-nowrap rounded-t-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:py-2.5 sm:text-sm "',
    );
  });

  it("lets report tables scroll horizontally with stable readable column widths on iPhone", () => {
    expect(source).toContain('className="min-w-[520px] w-full text-sm sm:min-w-0"');
    expect(source).toContain('className="min-w-[460px] w-full text-xs sm:min-w-0"');
  });

  it("does not ellipsize important investment labels", () => {
    expect(source).toContain(
      'className="font-black leading-snug text-slate-900 break-words"',
    );
    expect(source).not.toContain('className="truncate font-black text-slate-900"');
  });

  it("keeps REPORTS-CORRECTNESS-1 stock/flow and export semantics intact", () => {
    expect(normalized).toContain("cashFlowAfterExpense");
    expect(normalized).toContain("allocationRate");
    expect(normalized).toContain("assetAllocationTotal");
    expect(normalized).toContain("...periodMonthly.map((row) => [");
    expect(normalized).toContain("reportFileToken");
    expect(source).not.toContain("summary.savingRate");
  });
});
