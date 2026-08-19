import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE KPI LABEL TRUNCATION FIX.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * Root cause: the previous size-polish ticket bumped the HeroMini label to
 * 14px but never removed the pre-existing `truncate` class (overflow:
 * hidden + text-overflow: ellipsis + white-space: nowrap) — so at the
 * larger font size, in the same narrow 2-column mobile card, "Thanh
 * khoản" no longer fit on one line and rendered as "Thanh kho...". This
 * fix replaces `truncate` with `line-clamp-2` + `whitespace-normal` on
 * mobile (label may wrap up to 2 lines, never ellipsized), while desktop
 * keeps the exact original single-line-with-ellipsis behavior via
 * `sm:line-clamp-1` (functionally identical to the original `truncate`,
 * but expressed as the same utility family as the mobile override so the
 * `sm:` breakpoint is guaranteed to cleanly win the cascade — mixing
 * `truncate`/`line-clamp-none` across breakpoints risks each ambiguously
 * fighting over the `overflow`/`display` properties they both touch).
 */
describe("DashboardPage HeroMini mobile label no longer truncates (wraps instead)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  function extractLabelClassName() {
    const start = source.indexOf(
      '<p className="line-clamp-2 whitespace-normal',
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('">', start);
    return source.slice(start, end);
  }

  it('mobile label no longer uses truncate (overflow-hidden + ellipsis + nowrap) — "Thanh khoản" can never render as "Thanh kho..."', () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).not.toContain("truncate");
    expect(labelClassName).not.toContain("text-ellipsis");
  });

  it("mobile label allows wrapping (whitespace-normal) up to a hard 2-line cap (line-clamp-2) — never ellipsized, never unbounded", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("line-clamp-2");
    expect(labelClassName).toContain("whitespace-normal");
  });

  it("desktop keeps the original single-line-with-ellipsis behavior, via the same line-clamp utility family (not a mismatched truncate/line-clamp-none pairing that risks a cascade conflict)", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("sm:line-clamp-1");
    expect(labelClassName).not.toContain("sm:truncate");
    expect(labelClassName).not.toContain("line-clamp-none");
  });

  it("the enlarged mobile label size/weight from the size-polish ticket is preserved (14px, semibold), reverting to the original 9px at sm and up", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("text-[14px]");
    expect(labelClassName).toContain("font-semibold");
    expect(labelClassName).toContain("sm:text-[9px]");
    // Untouched — only ever applied at xl/2xl.
    expect(labelClassName).toContain("xl:text-[8px] 2xl:text-[10px]");
  });

  it("leading is relaxed to leading-tight for comfortable 2-line wrapping on mobile, reverting to the original leading-3.5 at sm and up", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("leading-tight");
    expect(labelClassName).toContain("sm:leading-3.5");
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

  it("the size-polish ticket's card min-height and 2-column grid are untouched by this label-only fix", () => {
    const start = source.indexOf("function HeroMini({");
    const end = source.indexOf("\nfunction KpiCard(", start);
    const heroMiniSource = source.slice(start, end);

    expect(heroMiniSource).toContain("min-h-[100px]");
    expect(heroMiniSource).toContain("sm:min-h-0");
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
