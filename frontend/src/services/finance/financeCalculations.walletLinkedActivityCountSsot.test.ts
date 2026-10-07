import { describe, expect, it } from "vitest";
import * as financeCalculations from "./financeCalculations";

type TransactionLink = {
  walletId: string;
  transferToWalletId?: string | null;
  transferReference?: string | null;
  transferReferenceType?: string | null;
};

type ForexLink = { walletId: string };
type SavingLink = { walletId: string; savingId: string };

type Calculator = (input: {
  transactionLinks: TransactionLink[];
  forexLinks: ForexLink[];
  savingLinks: SavingLink[];
}) => Map<string, number>;

const calculateWalletLinkedActivityCounts = (
  financeCalculations as typeof financeCalculations & {
    calculateWalletLinkedActivityCounts?: Calculator;
  }
).calculateWalletLinkedActivityCounts;

function calculate(input: Parameters<Calculator>[0]) {
  expect(calculateWalletLinkedActivityCounts).toBeTypeOf("function");
  if (!calculateWalletLinkedActivityCounts) return new Map<string, number>();
  return calculateWalletLinkedActivityCounts(input);
}

describe("WALLETS-LINKED-ACTIVITY-COUNT-SSOT-1 calculator", () => {
  it("counts initial Savings funding even when no main transaction mirror exists", () => {
    const counts = calculate({
      transactionLinks: [],
      forexLinks: [],
      savingLinks: [{ walletId: "wallet-1", savingId: "saving-1" }],
    });

    expect(counts.get("wallet-1")).toBe(1);
  });

  it("counts a later Savings movement once when both ledgers represent the same activity", () => {
    const counts = calculate({
      transactionLinks: [
        {
          walletId: "wallet-1",
          transferToWalletId: null,
          transferReference: "saving_deposit:saving-1:2026-10-07 10:00:00+00",
          transferReferenceType: "saving",
        },
      ],
      forexLinks: [],
      savingLinks: [{ walletId: "wallet-1", savingId: "saving-1" }],
    });

    expect(counts.get("wallet-1")).toBe(1);
  });

  it("deduplicates Savings mirrors per wallet and saving instead of cross-cancelling unrelated savings", () => {
    const counts = calculate({
      transactionLinks: [
        {
          walletId: "wallet-1",
          transferReference: "saving_deposit:saving-a:2026-10-07 10:00:00+00",
          transferReferenceType: "saving",
        },
        {
          walletId: "wallet-1",
          transferReference: "saving_withdraw:saving-a:2026-10-07 11:00:00+00",
          transferReferenceType: "saving",
        },
      ],
      forexLinks: [],
      savingLinks: [
        { walletId: "wallet-1", savingId: "saving-a" },
        { walletId: "wallet-1", savingId: "saving-b" },
        { walletId: "wallet-1", savingId: "saving-b" },
      ],
    });

    // Two main activities for saving-a + two unmatched Savings-ledger
    // activities for saving-b. The surplus mirror for saving-a must not
    // consume saving-b's rows.
    expect(counts.get("wallet-1")).toBe(4);
  });

  it("preserves wallet-transfer participation and Forex activity counts", () => {
    const counts = calculate({
      transactionLinks: [
        {
          walletId: "wallet-1",
          transferToWalletId: "wallet-2",
        },
      ],
      forexLinks: [{ walletId: "wallet-1" }],
      savingLinks: [],
    });

    expect(counts.get("wallet-1")).toBe(2);
    expect(counts.get("wallet-2")).toBe(1);
  });

  it("does not guess a Savings mirror when its reference cannot identify the saving", () => {
    const counts = calculate({
      transactionLinks: [
        {
          walletId: "wallet-1",
          transferReference: "legacy-saving-reference",
          transferReferenceType: "saving",
        },
      ],
      forexLinks: [],
      savingLinks: [{ walletId: "wallet-1", savingId: "saving-1" }],
    });

    expect(counts.get("wallet-1")).toBe(2);
  });
});
