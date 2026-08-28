import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-MOBILE-POLISH-2 — Compact Financial Hierarchy & Scroll Efficiency.
 *
 * Source-inspection contract for the real-iPhone layout: reduce repeated tall
 * cards, keep the most important values legible, preserve horizontal filter
 * affordance, and leave Savings Engine / money-movement semantics untouched.
 */
describe("SavingsPage compact mobile financial hierarchy", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  const heroStart = source.indexOf("SAVINGS-MOBILE-POLISH-2");
  const progressStart = source.indexOf("{/* SAVINGS PROGRESS", heroStart);
  const analyticsStart = source.indexOf("{/* SAVINGS ANALYTICS", progressStart);
  const searchStart = source.indexOf("{/* SEARCH + FILTERS */}", analyticsStart);
  const accountsStart = source.indexOf("{/* SAVING ACCOUNTS */}", searchStart);
  const timelineStart = source.indexOf(
    "{/* RECENT SAVINGS TIMELINE */}",
    accountsStart,
  );
  const editFlowStart = source.indexOf(
    "/* SAVINGS-UX-1: create/edit metadata is intentionally separate",
    timelineStart,
  );

  const hero = source.slice(heroStart, progressStart);
  const progress = source.slice(progressStart, analyticsStart);
  const analytics = source.slice(analyticsStart, searchStart);
  const search = source.slice(searchStart, accountsStart);
  const accounts = source.slice(accountsStart, timelineStart);
  const timeline = source.slice(timelineStart, editFlowStart);

  it("compresses the mobile hero into a 2x2 KPI snapshot", () => {
    expect(hero).toContain(
      "mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-3 xl:grid-cols-4",
    );
    expect(hero).toContain(
      "mt-1.5 hidden max-w-2xl text-sm font-medium leading-6",
    );
    expect(hero).toContain(
      "inline-flex min-h-10 items-center justify-center",
    );
    expect(source).toContain(
      "rounded-2xl border p-3 shadow-[0_4px_12px_rgba(54,83,107,0.06)]",
    );
  });

  it("keeps emergency progress readable while showing its three key figures in one mobile row", () => {
    expect(progress).toContain(
      "mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3",
    );
    expect(progress).toContain("text-3xl font-black");
    expect(progress).toContain("h-2.5 overflow-hidden rounded-full");
    expect(source).toContain(
      "text-[10px] font-black leading-tight tracking-tight sm:text-sm",
    );
  });

  it("turns growth projections into one compact mobile list rather than three large cards", () => {
    expect(progress).toContain(
      "divide-y divide-[#E5EDF4] overflow-hidden rounded-2xl",
    );
    expect(progress).toContain(
      "px-3 py-2.5 sm:rounded-2xl sm:border sm:border-blue-100",
    );
  });

  it("keeps savings analytics dense with three-up mobile metrics", () => {
    expect(analytics).toContain(
      "mt-4 grid grid-cols-3 gap-2 sm:mt-5 sm:gap-3",
    );
    expect(analytics).toContain(
      "mt-4 rounded-2xl border border-[#E5EDF4] bg-[#F8FBFE] p-3",
    );
  });

  it("makes filter pills explicitly horizontally scrollable without clipping labels", () => {
    expect(search).toContain("snap-x snap-proximity");
    expect(search).toContain("overflow-x-auto");
    expect(search).toContain("snap-start");
    expect(search).toContain("whitespace-nowrap");
    expect(search).toContain("h-11 w-full rounded-xl");
  });

  it("reduces account-card chrome while preserving direct money actions", () => {
    expect(accounts).toContain(
      "group rounded-2xl border bg-white p-4",
    );
    expect(accounts).toContain('id={`saving-card-${item.id}`}');
    expect(accounts).toContain("highlightedSavingId === item.id");
    expect(accounts).toContain('"border-[#DCE6EF]"');
    expect(accounts).toContain("mt-3 grid grid-cols-3 gap-2 sm:mt-4");
    expect(accounts).toContain("min-h-9");
    expect(accounts).toContain('openMoneyMovementModal(item, "deposit")');
    expect(accounts).toContain('openMoneyMovementModal(item, "withdraw")');
    expect(accounts).toContain("openHistoryModal(item)");
  });

  it("makes recent activity denser while preserving amount prominence", () => {
    expect(timeline).toContain(
      "gap-3 bg-white px-3 py-3 sm:gap-4 sm:px-4 sm:py-3.5",
    );
    expect(timeline).toContain(
      "shrink-0 text-[13px] font-black sm:text-sm",
    );
    expect(timeline).toContain("truncate text-sm font-black text-[#24384B]");
  });

  it("does not change authoritative savings and wallet semantics", () => {
    expect(source).toContain("hasUnknownWalletBalance");
    expect(source).toContain("Không thể tải số dư");
    expect(source).toContain("createSavingAccount({");
    expect(source).toContain("createSavingMovement({");
    expect(source).toContain(
      "SAVINGS-UX-1.5: natural iPhone rhythm — cohesive content stack",
    );
    expect(source).toContain(
      'readOnly={transactionForm.type === "settlement"}',
    );
  });
});
