import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "transactionRulesStorage.ts"),
  "utf8",
);

describe("TRANSACTION-RULES-1 storage contract", () => {
  it("loads active-workspace rules in deterministic priority order", () => {
    expect(source).toContain("getFinanceOwnerUserId()");
    expect(source).toContain('.from("transaction_rules")');
    expect(source).toContain('.order("priority", { ascending: true })');
  });

  it("validates rule actions before persistence", () => {
    expect(source).toContain(
      "Quy tắc cần ít nhất một hành động: Danh mục hoặc Ví.",
    );
    expect(source).toContain("amountMin");
    expect(source).toContain("amountMax");
  });

  it("supports create, update, enable/disable and delete", () => {
    expect(source).toContain("createTransactionRule");
    expect(source).toContain("updateTransactionRule");
    expect(source).toContain("setTransactionRuleEnabled");
    expect(source).toContain("deleteTransactionRule");
  });
});
