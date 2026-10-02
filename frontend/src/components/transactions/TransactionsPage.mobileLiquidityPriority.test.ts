import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRANSACTIONS-RESPONSIVE-POLISH-2
 *
 * Updates the older mobile-liquidity contract to the new responsive design:
 * - iPhone uses a compact 2x2 KPI grid, not a horizontal rail.
 * - hero and summary cards are denser on both mobile and sm+.
 * - all metrics remain present; only redundant mobile footer value copy may be
 *   omitted when the same exact value is already visible as another KPI.
 *
 * Source-inspection only; no financial/data behavior is changed here.
 */
describe("Transactions responsive summary prioritizes the ledger", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const sectionStart = source.indexOf("{/* SECTION 1 · Transaction Summary */}");
  const commandBarStart = source.indexOf(
    "SECTION 2 · Smart Filter Command Bar",
    sectionStart,
  );
  const sectionSource = source.slice(sectionStart, commandBarStart);

  it("keeps the summary header compact and preserves a 44px mobile create target", () => {
    expect(sectionStart).toBeGreaterThan(-1);
    expect(commandBarStart).toBeGreaterThan(sectionStart);
    expect(sectionSource).toContain(
      'className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-5"',
    );
    expect(sectionSource).toContain("min-h-11");
  });

  it("uses a compact 2x2 KPI grid on iPhone and four columns at xl", () => {
    expect(sectionSource).toContain(
      'className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 xl:grid-cols-4"',
    );
    expect(sectionSource).not.toContain(
      "overflow-x-auto px-1 pb-1 scrollbar-none",
    );
  });
});

describe("LiquidityHeroCard follows responsive-polish-2 density", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const heroStart = source.indexOf("function LiquidityHeroCard({");
  const heroEnd = source.indexOf("function SummaryCard({", heroStart);
  const heroSource = source.slice(heroStart, heroEnd);

  it("uses the denser mobile and sm+ hero shell", () => {
    expect(heroStart).toBeGreaterThan(-1);
    expect(heroEnd).toBeGreaterThan(heroStart);
    expect(heroSource).toContain("px-3.5 py-3");
    expect(heroSource).toContain("sm:rounded-[24px]");
    expect(heroSource).toContain("sm:px-5 sm:py-4");
    expect(heroSource).toContain("size-9");
    expect(heroSource).toContain("sm:size-11");
    expect(heroSource).toContain("text-[1.6rem]");
    expect(heroSource).toContain("sm:text-[2.35rem]");
  });

  it("still removes decorative/explanatory height from the mobile first viewport", () => {
    expect(heroSource).toContain(
      "hidden size-52 rounded-full bg-white/10 sm:block",
    );
    expect(heroSource).toContain(
      "hidden size-56 rounded-full bg-indigo-400/25 sm:block",
    );
    expect(heroSource).toContain(
      'className="mt-2 hidden max-w-2xl text-sm font-semibold leading-5 text-blue-50/95 sm:block"',
    );
  });

  it("keeps period cash flow as a compact divider row on mobile", () => {
    expect(heroSource).toContain(
      "border-t border-white/15 pt-2 sm:rounded-2xl sm:border sm:border-white/10 sm:bg-white/10 sm:px-3.5 sm:py-3",
    );
    expect(heroSource).toContain("Dòng tiền kỳ này");
    expect(heroSource).toContain("getSignedAmountText(netCashFlow)");
    expect(heroSource).toContain("sm:hidden");
    expect(heroSource).toContain("sm:flex");
  });

  it("keeps short wallet-count copy on mobile and full copy at sm+", () => {
    expect(heroSource).toContain(
      '<span className="sm:hidden">{walletCount} ví</span>',
    );
    expect(heroSource).toContain("{walletCount} ví đang hoạt động");
  });
});

describe("SummaryCard uses the 2x2 mobile-grid contract", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const cardStart = source.indexOf("function SummaryCard({");
  const cardEnd = source.indexOf("function EmptyState({", cardStart);
  const cardSource = source.slice(cardStart, cardEnd);

  it("is fluid inside the 2x2 grid instead of keeping a fixed rail width", () => {
    expect(cardSource).toContain("flex min-w-0 flex-col rounded-2xl");
    expect(cardSource).toContain("p-2.5");
    expect(cardSource).toContain("sm:rounded-3xl");
    expect(cardSource).toContain("sm:p-3.5");
    expect(cardSource).not.toContain('min-w-[9.25rem]');
  });

  it("keeps mobile footer meaning while preventing overflow in narrow cells", () => {
    expect(cardSource).toContain(
      '<span className="truncate sm:hidden">{mobileFooterText}</span>',
    );
    expect(cardSource).toContain(
      '<span className="hidden truncate sm:inline">{footerLabel}</span>',
    );
    expect(cardSource).toContain(
      '<span className="hidden shrink-0 sm:inline">{footerValue}</span>',
    );
    expect(cardSource).toContain("hideFooterValueOnMobile");
  });
});
