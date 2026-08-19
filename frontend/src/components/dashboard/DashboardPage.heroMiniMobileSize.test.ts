import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE DASHBOARD KPI CARD SIZE POLISH V2.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching this file's established sibling
 * tests (DashboardPage.heroProgressiveReadiness.test.ts etc.).
 *
 * Proves the 5 HeroMini KPI cards (Thanh khoản / Tiết kiệm / Vốn Forex /
 * Đầu tư khác / Nợ phải trả) got a mobile-only size increase — larger
 * min-height, padding, icon box, and label/value typography below the
 * `sm:` breakpoint (the same breakpoint this exact component already uses
 * to distinguish "mobile 2-column" from "tablet/desktop 3+/5-column"
 * grid) — while every increased property is explicitly reverted back to
 * its original value at `sm:` and up, so desktop is provably unchanged.
 */
describe("DashboardPage HeroMini mobile KPI card size (V2 polish)", () => {
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

  it("adds a mobile min-height and reverts it to auto (min-h-0) at sm and up", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("min-h-[100px]");
    expect(heroMiniSource).toContain("sm:min-h-0");
  });

  it("increases mobile card padding (p-3) and reverts to the original px-2.5/py-3 at sm and up", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain(" p-3 ");
    expect(heroMiniSource).toContain("sm:px-2.5");
    expect(heroMiniSource).toContain("sm:py-3");
  });

  it("increases the mobile icon box (size-8) and reverts to the original size-7 at sm and up", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("size-8 shrink-0");
    expect(heroMiniSource).toContain("sm:size-7");
  });

  it("increases mobile label size well above the original 9px, and reverts to it at sm and up (exact mobile size was later tuned for a single-line fit — see DashboardPage.heroMiniLabelWrap.test.ts)", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("font-semibold");
    expect(heroMiniSource).toContain("sm:text-[9px]");
    expect(heroMiniSource).toContain("sm:leading-3.5");
    // Untouched — these only ever applied at xl/2xl and still do.
    expect(heroMiniSource).toContain("xl:text-[8px] 2xl:text-[10px]");
  });

  it("increases mobile value size via a taller responsive clamp() and reverts to the exact original clamp() at sm and up — preserving the original's viewport-proportional anti-overflow behavior rather than a fixed px value", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("clamp(12px,3.5vw,16px)");
    expect(heroMiniSource).toContain("sm:text-[clamp(8px,2.35vw,13px)]");
  });

  it("the value stays whitespace-nowrap (never truncated) and the card itself gains overflow-hidden on mobile only, as a defensive safety net against any unexpectedly long VND amount — reverted at sm", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("whitespace-nowrap");
    expect(heroMiniSource).not.toContain("truncate text-[clamp");
    expect(heroMiniSource).toContain("overflow-hidden");
    expect(heroMiniSource).toContain("sm:overflow-visible");
  });

  it("the inner row stretches to the card's full mobile height (h-full) so content centers within the extra room, reverting to auto height at sm", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("flex h-full min-w-0 items-center");
    expect(heroMiniSource).toContain("sm:h-auto");
  });

  it("the loading skeleton's size grows to match the larger value text and reverts at sm — no layout jump when isDashboardReady flips", () => {
    const heroMiniSource = extractHeroMiniSource();
    expect(heroMiniSource).toContain("mt-1.5 h-4 w-16 animate-pulse");
    expect(heroMiniSource).toContain("sm:mt-1 sm:h-3.5");
  });

  it("the 2-column mobile grid (and its sm:3 / xl:5 breakpoints) is completely untouched", () => {
    expect(source).toContain(
      "mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5",
    );
  });

  it("all 5 KPI cards (Thanh khoản/Tiết kiệm/Vốn Forex/Đầu tư khác/Nợ phải trả) still render through the same HeroMini component with their original values/colors — no business logic touched", () => {
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

  it("the Net Worth headline typography is untouched — it must remain visually dominant over the (still smaller) KPI cards", () => {
    expect(source).toContain(
      "text-[clamp(1.05rem,5vw,1.875rem)] font-black leading-none tracking-[-0.04em] tabular-nums text-blue-600 sm:text-5xl",
    );
  });

  it("the Hero section's own outer padding (already 16px on mobile via p-4) is untouched — no redundant additional gutter was introduced", () => {
    expect(source).toContain(
      'className="bg-linear-to-br from-blue-50/80 via-white to-sky-50/80 p-4 sm:p-7"',
    );
  });
});
