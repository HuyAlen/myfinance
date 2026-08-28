import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Header unified investment-domain search", () => {
  const source = readFileSync(path.resolve(__dirname, "Header.tsx"), "utf8");

  it("loads both Portfolio and Forex entities into the global search index", () => {
    expect(source).toContain("getInvestments()");
    expect(source).toContain("getForexAccounts()");
    expect(source).toContain("forexAccounts: ForexAccount[]");
  });

  it("deep-links Portfolio results to a concrete investment entity", () => {
    expect(source).toContain("buildInvestmentsHref({ investmentId: i.id })");
    expect(source).toContain('sub: i.symbol ? i.symbol + " · Portfolio" : "Portfolio"');
  });

  it("searches Forex by account, broker and account number and focuses the account", () => {
    expect(source).toContain("data.forexAccounts");
    expect(source).toContain("account.broker.toLowerCase().includes(q)");
    expect(source).toContain("buildInvestmentsHref({ forexAccountId: account.id })");
  });

  it("refreshes the search index when either investment owner changes", () => {
    expect(source).toContain('["investments", "forex_accounts"]');
    expect(source).toContain("requestHeaderRefresh");
  });
});
