import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASH-MOBILE-POLISH-1 + DASH-COLOR-POLISH-1.1.
 *
 * Source-inspection regression contract for the compact HeroMini sizing and
 * refined light financial palette. Business wiring/readiness is intentionally
 * outside this visual contract.
 */
describe("DashboardPage HeroMini mobile KPI professional density", () => {
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

  it("uses the compact mobile min-height and returns to auto height at sm+", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("min-h-[78px]");
    expect(heroMiniSource).toContain("sm:min-h-0");
    expect(heroMiniSource).not.toContain("min-h-[100px]");
  });

  it("keeps compact p-3 mobile padding and the established sm padding", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain(" p-3 ");
    expect(heroMiniSource).toContain("sm:px-2.5");
    expect(heroMiniSource).toContain("sm:py-3");
  });

  it("uses one compact size-7 icon box across mobile and sm+", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("size-7 shrink-0");
    expect(heroMiniSource).toContain("sm:size-7");
    expect(heroMiniSource).not.toContain("size-8 shrink-0");
  });

  it("uses the compact responsive mobile value clamp and preserves the established desktop clamp", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("clamp(12px,3.3vw,15px)");
    expect(heroMiniSource).toContain("sm:text-[clamp(8px,2.35vw,13px)]");
  });

  it("keeps value no-wrap and mobile overflow safety", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("whitespace-nowrap");
    expect(heroMiniSource).not.toContain("truncate text-[clamp");
    expect(heroMiniSource).toContain("overflow-hidden");
    expect(heroMiniSource).toContain("sm:overflow-visible");
  });

  it("still vertically centers HeroMini content", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("flex h-full min-w-0 items-center");
    expect(heroMiniSource).toContain("sm:h-auto");
  });

  it("keeps the loading skeleton sized for the responsive value line", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("mt-1.5 h-4 w-16 animate-pulse");
    expect(heroMiniSource).toContain("sm:mt-1 sm:h-3.5");
  });

  it("keeps the two-column mobile / three-column tablet / five-column desktop grid", () => {
    expect(source).toContain(
      "mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:grid-cols-3 sm:gap-2.5 xl:grid-cols-5",
    );
  });

  it("keeps all five HeroMini cards wired to the original financial values", () => {
    expect(source).toContain("value={formatVND(summary.liquidBalance)}");
    expect(source).toContain("value={formatVND(savingsSnapshot.totalSavings)}");
    expect(source).toContain("value={formatVND(forexSnapshot.balance)}");
    expect(source).toContain("value={formatVND(summary.investmentAssets)}");
    expect(source).toContain("value={formatVND(summary.totalDebt)}");
  });

  it("keeps Net Worth visually dominant with refined navy typography", () => {
    expect(source).toContain(
      "text-[clamp(1.85rem,8.8vw,2.35rem)] font-black leading-none tracking-[-0.055em] tabular-nums text-[#173A6A] sm:text-5xl",
    );
  });

  it("keeps the refined light Hero surface and mobile p-4 spacing", () => {
    expect(source).toContain(
      'className="bg-linear-to-br from-white via-[#F8FBFF] to-[#EEF5FF] p-4 sm:p-7"',
    );
  });
});
