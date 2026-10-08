import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "transactionRulesStorage.ts"),
  "utf8",
);

describe("TRANSACTION-RULE-CATEGORY-ONLY-1 storage contract", () => {
  it("loads active-workspace rules in deterministic priority order", () => {
    expect(source).toContain("getFinanceOwnerUserId()");
    expect(source).toContain('.from("transaction_rules")');
    expect(source).toContain('.order("priority", { ascending: true })');
  });

  it("requires a category action and clears legacy wallet actions on save", () => {
    expect(source).toContain("Quy tắc cần một danh mục gợi ý.");
    expect(source).toContain("action_category_id: normalizeOptionalText(input.actionCategoryId)");
    expect(source).toContain("action_wallet_id: null");
    expect(source).not.toContain(
      "action_wallet_id: normalizeOptionalText(input.actionWalletId)",
    );
  });

  it("keeps wallet/amount as optional rule match conditions", () => {
    expect(source).toContain("wallet_id: normalizeOptionalText(input.walletId)");
    expect(source).toContain("amount_min: normalizeOptionalNumber(input.amountMin)");
    expect(source).toContain("amount_max: normalizeOptionalNumber(input.amountMax)");
  });

  it("supports create, update, enable/disable and delete", () => {
    expect(source).toContain("createTransactionRule");
    expect(source).toContain("updateTransactionRule");
    expect(source).toContain("setTransactionRuleEnabled");
    expect(source).toContain("deleteTransactionRule");
  });
});