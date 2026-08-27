import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASH-MOBILE-POLISH-2.2 — HeroMini label hierarchy regression contract.
 *
 * The professional-density pass intentionally made the mobile HeroMini
 * surface more compact. These tests preserve the important behavior
 * (single-line, no ellipsis/wrap, safe overflow, responsive desktop sizing)
 * without pinning the component to the previous ticket's larger dimensions.
 */
describe("DashboardPage HeroMini mobile label — compact single-line contract", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  function extractHeroMiniSource() {
    const start = source.indexOf("function HeroMini({");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("\nfunction KpiCard(", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  function extractLabelClassName() {
    const heroMiniSource = extractHeroMiniSource();
    const start = heroMiniSource.indexOf('<p className="whitespace-nowrap');
    expect(start).toBeGreaterThan(-1);
    const end = heroMiniSource.indexOf('">', start);
    expect(end).toBeGreaterThan(start);
    return heroMiniSource.slice(start, end);
  }

  it('never ellipsizes or wraps the mobile label', () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("whitespace-nowrap");
    expect(labelClassName).not.toContain("truncate");
    expect(labelClassName).not.toContain("text-ellipsis");
    expect(labelClassName).not.toContain("line-clamp-2");
    expect(labelClassName).not.toContain("whitespace-normal");
  });

  it("uses the professional-density mobile label size while preserving the established desktop sizes", () => {
    const labelClassName = extractLabelClassName();
    expect(labelClassName).toContain("text-[11.5px]");
    expect(labelClassName).toContain("font-bold");
    expect(labelClassName).toContain("sm:font-semibold");
    expect(labelClassName).toContain("tracking-[-0.01em]");
    expect(labelClassName).toContain("sm:text-[9px]");
    expect(labelClassName).toContain("sm:leading-3.5");
    expect(labelClassName).toContain("sm:tracking-normal");
    expect(labelClassName).toContain("xl:text-[8px] 2xl:text-[10px]");
  });

  it("keeps overflow protection on mobile and relaxes it at sm+", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("overflow-hidden");
    expect(heroMiniSource).toContain("sm:overflow-visible");
  });

  it("keeps values single-line and responsive after the density reduction", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain(
      "mt-1 whitespace-nowrap text-[clamp(12px,3.3vw,15px)]",
    );
    expect(heroMiniSource).toContain("font-extrabold");
    expect(heroMiniSource).toContain("sm:font-bold");
    expect(heroMiniSource).toContain("sm:text-[clamp(8px,2.35vw,13px)]");
  });

  it("keeps the compact card, icon and two-column mobile grid contract", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("min-h-[78px]");
    expect(heroMiniSource).toContain("sm:min-h-0");
    expect(heroMiniSource).toContain("p-3");
    expect(heroMiniSource).toContain("size-7 shrink-0");
    expect(source).toContain(
      "mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-5",
    );
  });

  it("keeps the shrinkable text container", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain('<div className="min-w-0 flex-1">');
  });

  it("keeps all five canonical HeroMini values wired to the same business data", () => {
    expect(source).toContain('label="Thanh khoản"');
    expect(source).toContain("value={formatVND(summary.liquidBalance)}");
    expect(source).toContain('label="Tiết kiệm"');
    expect(source).toContain("value={formatVND(savingsSnapshot.totalSavings)}");
    expect(source).toContain('label="Vốn Forex"');
    expect(source).toContain("value={formatVND(forexSnapshot.balance)}");
    expect(source).toContain('label="Đầu tư khác"');
    expect(source).toContain("value={formatVND(summary.investmentAssets)}");
    expect(source).toContain('label="Nợ phải trả"');
    expect(source).toContain("value={formatVND(summary.totalDebt)}");
  });
});
