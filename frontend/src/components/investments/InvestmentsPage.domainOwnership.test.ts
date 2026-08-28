import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INVESTMENT-DOMAIN-1 — Portfolio + Forex ownership contract.
 *
 * The /investments route must own every asset that contributes to the
 * investment side of the balance sheet. Legacy Investment[] remains valid
 * data, but it can no longer be invisible behind a Forex-only UI.
 */
describe("InvestmentsPage unified Portfolio + Forex ownership", () => {
  const source = readFileSync(
    path.resolve(__dirname, "InvestmentsPage.tsx"),
    "utf8",
  );

  it("loads legacy Portfolio investments alongside Forex data", () => {
    expect(source).toContain("getInvestments()");
    expect(source).toContain("setInvestments(data.investments)");
    expect(source).toContain("Portfolio");
    expect(source).toContain("Tài khoản & vốn Forex");
  });

  it("owns full CRUD for Investment[] instead of leaving those assets read-only elsewhere", () => {
    expect(source).toContain("addInvestment(payload)");
    expect(source).toContain("updateInvestment(payload)");
    expect(source).toContain("deleteInvestment(investment.id)");
    expect(source).toContain("submitPortfolioInvestment");
  });

  it("preserves advanced Investment fields on edit by spreading the existing entity", () => {
    expect(source).toContain("const existing = investments.find(");
    expect(source).toContain("const payload: Investment = {");
    expect(source).toContain("...existing,");
  });

  it("supports entity focus for both Portfolio and Forex search results", () => {
    expect(source).toContain('parseFocusId(focusParams, "investmentId")');
    expect(source).toContain('parseFocusId(focusParams, "forexAccountId")');
    expect(source).toContain('id={`investment-${investment.id}`}');
    expect(source).toContain('id={`forex-account-${account.id}`}');
    expect(source).toContain('scrollIntoView({ behavior: "smooth", block: "center" })');
  });

  it("shows a combined top-level investment value using canonical Forex asset semantics", () => {
    expect(source).toContain("getForexAssetValue(accounts, transactions)");
    expect(source).toContain('label="Tổng giá trị đầu tư"');
    expect(source).toContain("portfolioSummary.currentValue + summary.currentExposure");
    expect(source).toContain('note="Portfolio + Forex"');
  });
});
