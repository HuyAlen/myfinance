import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRANSACTIONS-MOBILE-POLISH-2 — Compact Liquidity Hero & First-Viewport
 * Ledger Priority.
 *
 * Source-inspection, matching the Transactions page's existing no-RTL test
 * convention. This ticket is visual-only: mobile summary chrome is compressed
 * so the command bar / ledger enters the first viewport sooner, while the
 * established sm+ information hierarchy and all transaction logic stay intact.
 */
describe("Transactions mobile summary prioritizes the ledger", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const sectionStart = source.indexOf("{/* SECTION 1 · Transaction Summary */}");
  const commandBarStart = source.indexOf(
    "SECTION 2 · Smart Filter Command Bar (sticky)",
    sectionStart,
  );
  const sectionSource = source.slice(sectionStart, commandBarStart);

  it("compresses the mobile section header and create CTA without weakening the sm+ hierarchy", () => {
    expect(sectionStart).toBeGreaterThan(-1);
    expect(commandBarStart).toBeGreaterThan(sectionStart);
    expect(sectionSource).toContain(
      'className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-6"',
    );
    expect(sectionSource).toContain(
      "text-2xl font-black tracking-tight text-slate-900 sm:mt-1 sm:text-3xl",
    );
    expect(sectionSource).toContain("min-h-11");
    expect(sectionSource).toContain("py-2.5");
    expect(sectionSource).toContain("sm:py-3");
  });

  it("turns the four mobile summary cards into one horizontal rail instead of a 2x2 vertical block", () => {
    expect(sectionSource).toContain(
      'className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none sm:mx-0 sm:mt-4 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4"',
    );
    expect(sectionSource).not.toContain(
      'className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4"',
    );
  });
});

describe("LiquidityHeroCard is compact at the mobile breakpoint", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const heroStart = source.indexOf("function LiquidityHeroCard({");
  const heroEnd = source.indexOf("function SummaryCard({", heroStart);
  const heroSource = source.slice(heroStart, heroEnd);

  it("uses compact mobile shell/icon/value sizing and restores the richer hero at sm+", () => {
    expect(heroStart).toBeGreaterThan(-1);
    expect(heroEnd).toBeGreaterThan(heroStart);
    expect(heroSource).toContain("rounded-2xl");
    expect(heroSource).toContain("px-4 py-3.5");
    expect(heroSource).toContain("sm:rounded-[26px]");
    expect(heroSource).toContain("sm:px-6 sm:py-6");
    expect(heroSource).toContain("size-10");
    expect(heroSource).toContain("sm:size-12");
    expect(heroSource).toContain("text-[1.75rem]");
    expect(heroSource).toContain("sm:text-[2.7rem]");
  });

  it("does not spend mobile height on decorative blobs or the explanatory paragraph", () => {
    expect(heroSource).toContain(
      "hidden size-52 rounded-full bg-white/10 sm:block",
    );
    expect(heroSource).toContain(
      "hidden size-56 rounded-full bg-indigo-400/25 sm:block",
    );
    expect(heroSource).toContain(
      'className="mt-2 hidden max-w-2xl text-sm font-semibold leading-5 text-blue-50/95 sm:block"',
    );
    expect(heroSource).toContain(
      "Tổng số dư có thể dùng ngay để chi tiêu, thanh toán hoặc thực hiện",
    );
  });

  it("flattens period cash flow into a divider row on mobile instead of a nested glass card", () => {
    expect(heroSource).toContain(
      "border-t border-white/15 pt-2.5 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/10 sm:px-4 sm:py-4",
    );
    expect(heroSource).toContain("sm:hidden");
    expect(heroSource).toContain("sm:flex");
    expect(heroSource).toContain("Dòng tiền kỳ này");
    expect(heroSource).toContain("getSignedAmountText(netCashFlow)");
  });

  it("shortens wallet-count copy only on mobile while preserving the full sm+ label", () => {
    expect(heroSource).toContain(
      '<span className="sm:hidden">{walletCount} ví</span>',
    );
    expect(heroSource).toContain(
      '<span className="hidden sm:inline">',
    );
    expect(heroSource).toContain("{walletCount} ví đang hoạt động");
  });
});

describe("SummaryCard keeps all metrics but reduces mobile action density", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const cardStart = source.indexOf("function SummaryCard({");
  const cardEnd = source.indexOf("function EmptyState({", cardStart);
  const cardSource = source.slice(cardStart, cardEnd);

  it("uses a compact fixed mobile rail width and returns to fluid cards at sm+", () => {
    expect(cardSource).toContain("min-w-[9.25rem]");
    expect(cardSource).toContain("rounded-2xl");
    expect(cardSource).toContain("p-2.5");
    expect(cardSource).toContain("sm:min-w-0");
    expect(cardSource).toContain("sm:rounded-3xl");
    expect(cardSource).toContain("sm:p-4");
  });

  it("keeps footer metrics available on mobile rather than hiding them for viewport compression", () => {
    expect(cardSource).toContain('<span className="sm:hidden">{mobileFooterText}</span>');
    expect(cardSource).toContain('<span className="hidden truncate sm:inline">{footerLabel}</span>');
    expect(cardSource).toContain('<span className="hidden shrink-0 sm:inline">{footerValue}</span>');
  });
});
