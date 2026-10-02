import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const manager = readFileSync(
  path.resolve(__dirname, "TransactionRulesManager.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("TRANSACTION-RULES-1 page wiring", () => {
  it("loads rules independently and listens for realtime rule changes", () => {
    expect(page).toContain("getTransactionRules()");
    expect(page).toContain("setTransactionRules(rules)");
    expect(page).toContain('"transaction_rules"');
    expect(page).toContain("reloadTransactionRules");
  });

  it("manual entry exposes a suggestion that requires an explicit apply click", () => {
    expect(page).toContain("const activeRuleSuggestion = useMemo(");
    expect(page).toContain("Gợi ý từ quy tắc");
    expect(page).toContain("Áp dụng gợi ý");
    expect(page).toContain("applyActiveRuleSuggestion");
    expect(page).not.toContain("autoApplyTransactionRule");
  });

  it("passes the same rule set into CSV preview", () => {
    expect(page).toContain("rules={transactionRules}");
  });

  it("exposes rule management on mobile and desktop", () => {
    expect(page).toContain("Quy tắc");
    expect(page).toContain('title="Quy tắc giao dịch"');
    expect(page).toContain("<TransactionRulesManager");
  });

  it("manager supports create/edit/toggle/delete with explicit action fields", () => {
    expect(manager).toContain("createTransactionRule");
    expect(manager).toContain("updateTransactionRule");
    expect(manager).toContain("setTransactionRuleEnabled");
    expect(manager).toContain("deleteTransactionRule");
    expect(manager).toContain("Đặt danh mục");
    expect(manager).toContain("Đặt ví");
  });
});
