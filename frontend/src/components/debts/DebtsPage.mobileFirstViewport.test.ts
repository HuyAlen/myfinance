import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DEBTS-MOBILE-POLISH-1 — Compact Debt Hierarchy & iPhone Payoff Ergonomics.
 *
 * Source-inspection regression coverage keeps the mobile-first hierarchy and
 * touch ergonomics stable without requiring React Testing Library.
 */
describe("DebtsPage iPhone hierarchy and payoff ergonomics (DEBTS-MOBILE-POLISH-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "DebtsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("keeps the primary header compact and Vietnamese on mobile", () => {
    expect(source).toContain("Quản lý khoản nợ");
    expect(source).toContain('<span className="sm:hidden">Thêm nợ</span>');
    expect(source).toContain("sm:block");
    expect(source).not.toContain("Debt Management Center");
  });

  it("uses a horizontally scrollable snap KPI rail on iPhone", () => {
    expect(source).toContain("snap-x snap-mandatory");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("sm:grid");
  });

  it("does not truncate KPI money or subtitles", () => {
    const start = source.indexOf("function KpiCard({");
    expect(start).toBeGreaterThan(-1);
    const region = source.slice(start);
    expect(region).toContain("break-words");
    expect(region).not.toContain("truncate text-lg");
    expect(region).not.toContain("truncate text-[10px]");
  });

  it("places real debt cards before analytics and payoff planning", () => {
    const debtCards = source.indexOf("SECTION 5 · Premium Debt Cards");
    const analytics = source.indexOf("SECTION 2 · Debt Overview + Analytics");
    const planner = source.indexOf("SECTION 4 · Payoff Planner");
    expect(debtCards).toBeGreaterThan(-1);
    expect(debtCards).toBeLessThan(analytics);
    expect(debtCards).toBeLessThan(planner);
  });

  it("keeps debt cards compact and avoids truncating debt names", () => {
    expect(source).toContain("rounded-3xl border bg-white p-4");
    expect(source).toContain("break-words text-[15px] font-black");
    expect(source).not.toContain('className="truncate text-base font-black text-slate-900"');
  });

  it("shows exact VND debt facts instead of lossy rounded M/K shorthand", () => {
    expect(source).toContain("{formatVND(debt.totalAmount)}");
    expect(source).toContain("{formatVND(debt.paidAmt)}");
    expect(source).not.toContain('Math.round(debt.totalAmount / 1_000_000) + "M"');
    expect(source).not.toContain('Math.round(debt.paidAmt / 1_000_000) + "M"');
  });

  it("gives mobile edit and delete actions at least 44px height", () => {
    expect(source).toContain("min-h-11 flex-1 items-center justify-center");
    expect(source).toContain("size-11 items-center justify-center");
  });

  it("stacks the allocation chart on narrow screens and lets names wrap", () => {
    expect(source).toContain("flex flex-col items-center gap-3 sm:flex-row");
    expect(source).toContain("min-w-0 flex-1 break-words font-bold text-slate-600");
  });

  it("uses a true full-height mobile debt form with safe-area-aware header", () => {
    expect(source).toContain("h-[100dvh]");
    expect(source).toContain("rounded-none");
    expect(source).toContain("env(safe-area-inset-top)");
  });

  it("keeps form actions sticky above the iPhone home indicator", () => {
    expect(source).toContain("sticky bottom-0");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("uses a 16px mobile text input to avoid iOS focus zoom", () => {
    expect(source).toContain("text-base outline-none");
    expect(source).toContain("sm:text-sm");
  });

  it("preserves correctness readiness, recovery and realtime contracts", () => {
    expect(source).toContain("DEBTS_LOAD_TIMEOUT_MS = 10_000");
    expect(source).toContain("DEBTS_INITIAL_RETRY_MS = 750");
    expect(source).toContain('window.addEventListener("online", handleOnline)');
    expect(normalized).toContain('["debts", "wallets", "transactions"], async () => { await runReload(); }');
  });

  it("preserves mutation safety and interest-rate Avalanche semantics", () => {
    expect(source).toContain("saveInFlightRef.current");
    expect(source).toContain("deleteInFlightRef.current");
    expect(source).toContain("editingDebtRef.current");
    expect(source).toContain("return rateB - rateA");
  });
});
