import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const normalized = source.replace(/\s+/g, " ");

describe("WALLETS-LINKED-ACTIVITY-COUNT-SSOT-1 page adoption", () => {
  it("loads the all-time Savings wallet-link ledger alongside main transactions and Forex", () => {
    expect(source).toContain("getSavingTransactionWalletLinks");
    expect(normalized).toContain(
      "Promise.all([ getTransactionWalletLinks(), getForexCashWalletLinks(), getSavingTransactionWalletLinks(), ])",
    );
    expect(normalized).toContain(
      ".then(([txnLinks, forexLinks, savingLinks]) => {",
    );
  });

  it("delegates linked-activity counting to the canonical dedupe calculator", () => {
    expect(source).toContain("calculateWalletLinkedActivityCounts");
    expect(normalized).toContain(
      "calculateWalletLinkedActivityCounts({ transactionLinks: txnLinks, forexLinks, savingLinks, })",
    );
    expect(source).not.toContain("for (const link of txnLinks) {");
    expect(source).not.toContain("for (const link of forexLinks) {");
  });

  it("keeps Savings realtime refresh and the all-time UI copy", () => {
    expect(source).toContain('"saving_transactions"');
    expect(source).toContain("GD tổng");
    expect(source).toContain("GD liên kết tổng");
  });
});
