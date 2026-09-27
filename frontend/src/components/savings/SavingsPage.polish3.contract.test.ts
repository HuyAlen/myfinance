import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAVINGS-POLISH-3 — action-first desktop + mobile presentation contract.
 *
 * Keep Savings Engine / ledger / Supabase semantics untouched while making the
 * page denser, moving search + filters into the account workspace, and putting
 * account actions ahead of secondary analytics in the mobile reading order.
 */
describe("SavingsPage action-first polish", () => {
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
  const insights = source.slice(progressStart, timelineStart);
  const timeline = source.slice(timelineStart, editFlowStart);

  it("keeps the hero quiet and compact while retaining the four primary KPIs", () => {
    expect(hero).toContain(
      "rounded-3xl border border-[#DCE6EF] bg-white px-4 py-4",
    );
    expect(hero).toContain(
      "mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4",
    );
    expect(hero).not.toContain("bg-linear-to-br from-white");
    expect(source).toContain(
      "rounded-2xl border border-[#E3EAF1] bg-[#F8FBFE] p-3",
    );
  });

  it("puts the savings workspace before secondary insights in the source/mobile reading order", () => {
    expect(accountsStart).toBeGreaterThan(heroStart);
    expect(progressStart).toBeGreaterThan(accountsStart);
    expect(analyticsStart).toBeGreaterThan(progressStart);
    expect(timelineStart).toBeGreaterThan(analyticsStart);
  });

  it("merges search and filters into the savings account workspace", () => {
    expect(accounts).toContain("Tìm khoản tiết kiệm...");
    expect(accounts).toContain("snap-x snap-proximity");
    expect(accounts).toContain("overflow-x-auto");
    expect(accounts).toContain("lg:grid-cols-[minmax(240px,0.75fr)_1fr]");
    expect(source).not.toContain("{/* SEARCH + FILTERS */}");
  });

  it("uses flatter account cards with balance-first hierarchy and direct money actions", () => {
    expect(accounts).toContain(
      "group rounded-2xl border bg-white p-3.5 transition sm:p-4",
    );
    expect(accounts).toContain("Số dư hiện tại");
    expect(accounts).toContain("border-t border-[#E8EEF4] pt-3");
    expect(accounts.match(/data-dark-surface="savings-account-meta"/g)?.length).toBe(2);
    expect(accounts).toContain("mt-3 grid grid-cols-3 gap-2");
    expect(accounts).toContain('openMoneyMovementModal(item, "deposit")');
    expect(accounts).toContain('openMoneyMovementModal(item, "withdraw")');
    expect(accounts).toContain("openHistoryModal(item)");
  });

  it("keeps secondary insight surfaces consistent and low-chrome", () => {
    expect(insights).toContain(
      "rounded-3xl border border-[#DCE6EF] bg-white p-4 sm:p-5",
    );
    expect(insights).not.toContain("shadow-[0_6px_18px_rgba(54,83,107,0.06)]");
  });

  it("uses a flatter recent-activity list with the amount aligned as the trailing anchor", () => {
    expect(timeline).toContain("divide-y divide-[#E8EEF4]");
    expect(timeline).not.toContain(
      "overflow-hidden rounded-2xl border border-[#E5EDF4]",
    );
    expect(timeline).toContain(
      "shrink-0 text-right text-[13px] font-black tabular-nums sm:text-sm",
    );
  });

  it("does not change authoritative savings, wallet, settlement, or Supabase flows", () => {
    expect(source).toContain("createSavingAccount({");
    expect(source).toContain("createSavingMovement({");
    expect(source).toContain("deleteSavingAccount(");
    expect(source).toContain("hasUnknownWalletBalance");
    expect(source).toContain('readOnly={transactionForm.type === "settlement"}');
    expect(source).toContain('.from("savings")');
    expect(source).toContain('.from("saving_transactions")');
  });
});
