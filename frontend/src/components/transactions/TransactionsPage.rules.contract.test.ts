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
const engine = readFileSync(
  path.resolve(__dirname, "../../lib/transactions/transactionRules.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("TRANSACTION-RULE-CATEGORY-ONLY-1 page wiring", () => {
  it("loads rules independently and listens for realtime rule changes", () => {
    expect(page).toContain("getTransactionRules()");
    expect(page).toContain("setTransactionRules(rules)");
    expect(page).toContain('"transaction_rules"');
    expect(page).toContain("reloadTransactionRules");
  });

  it("manual entry exposes an explicit category-only suggestion", () => {
    expect(page).toContain("const activeRuleSuggestion = useMemo(");
    expect(page).toContain("Gợi ý từ quy tắc");
    expect(page).toContain("Áp dụng gợi ý");
    expect(page).toContain("applyActiveRuleSuggestion");
    expect(page).toContain("Chỉ áp dụng danh mục; số tiền và ví được giữ nguyên.");
    expect(page).not.toContain("activeRuleSuggestion.patch.walletId");
    expect(page).not.toContain("autoApplyTransactionRule");
  });

  it("review suggestions persist category only", () => {
    expect(page).toContain("handleApplyReviewRuleSuggestion");
    expect(page).toContain("const categoryId = activeReviewRuleSuggestion.patch.categoryId;");
    expect(page).not.toContain("activeReviewRuleSuggestion.patch.walletId");
  });

  it("keeps the rule engine category-only even for legacy wallet-action rows", () => {
    expect(engine).toContain("export type TransactionRulePatch = {\n  categoryId?: string;\n};");
    expect(engine).not.toContain("patch.walletId");
    expect(engine).not.toContain("changesWallet");
  });

  it("passes the same rule set into CSV preview", () => {
    expect(page).toContain("rules={transactionRules}");
  });

  it("manager exposes category action only while keeping wallet as a match condition", () => {
    expect(page).toContain("Quy tắc");
    expect(page).toContain('title="Quy tắc giao dịch"');
    expect(page).toContain("<TransactionRulesManager");
    expect(manager).toContain("Ví điều kiện");
    expect(manager).toContain("Gợi ý danh mục");
    expect(manager).not.toContain("form.actionWalletId");
    expect(manager).not.toContain(">Đặt ví<");
  });

  it("manager supports create/edit/toggle/delete", () => {
    expect(manager).toContain("createTransactionRule");
    expect(manager).toContain("updateTransactionRule");
    expect(manager).toContain("setTransactionRuleEnabled");
    expect(manager).toContain("deleteTransactionRule");
  });
});