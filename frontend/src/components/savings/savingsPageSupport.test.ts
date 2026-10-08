import { describe, expect, it } from "vitest";

import {
  formatCurrencyInputFromNumber,
  groupTransactionsBySavingId,
  mapSavingRowToSaving,
  mapTransactionRowToTransaction,
  parseCurrencyInput,
  parseCurrencyValue,
  parseSavingTransferLedgerNote,
} from "./savingsPageSupport";

describe("savingsPageSupport", () => {
  it("maps canonical Savings rows without changing numeric semantics", () => {
    expect(
      mapSavingRowToSaving({
        id: "saving-1",
        name: "Quỹ dự phòng",
        type: "emergency_fund",
        balance: 12_500_000,
        wallet_id: "wallet-1",
        interest_rate: null,
        maturity_date: null,
        notes: null,
      }),
    ).toEqual({
      id: "saving-1",
      name: "Quỹ dự phòng",
      type: "emergency_fund",
      balance: 12_500_000,
      walletId: "wallet-1",
      interestRate: undefined,
      maturityDate: undefined,
      notes: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    });
  });

  it("parses internal-saving transfer ledger metadata and preserves display note", () => {
    expect(
      parseSavingTransferLedgerNote(
        "__saving_transfer__:123e4567-e89b-12d3-a456-426614174000:out|Chuyển quỹ",
      ),
    ).toEqual({
      reference: "123e4567-e89b-12d3-a456-426614174000",
      direction: "out",
      displayNote: "Chuyển quỹ",
    });
  });

  it("maps transaction rows through the same internal-transfer parser", () => {
    const mapped = mapTransactionRowToTransaction({
      id: "movement-1",
      saving_id: "saving-1",
      type: "withdraw",
      amount: 500_000,
      transaction_date: "2026-10-08",
      note: "__saving_transfer__:123e4567-e89b-12d3-a456-426614174000:out|Điều chuyển",
    });

    expect(mapped.note).toBe("Điều chuyển");
    expect(mapped.transferReference).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
    expect(mapped.transferDirection).toBe("out");
  });

  it("groups savings movements by saving id without dropping rows", () => {
    const grouped = groupTransactionsBySavingId([
      {
        id: "tx-1",
        savingId: "saving-a",
        type: "deposit",
        amount: 100,
        date: "2026-10-08",
        note: "",
      },
      {
        id: "tx-2",
        savingId: "saving-b",
        type: "withdraw",
        amount: 50,
        date: "2026-10-08",
        note: "",
      },
      {
        id: "tx-3",
        savingId: "saving-a",
        type: "interest",
        amount: 10,
        date: "2026-10-08",
        note: "",
      },
    ]);

    expect(grouped["saving-a"]?.map((item) => item.id)).toEqual([
      "tx-1",
      "tx-3",
    ]);
    expect(grouped["saving-b"]?.map((item) => item.id)).toEqual(["tx-2"]);
  });

  it("keeps currency input parsing/formatting behavior stable", () => {
    expect(parseCurrencyValue("1.234.567 đ")).toBe(1_234_567);
    expect(parseCurrencyInput("1234567")).toBe(
      new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
        1_234_567,
      ),
    );
    expect(formatCurrencyInputFromNumber(0)).toBe("");
  });
});