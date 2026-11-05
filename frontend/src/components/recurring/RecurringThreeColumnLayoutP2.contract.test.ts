import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(__dirname, "RecurringMoneyPage.tsx"), "utf8");

describe("MYFINANCE-RECURRING-THREE-COLUMN-LAYOUT-P2", () => {
  it("shows 3 schedule cards in one desktop row with safe one/two column fallback", () => {
    expect(page).toContain('<section data-recurring-schedule-grid="true" className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">');
    expect(page).toContain('className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"');
    expect(page).toContain('className="hidden h-36 animate-pulse rounded-3xl bg-slate-100 xl:block"');
  });

  it("keeps each card shrinkable, equally high, with the button row pinned to its bottom", () => {
    expect(page).toContain('data-recurring-schedule-card="true"');
    expect(page).toContain("flex h-full min-w-0 flex-col rounded-3xl");
    expect(page).toContain('className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100 pt-3.5 sm:grid-cols-3"');
  });

  it("truncates long Vietnamese category names without hiding the full label on hover", () => {
    expect(page).toContain('className="min-w-0 flex-1"');
    expect(page).toContain('className="flex min-w-0 items-center gap-2"');
    expect(page).toContain("title={schedule.title}");
    expect(page).toContain("title={`${schedule.categoryName} · ${schedule.walletName}`}");
    expect(page).toContain("sm:shrink-0 sm:text-right");
  });

  it("preserves actual vs estimate, explicit add transaction, mobile footer and no auto debit", () => {
    expect(page).toContain("reconcileCurrentMonthlyOccurrence");
    expect(page).toContain("buildRecurringMonthSummary({ viewMonth, schedules, transactions })");
    expect(page).toContain("await addTransaction(transaction)");
    expect(page).toContain("col-span-2 inline-flex min-h-10 min-w-0");
    expect(page).not.toContain("updateTransaction(");
  });
});
