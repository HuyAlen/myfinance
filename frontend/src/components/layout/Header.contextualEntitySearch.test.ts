import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Header contextual entity search", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("deep-links wallet, saving, goal and debt results to concrete entities", () => {
    expect(source).toContain("buildWalletsHref({ walletId: w.id })");
    expect(source).toContain("buildSavingsHref({ savingId: saving.id })");
    expect(source).toContain("buildGoalsHref({ goalId: g.id })");
    expect(source).toContain("buildDebtsHref({ debtId: d.id })");
  });

  it("includes savings in the global search index instead of only loading them for notifications", () => {
    expect(source).toContain("data.savings");
    expect(source).toContain('sub: "Khoản tiết kiệm"');
    expect(source).toContain('kind: "saving"');
    expect(source).toContain('saving: "Tiết kiệm"');
  });

  it("keeps wallet search fresh without making wallets a notification dependency", () => {
    const firstStart = source.indexOf("useRealtimeTable(");
    const firstEnd = source.indexOf(");", firstStart);
    const notificationCall = source.slice(firstStart, firstEnd);
    expect(notificationCall).not.toContain('"wallets"');

    const secondStart = source.indexOf("useRealtimeTable(", firstEnd);
    const secondEnd = source.indexOf(");", secondStart);
    const searchCall = source.slice(secondStart, secondEnd);
    expect(searchCall).toContain('"wallets"');
    expect(searchCall).toContain('"investments"');
    expect(searchCall).toContain('"forex_accounts"');
  });
});
