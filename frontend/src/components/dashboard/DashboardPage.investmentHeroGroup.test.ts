import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DASH-INVESTMENT-SUMMARY-1
 *
 * Dashboard Hero presents investments as one financial bucket:
 * Portfolio + Forex. This is presentation-only; the canonical underlying
 * balances remain independently calculated by their existing SSOTs.
 */
describe("Dashboard Hero groups Portfolio + Forex into one Investment card", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  const heroStart = source.indexOf(
    "Mobile uses a flatter financial breakdown",
  );
  const heroEnd = source.indexOf(
    'data-dashboard-surface="networth-history"',
    heroStart,
  );

  it("finds the Hero financial breakdown region", () => {
    expect(heroStart).toBeGreaterThan(-1);
    expect(heroEnd).toBeGreaterThan(heroStart);
  });

  it("renders four Hero cards in a 4-column desktop grid", () => {
    const hero = source.slice(heroStart, heroEnd);

    expect(hero).toContain("xl:grid-cols-4");
    expect(hero).not.toContain("xl:grid-cols-5");
  });

  it("shows one Investment card instead of separate Forex and other-investment cards", () => {
    const hero = source.slice(heroStart, heroEnd);

    expect(hero).toContain('label="Đầu tư"');
    expect(hero).not.toContain('label="Vốn Forex"');
    expect(hero).not.toContain('label="Đầu tư khác"');
  });

  it("Investment value uses canonical Portfolio plus Forex current asset value", () => {
    const hero = source.slice(heroStart, heroEnd);

    expect(hero).toContain(
      "value={formatVND(forexSnapshot.assetValue + summary.investmentAssets)}",
    );
  });

  it("keeps the other three canonical Hero buckets unchanged", () => {
    const hero = source.slice(heroStart, heroEnd);

    expect(hero).toContain('label="Thanh khoản"');
    expect(hero).toContain(
      "value={formatVND(summary.liquidBalance)}",
    );

    expect(hero).toContain('label="Tiết kiệm"');
    expect(hero).toContain(
      "value={formatVND(savingsSnapshot.totalSavings)}",
    );

    expect(hero).toContain('label="Nợ phải trả"');
    expect(hero).toContain(
      "value={formatVND(summary.totalDebt)}",
    );
  });

  it("does not stretch Debt across two mobile columns anymore", () => {
    const hero = source.slice(heroStart, heroEnd);
    const debtStart = hero.indexOf('label="Nợ phải trả"');

    expect(debtStart).toBeGreaterThan(-1);

    const debtWindow = hero.slice(debtStart, debtStart + 400);
    expect(debtWindow).not.toContain('className="col-span-2');
  });
});
