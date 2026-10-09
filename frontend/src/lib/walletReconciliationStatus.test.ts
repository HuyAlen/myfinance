import { describe, expect, it } from "vitest";
import { getWalletReconciliationStatus } from "./walletReconciliationStatus";

describe("WALLET-RECONCILIATION-STATUS-UX-1 status model", () => {
  it("distinguishes a wallet with no receipt from an old legacy receipt", () => {
    expect(getWalletReconciliationStatus({ id: "a", balance_revision: 0 }, null))
      .toBe("never");
    expect(getWalletReconciliationStatus({ id: "a", balance_revision: 0 }, {
      walletId: "a", balanceRevision: null,
    })).toBe("needs_review");
  });

  it("accepts the current balance revision, including equal-balance confirmations", () => {
    expect(getWalletReconciliationStatus({ id: "a", balance_revision: 0 }, {
      walletId: "a", balanceRevision: 0,
    })).toBe("reconciled");
    expect(getWalletReconciliationStatus({ id: "a", balance_revision: 8 }, {
      walletId: "a", balanceRevision: 8,
    })).toBe("reconciled");
  });

  it("flags new balance mutation, even if later balance returns to its old value", () => {
    expect(getWalletReconciliationStatus({ id: "a", balance_revision: 7 }, {
      walletId: "a", balanceRevision: 6,
    })).toBe("needs_review");
  });

  it("fails closed when a receipt belongs to a different wallet", () => {
    expect(getWalletReconciliationStatus({ id: "a", balance_revision: 2 }, {
      walletId: "b", balanceRevision: 2,
    })).toBe("needs_review");
  });

  it("fails closed while wallet revision has not loaded", () => {
    expect(getWalletReconciliationStatus({ id: "a" }, {
      walletId: "a", balanceRevision: 0,
    })).toBe("needs_review");
  });
});
