import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE KPI LABEL — TRUNCATION FIX, then SINGLE-LINE POLISH.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * History: the size-polish ticket bumped the label to 14px but left the
 * pre-existing `truncate` class in place, so "Thanh khoản" ellipsized to
 * "Thanh kho...". The next ticket fixed that by switching to
 * `line-clamp-2` + `whitespace-normal` (wraps up to 2 lines, never
 * ellipsized) — correct, but visually "Thanh / khoản" on two lines read
 * as less clean than intended. THIS ticket keeps the "never ellipsized"
 * guarantee but restores a single line by shrinking the mobile label to
 * 12.5px (down from 14px, still well above the original 9px) with a tiny
 * `-0.01em` tracking assist, so it fits `whitespace-nowrap` without
 * wrapping OR ellipsizing on real iPhone widths. Desktop is untouched
 * throughout — `sm:line-clamp-1` (visually identical to the original
 * `truncate`) was never touched by any of these three tickets.
 */
describe("DashboardPage HeroMini mobile label — single line, no ellipsis, no wrap", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  function extractLabelClassName() {
    const start = source.indexOf('<p className="whitespace-nowrap');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('">', start);
    return source.slice(start, end);
  }

  it('mobile label never uses truncate/text-ellipsis — "Thanh khoản" can never render as "Thanh kho..."', () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).not.toContain("truncate");
    expect(labelClassName).not.toContain("text-ellipsis");
  });

  it("mobile label no longer wraps or clamps to multiple lines — line-clamp-2/whitespace-normal from the prior ticket were removed in favor of a single-line fit", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).not.toContain("line-clamp-2");
    expect(labelClassName).not.toContain("whitespace-normal");
    expect(labelClassName).toContain("whitespace-nowrap");
  });

  it("mobile label is 12.5px (down from the prior ticket's 14px, still well above the original 9px) with a small negative tracking assist, reverting tracking to normal at sm and up", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("text-[12.5px]");
    expect(labelClassName).toContain("font-semibold");
    expect(labelClassName).toContain("tracking-[-0.01em]");
    expect(labelClassName).toContain("sm:tracking-normal");
  });

  it("desktop keeps the exact original single-line-with-ellipsis behavior (sm:line-clamp-1, 9px), untouched across all three label tickets", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("sm:line-clamp-1");
    expect(labelClassName).toContain("sm:text-[9px]");
    expect(labelClassName).toContain("sm:leading-3.5");
    // Untouched — only ever applied at xl/2xl.
    expect(labelClassName).toContain("xl:text-[8px] 2xl:text-[10px]");
  });

  it("the outer card's mobile-only overflow-hidden safety net (from the size-polish ticket) is still in place as a defensive backstop, in case any label/value estimate is ever slightly off", () => {
    const start = source.indexOf("function HeroMini({");
    const end = source.indexOf("\nfunction KpiCard(", start);
    const heroMiniSource = source.slice(start, end);

    expect(heroMiniSource).toContain("overflow-hidden");
    expect(heroMiniSource).toContain("sm:overflow-visible");
  });

  it("the value paragraph is completely untouched by this label-only fix — still whitespace-nowrap, still the same responsive clamp() from the size-polish ticket", () => {
    const start = source.indexOf("function HeroMini({");
    const end = source.indexOf("\nfunction KpiCard(", start);
    const heroMiniSource = source.slice(start, end);

    expect(heroMiniSource).toContain(
      "mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,16px)]",
    );
    expect(heroMiniSource).toContain("sm:text-[clamp(8px,2.35vw,13px)]");
  });

  it("the size-polish ticket's card min-height, padding, icon box, and 2-column grid are untouched by this label-only fix", () => {
    const start = source.indexOf("function HeroMini({");
    const end = source.indexOf("\nfunction KpiCard(", start);
    const heroMiniSource = source.slice(start, end);

    expect(heroMiniSource).toContain("min-h-[100px]");
    expect(heroMiniSource).toContain("sm:min-h-0");
    expect(heroMiniSource).toContain("p-3");
    expect(heroMiniSource).toContain("size-8 shrink-0");
    expect(source).toContain(
      "mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5",
    );
  });

  it("the text container still uses min-w-0 flex-1 (correct for a shrinkable flex sibling) — was never the actual cause of the truncation and was not touched", () => {
    const start = source.indexOf("function HeroMini({");
    const end = source.indexOf("\nfunction KpiCard(", start);
    const heroMiniSource = source.slice(start, end);

    expect(heroMiniSource).toContain('<div className="min-w-0 flex-1">');
  });

  it("all 5 KPI card labels/values/colors are unchanged — no business logic touched by this UI-only fix", () => {
    expect(source).toContain('label="Thanh khoản"');
    expect(source).toContain("value={formatVND(summary.liquidBalance)}");
    expect(source).toContain('label="Tiết kiệm"');
    expect(source).toContain(
      "value={formatVND(savingsSnapshot.totalSavings)}",
    );
    expect(source).toContain('label="Vốn Forex"');
    expect(source).toContain("value={formatVND(forexSnapshot.balance)}");
    expect(source).toContain('label="Đầu tư khác"');
    expect(source).toContain("value={formatVND(summary.investmentAssets)}");
    expect(source).toContain('label="Nợ phải trả"');
    expect(source).toContain("value={formatVND(summary.totalDebt)}");
  });
});
