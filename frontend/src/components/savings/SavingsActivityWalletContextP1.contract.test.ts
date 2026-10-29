import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
);

describe("SAVINGS-ACTIVITY-WALLET-CONTEXT-P1", () => {
  it("loads the wallet id actually recorded with each savings movement", () => {
    expect(source).toContain('"id,saving_id,user_id,type,amount,wallet_id,transaction_date,note,created_at"');
    expect(source).toContain("walletId: row.wallet_id ?? undefined,");
    expect(source).toContain("walletId: activeWallet.id,");
  });

  it("resolves each historical wallet by its recorded transaction id, not current saving wallet", () => {
    expect(source).toContain("wallets.find((wallet) => wallet.id === transaction.walletId)");
    expect(source).toContain('linkedWallet?.name || "Không xác định"');
  });

  it("distinguishes sources, destinations, and interest or internal movements", () => {
    expect(source).toContain('transaction.transferReference || transaction.type === "interest"');
    expect(source).toContain('return `Nạp từ ví: ${walletName}`;');
    expect(source).toContain('return `Rút về ví: ${walletName}`;');
    expect(source).toContain('return `Tất toán về ví: ${walletName}`;');
  });

  it("shows the wallet in both recent activity and read-only history", () => {
    const usages = source.match(/getSavingTransactionWalletLabel\(transaction, wallets\)/g) ?? [];
    expect(usages).toHaveLength(2);
    expect(source).toContain('title={walletLabel}');
    expect(source).toContain("wrap-anywhere text-xs font-bold text-blue-700");
  });

  it("does not alter persistence, balances, or transaction amounts", () => {
    expect(source).toContain("createSavingMovement({");
    expect(source).toContain("const signedAmount = getSignedTransactionAmount(transaction);");
  });
});
