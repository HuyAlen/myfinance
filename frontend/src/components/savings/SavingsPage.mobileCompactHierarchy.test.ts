import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-POLISH-3 — Compact mobile financial hierarchy & scroll efficiency.
 *
 * Source-inspection contract for real iPhone widths: account discovery and
 * money actions stay ahead of secondary analytics while the Savings Engine,
 * ledger, settlement, and wallet semantics remain untouched.
 */
describe("SavingsPage compact mobile financial hierarchy", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  const heroStart = source.indexOf("SAVINGS-POLISH-3");
  const accountsStart = source.indexOf("{/* SAVING ACCOUNTS */}", heroStart);
  const progressStart = source.indexOf("{/* SAVINGS PROGRESS", accountsStart);
  const analyticsStart = source.indexOf("{/* SAVINGS ANALYTICS */}", progressStart);
  const timelineStart = source.indexOf(
    "{/* RECENT SAVINGS TIMELINE */}",
    analyticsStart,
  );
  const editFlowStart = source.indexOf(
    "/* SAVINGS-UX-1: create/edit metadata is intentionally separate",
    timelineStart,
  );

  const hero = source.slice(heroStart, accountsStart);
  const accounts = source.slice(accountsStart, progressStart);
  const progress = source.slice(progressStart, analyticsStart);
  const analytics = source.slice(analyticsStart, timelineStart);
  const timeline = source.slice(timelineStart, editFlowStart);

  it("keeps the mobile hero compact with a 2x2 KPI snapshot", () => {
    expect(hero).toContain(
      "mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4",
    );
    expect(hero).toContain(
      "inline-flex min-h-10 shrink-0 items-center justify-center",
    );
    expect(source).toContain(
      "rounded-2xl border border-[#E3EAF1] bg-[#F8FBFE] p-3",
    );
  });

  it("puts search, filters, account cards, and money actions before secondary insight sections", () => {
    expect(accountsStart).toBeGreaterThan(heroStart);
    expect(progressStart).toBeGreaterThan(accountsStart);
    expect(accounts).toContain("Tìm khoản tiết kiệm...");
    expect(accounts).toContain('openMoneyMovementModal(item, "deposit")');
    expect(accounts).toContain('openMoneyMovementModal(item, "withdraw")');
    expect(accounts).toContain("openHistoryModal(item)");
  });

  it("keeps filter pills explicitly horizontally scrollable without clipping labels", () => {
    expect(accounts).toContain("snap-x snap-proximity");
    expect(accounts).toContain("overflow-x-auto");
    expect(accounts).toContain("snap-start");
    expect(accounts).toContain("whitespace-nowrap");
    expect(accounts).toContain("h-11 w-full rounded-xl");
  });

  it("reduces account-card chrome while preserving balance-first hierarchy", () => {
    expect(accounts).toContain(
      "group rounded-2xl border bg-white p-3.5 transition sm:p-4",
    );
    expect(accounts).toContain('id={`saving-card-${item.id}`}');
    expect(accounts).toContain("highlightedSavingId === item.id");
    expect(accounts).toContain('"border-[#DCE6EF]"');
    expect(accounts).toContain("Số dư hiện tại");
    expect(accounts).toContain("border-t border-[#E8EEF4] pt-3");
    expect(accounts).toContain("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4");
    expect(accounts).toContain("min-h-10");
  });

  it("keeps emergency progress readable but lower priority than account actions", () => {
    expect(progress).toContain("mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3");
    expect(progress).toContain("shrink-0 text-2xl font-black");
    expect(progress).toContain("mt-3 h-2 overflow-hidden rounded-full");
    expect(progress).toContain("Dự phóng số dư");
  });

  it("keeps savings analytics dense and low-chrome", () => {
    expect(analytics).toContain("mt-4 grid grid-cols-3 gap-2 sm:gap-3");
    expect(analytics).toContain("border-t border-[#E8EEF4] pt-3");
    expect(analytics).not.toContain(
      "shadow-[0_6px_18px_rgba(54,83,107,0.06)]",
    );
  });

  it("makes recent activity flatter while preserving amount prominence", () => {
    expect(timeline).toContain("divide-y divide-[#E8EEF4]");
    expect(timeline).toContain(
      "flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0",
    );
    expect(timeline).toContain(
      "shrink-0 text-right text-[13px] font-black tabular-nums sm:text-sm",
    );
    expect(timeline).toContain("truncate text-sm font-black text-[#36536B]");
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
