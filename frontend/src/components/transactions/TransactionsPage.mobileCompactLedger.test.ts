import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TRANSACTIONS-MOBILE-POLISH-1 — Compact Ledger Hierarchy & Single-Line
 * Mobile Integrity.
 *
 * Source-inspection, matching the Transactions page's existing no-RTL test
 * convention. This ticket is visual-only: it compresses the mobile ledger
 * hierarchy without changing transaction classification, period resolution,
 * mutation, delete, pagination, or desktop-table behavior.
 */
describe("mobile day-group header stays compact and single-row", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const headerStart = source.indexOf(
    'className="sticky top-0 z-1 border-b border-slate-100 bg-slate-50/95 px-3 py-1.5 backdrop-blur sm:px-6 sm:py-2.5"',
  );
  const rowsStart = source.indexOf(
    '<div className="divide-y divide-slate-100/80">',
    headerStart,
  );
  const headerSource = source.slice(headerStart, rowsStart);

  it("uses a denser base header while restoring the previous spacing at sm+", () => {
    expect(headerStart).toBeGreaterThan(-1);
    expect(headerSource).toContain("px-3 py-1.5");
    expect(headerSource).toContain("sm:px-6 sm:py-2.5");
  });

  it("keeps date, count and mobile day totals inside one horizontal header row", () => {
    expect(headerSource).toContain(
      'className="flex min-w-0 items-center gap-2 overflow-hidden"',
    );
    expect(headerSource).toContain(
      'className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto text-[9px] font-black scrollbar-none sm:hidden"',
    );

    // Pre-polish mobile totals lived in a second visual row below the date.
    expect(headerSource).not.toContain(
      'className="mt-2 flex max-w-full gap-1.5 overflow-x-auto',
    );
  });

  it("uses a compact count token on mobile and the full label from sm upward", () => {
    expect(headerSource).toContain(
      '<span className="sm:hidden">{txns.length}</span>',
    );
    expect(headerSource).toContain(
      '<span className="hidden sm:inline">',
    );
    expect(headerSource).toContain("{txns.length} giao dịch");
  });

  it("all mobile day-total pills are shrink-0 + whitespace-nowrap so none wraps inside the single header line", () => {
    const mobileTotalsStart = headerSource.indexOf(
      'className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto',
    );
    const desktopTotalsStart = headerSource.indexOf(
      'className="ml-auto hidden items-center gap-2',
      mobileTotalsStart,
    );
    const mobileTotals = headerSource.slice(
      mobileTotalsStart,
      desktopTotalsStart,
    );

    const nowrapPills =
      mobileTotals.split("shrink-0 whitespace-nowrap rounded-full").length - 1;
    expect(nowrapPills).toBe(3);
  });
});

describe("mobile transaction rows use compact ledger hierarchy", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const rowStart = source.indexOf(
    '"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0 border-l-2 px-3 py-2.5',
  );
  const rowEnd = source.indexOf("</div>\n                          </div>", rowStart);
  const rowSource = source.slice(rowStart, rowEnd);

  it("lays out the base mobile row as identity | amount, not stacked blocks", () => {
    expect(rowStart).toBeGreaterThan(-1);
    expect(rowSource).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(rowSource).toContain("items-center");
    expect(rowSource).toContain("gap-y-0");
    expect(rowSource).toContain("px-3 py-2.5");
  });

  it("keeps the established desktop column contract intact at lg", () => {
    expect(rowSource).toContain(
      "lg:grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px]",
    );
    expect(rowSource).toContain("sm:border-l-4 sm:px-6 sm:py-4");
  });

  it("reduces only the mobile identity chrome: 36px icon at base, 44px again at sm", () => {
    expect(rowSource).toContain(
      '"flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm sm:size-11 sm:rounded-2xl " +',
    );
    expect(rowSource).toContain(
      'className="flex min-w-0 items-center gap-2.5 sm:gap-3.5"',
    );
  });

  it("keeps note and metadata to one line each with flexible width rather than hard-coded mobile max widths", () => {
    expect(rowSource).toContain(
      'className="truncate whitespace-nowrap text-[13px] font-black leading-4 text-slate-900',
    );
    expect(rowSource).toContain(
      'className="mt-0.5 truncate whitespace-nowrap text-[10px] font-medium leading-3.5 text-slate-400',
    );
    expect(rowSource).not.toContain("max-w-46");
    expect(rowSource).not.toContain("max-w-52");
  });

  it("places the mobile amount in the same grid row and never wraps/truncates the financial value", () => {
    const amountStart = rowSource.indexOf(
      "{/* Mobile ledger amount: same visual row; actions stay in swipe drawer */}",
    );
    expect(amountStart).toBeGreaterThan(-1);
    const amountSource = rowSource.slice(amountStart);

    expect(amountSource).toContain("shrink-0 whitespace-nowrap text-right");
    expect(amountSource).toContain("tabular-nums lg:hidden");
    expect(amountSource).not.toContain("truncate whitespace-nowrap text-right");
    expect(amountSource).not.toContain("pl-13");
  });
});

describe("mobile polish removes duplicate inline actions without removing edit/delete access", () => {
  const source = readFileSync(
    path.resolve(__dirname, "TransactionsPage.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("keeps the existing mobile swipe action drawer", () => {
    const swipeStart = source.indexOf("{/* Swipe actions — mobile only */}");
    const rowStart = source.indexOf("grid grid-cols-[minmax(0,1fr)_auto]", swipeStart);
    const swipeSource = source.slice(swipeStart, rowStart);

    expect(swipeStart).toBeGreaterThan(-1);
    expect(swipeSource).toContain("lg:hidden");
    expect(swipeSource).toContain('aria-label="Sửa giao dịch"');
    expect(swipeSource).toContain('aria-label="Xóa giao dịch"');
  });

  it("removes the old always-visible mobile action row, leaving swipe + desktop + Timeline as the three accessible action pairs", () => {
    expect(source).not.toContain("{/* Mobile: compact amount + actions */}");
    expect(source).not.toContain(
      'className="flex items-center justify-between gap-3 pl-13 lg:hidden"',
    );

    expect(source.split('aria-label="Sửa giao dịch"').length - 1).toBe(3);
    expect(source.split('aria-label="Xóa giao dịch"').length - 1).toBe(3);
  });
});
