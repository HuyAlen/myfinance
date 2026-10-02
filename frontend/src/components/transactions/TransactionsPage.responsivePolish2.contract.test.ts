import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("TRANSACTIONS-RESPONSIVE-POLISH-2 — mobile-first interaction & desktop density", () => {
  it("uses a compact two-column KPI grid on iPhone instead of a horizontal KPI carousel", () => {
    expect(source).toContain(
      'className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3 xl:grid-cols-4"',
    );
    expect(source).not.toContain(
      "overflow-x-auto px-1 pb-1 scrollbar-none",
    );
  });

  it("gives all transaction-type filters a 44px mobile touch target in a four-column control", () => {
    expect(source).toContain(
      "grid w-full grid-cols-4 gap-1 rounded-2xl",
    );
    expect(source).toContain(
      "min-h-11 shrink-0 whitespace-nowrap rounded-xl px-2 py-2 text-xs",
    );
  });

  it("moves secondary mobile actions behind one overflow menu and keeps desktop utilities separate", () => {
    expect(source).toContain(
      "const [showMobileActions, setShowMobileActions] = useState(false);",
    );
    expect(source).toContain('aria-label="Mở tác vụ giao dịch"');
    expect(source).toContain("<MoreHorizontal size={18} />");
    expect(source).toContain("Nhập CSV");
    expect(source).toContain("Xuất CSV");
    expect(source).toContain("sm:hidden");
    expect(source).toContain("sm:flex");
  });

  it("keeps Filter secondary instead of competing with the selected transaction type", () => {
    expect(source).toContain(
      '"border-blue-200 bg-blue-50 text-blue-700 shadow-sm"',
    );
    expect(source).not.toContain(
      '(showFilters || hasActiveFilters\n                    ? "bg-blue-600 text-white shadow-sm"',
    );
  });

  it("uses one desktop sticky column header and non-sticky date-group headers", () => {
    expect(source).toContain(
      "sticky top-0 z-10 hidden grid-cols-[36px_1.25fr_128px_170px_96px_142px_72px]",
    );
    expect(source).toContain(
      "relative z-1 border-b border-slate-100 bg-slate-50/95",
    );
    expect(source).not.toContain(
      "sticky top-0 z-1 border-b border-slate-100 bg-slate-50/95",
    );
  });

  it("lets finance-main own vertical scrolling without a sticky filter command bar", () => {
    expect(source).toContain("SECTION 2 · Smart Filter Command Bar");
    expect(source).toContain('<div className="relative z-20">');
    expect(source).not.toContain('<div className="sticky top-0 z-20">');
  });

  it("reduces hero and summary density while preserving transaction semantics", () => {
    expect(source).toContain("sm:px-5 sm:py-4");
    expect(source).toContain("sm:text-[2.35rem]");
    expect(source).toContain("sm:p-3.5");
    expect(source).toContain("sm:py-1.5 sm:text-[10px]");
    expect(source).toContain("getSignedAmountText(netCashFlow)");
  });
});
