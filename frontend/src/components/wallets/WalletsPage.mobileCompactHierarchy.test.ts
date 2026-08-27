import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WALLETS-MOBILE-POLISH-1 — Compact Wallet Hierarchy & Action Density.
 * Presentation-only source contract. Correctness/readiness/mutation semantics
 * stay owned by WALLETS-CORRECTNESS-1.
 */
describe("WALLETS-MOBILE-POLISH-1 — compact mobile wallet hierarchy", () => {
  const source = readFileSync(
    path.resolve(__dirname, "WalletsPage.tsx"),
    "utf8",
  );

  it("keeps the overview compact and places the two primary mobile actions on one row", () => {
    expect(source).toContain(
      'className="space-y-3.5 overflow-x-hidden pb-24 md:space-y-6 md:pb-0"',
    );
    expect(source).toContain(
      'className="grid grid-cols-2 gap-2 sm:flex sm:flex-row"',
    );
    expect(source).toContain(
      'rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-4xl sm:p-6',
    );
  });

  it("renders wallet-type classification as a compact read-only 2+1 mobile summary", () => {
    const start = source.indexOf("{/* SECTION 2 · Wallet Types */}");
    const end = source.indexOf("SECTION 3 · Wallet List", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = source.slice(start, end);

    expect(section).toContain('className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3"');
    expect(section).toContain('index === 2 ? "col-span-2 sm:col-span-1" : ""');
    expect(section).toContain("walletStats.map((stat, index) => {");
    expect(section).toContain("formatCompactWalletAmount(stat.total)");
    expect(section).not.toContain("openEditForm(");
    expect(section).not.toContain("setIsFormOpen(true)");
  });

  it("uses a single mobile overflow affordance for edit/delete while keeping desktop hover actions", () => {
    expect(source).toContain('<details className="group/actions relative sm:hidden">');
    expect(source).toContain("<MoreHorizontal size={17} />");
    expect(source).toContain(
      'className="hidden shrink-0 gap-1.5 opacity-0 transition-opacity sm:flex sm:group-hover:opacity-100"',
    );
    expect(source).toContain("Sửa ví");
    expect(source).toContain("Xóa ví");
  });

  it("collapses mobile monthly flow into one line and removes ambiguous N/K formatting", () => {
    expect(source).toContain(
      'className="mt-3 flex min-w-0 items-center justify-between gap-1 rounded-xl bg-slate-50 px-2.5 py-2 text-[10px] sm:hidden"',
    );
    expect(source).toContain("formatCompactWalletAmount(flow.income)");
    expect(source).toContain("formatCompactWalletAmount(flow.expense)");
    expect(source).toContain("formatCompactWalletAmount(net)");
    expect(source).not.toContain('Math.round(flow.income / 1e3) + "K"');
    expect(source).not.toContain('Math.round(flow.expense / 1e3) + "K"');
    expect(source).not.toContain(')}N`');
  });

  it("keeps full money values for balances while using compact amounts only for supporting summaries", () => {
    expect(source).toContain("{formatVND(wallet.balance)}");
    expect(source).toContain("function formatCompactWalletAmount(value: number)");
    expect(source).toContain('return `${compactFormatter.format(absolute / 1_000_000)} tr đ`;');
    expect(source).toContain('return `${fullFormatter.format(Math.round(absolute))} đ`;');
    expect(source).toContain('return `${compactFormatter.format(absolute / 1_000_000_000)} tỷ đ`;');
    expect(source).not.toContain('return `${formatter.format(absolute / 1_000)}N`;');
  });

  it("clarifies linked transaction metadata and preserves two 44px primary card actions", () => {
    expect(source).toContain('· {txCount === null ? "—" : txCount} GD liên kết');
    expect(source).toContain('<span className="sm:hidden">Chuyển</span>');
    expect(source).toContain('<span className="hidden sm:inline">Chuyển tiền</span>');
    expect(source).toContain("min-h-11");
  });
});
