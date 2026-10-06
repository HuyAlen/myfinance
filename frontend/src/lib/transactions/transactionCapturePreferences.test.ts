import { describe, expect, it } from "vitest";
import {
  createDefaultTransactionCapturePreferences,
  getRecentTransactionCaptureCategoryIds,
  normalizeTransactionCapturePreferences,
  rememberTransactionCaptureSuccess,
  resolveTransactionCaptureDefaults,
} from "./transactionCapturePreferences";

describe("TRANSACTION-CAPTURE-SPEED-2 preference SSOT", () => {
  it("starts fail-closed with no remembered finance selection", () => {
    expect(createDefaultTransactionCapturePreferences()).toEqual({
      version: 1,
      lastWalletIdByMode: { income: "", expense: "", transfer: "" },
      lastTransferToWalletId: "",
      recentCategoryIds: { income: [], expense: [] },
    });
  });

  it("normalizes malformed storage and caps recent categories at three unique ids", () => {
    expect(
      normalizeTransactionCapturePreferences({
        lastWalletIdByMode: { expense: " wallet-2 " },
        recentCategoryIds: {
          expense: ["food", "food", "fuel", "coffee", "extra"],
        },
      }),
    ).toMatchObject({
      lastWalletIdByMode: { expense: "wallet-2" },
      recentCategoryIds: { expense: ["food", "fuel", "coffee"] },
    });
  });

  it("restores a valid remembered wallet and most-recent compatible expense category", () => {
    const preferences = rememberTransactionCaptureSuccess(
      createDefaultTransactionCapturePreferences(),
      { mode: "expense", walletId: "wallet-2", categoryId: "coffee" },
    );

    expect(
      resolveTransactionCaptureDefaults({
        mode: "expense",
        preferences,
        walletIds: ["wallet-1", "wallet-2"],
        categoryIds: ["food", "coffee"],
      }),
    ).toEqual({
      walletId: "wallet-2",
      categoryId: "coffee",
      transferToWalletId: "",
    });
  });

  it("falls back to current valid wallet/category ids when remembered entities were removed", () => {
    const preferences = normalizeTransactionCapturePreferences({
      lastWalletIdByMode: { expense: "deleted-wallet" },
      recentCategoryIds: { expense: ["deleted-category"] },
    });

    expect(
      resolveTransactionCaptureDefaults({
        mode: "expense",
        preferences,
        walletIds: ["wallet-1", "wallet-2"],
        categoryIds: ["food", "coffee"],
      }),
    ).toEqual({
      walletId: "wallet-1",
      categoryId: "food",
      transferToWalletId: "",
    });
  });

  it("restores a distinct transfer pair and never picks the same wallet twice", () => {
    let preferences = rememberTransactionCaptureSuccess(
      createDefaultTransactionCapturePreferences(),
      {
        mode: "transfer",
        walletId: "wallet-2",
        transferToWalletId: "wallet-1",
      },
    );

    expect(
      resolveTransactionCaptureDefaults({
        mode: "transfer",
        preferences,
        walletIds: ["wallet-1", "wallet-2", "wallet-3"],
        categoryIds: [],
      }),
    ).toEqual({
      walletId: "wallet-2",
      categoryId: "",
      transferToWalletId: "wallet-1",
    });

    preferences = normalizeTransactionCapturePreferences({
      lastWalletIdByMode: { transfer: "wallet-1" },
      lastTransferToWalletId: "wallet-1",
    });
    expect(
      resolveTransactionCaptureDefaults({
        mode: "transfer",
        preferences,
        walletIds: ["wallet-1", "wallet-2"],
        categoryIds: [],
      }).transferToWalletId,
    ).toBe("wallet-2");
  });

  it("moves a reused category back to the front instead of duplicating it", () => {
    let preferences = createDefaultTransactionCapturePreferences();
    for (const categoryId of ["food", "fuel", "coffee", "food"]) {
      preferences = rememberTransactionCaptureSuccess(preferences, {
        mode: "expense",
        walletId: "wallet-1",
        categoryId,
      });
    }

    expect(getRecentTransactionCaptureCategoryIds(preferences, "expense")).toEqual([
      "food",
      "coffee",
      "fuel",
    ]);
  });

  it("keeps income and expense category history independent", () => {
    let preferences = rememberTransactionCaptureSuccess(
      createDefaultTransactionCapturePreferences(),
      { mode: "expense", walletId: "wallet-1", categoryId: "food" },
    );
    preferences = rememberTransactionCaptureSuccess(preferences, {
      mode: "income",
      walletId: "wallet-2",
      categoryId: "salary",
    });

    expect(getRecentTransactionCaptureCategoryIds(preferences, "expense")).toEqual([
      "food",
    ]);
    expect(getRecentTransactionCaptureCategoryIds(preferences, "income")).toEqual([
      "salary",
    ]);
  });
});