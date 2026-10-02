import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(path.resolve(__dirname, "DebtsPage.tsx"), "utf8");
const plannerSource = readFileSync(
  path.resolve(__dirname, "../../lib/debts/debtPaydownPlanner.ts"),
  "utf8",
);

describe("DEBT-PAYDOWN-PLANNER-1 wiring", () => {
  it("uses one pure planner engine for baseline and accelerated scenarios", () => {
    expect(pageSource).toContain("buildDebtPaydownPlan({");
    expect(pageSource).toContain("baselinePaydownPlan");
    expect(pageSource).toContain("scenarioPaydownPlan");
    expect(pageSource).toContain("getDebtPaydownImpact(");
    expect(plannerSource).not.toContain("financeStorage");
    expect(plannerSource).not.toContain("supabase");
  });

  it("keeps Snowball and Avalanche as user-selectable planning strategies", () => {
    expect(pageSource).toContain('useState<DebtPaydownStrategy>("avalanche")');
    expect(pageSource).toContain('setPaydownStrategy("avalanche")');
    expect(pageSource).toContain('setPaydownStrategy("snowball")');
    expect(pageSource).toContain("Avalanche");
    expect(pageSource).toContain("Snowball");
  });

  it("models extra monthly payment without creating a transaction or mutating balances", () => {
    expect(pageSource).toContain('label="Trả thêm mỗi tháng"');
    expect(pageSource).toContain("extraMonthlyPayment: extraPaydownAmount");
    expect(pageSource).toContain("Mô phỏng, không tạo giao dịch");
    expect(plannerSource).not.toContain("addTransaction");
    expect(plannerSource).not.toContain("updateDebt");
  });

  it("surfaces payoff duration, monthly payment, time saved and modeled interest impact", () => {
    expect(pageSource).toContain("Mức trả / tháng");
    expect(pageSource).toContain("Ước tính tất toán");
    expect(pageSource).toContain("Rút ngắn");
    expect(pageSource).toContain("Giảm lãi ước tính");
    expect(pageSource).toContain("formatDebtPayoffDuration(");
  });

  it("warns explicitly when APR or minimum-payment metadata is missing", () => {
    expect(pageSource).toContain("missingInterestRateCount");
    expect(pageSource).toContain("chưa nhập lãi suất");
    expect(pageSource).toContain("missingMinimumPaymentCount");
    expect(pageSource).toContain("chưa nhập mức trả tối thiểu");
  });

  it("lets one remaining debt use the planner instead of requiring multiple debts", () => {
    expect(pageSource).toContain("snowballOrder.length > 0");
    expect(pageSource).not.toContain("snowballOrder.length > 1");
  });

  it("exposes APR and minimum monthly payment in the existing debt editor using the existing schema", () => {
    expect(pageSource).toContain("Lãi suất năm (%)");
    expect(pageSource).toContain("value={form.interestRate}");
    expect(pageSource).toContain('inputMode="decimal"');
    expect(pageSource).toContain('label="Mức trả tối thiểu / tháng"');
    expect(pageSource).toContain("interestRate,");
    expect(pageSource).toContain("minimumPayment,");
    expect(pageSource).toContain("...(existingDebt ?? {})");
  });
});
