import { describe, expect, it } from "vitest";
import {
  buildRecurringMoneySchedules,
  toRecurringScheduleInputs,
} from "./recurringMoney";
import type { Category, Transaction, Wallet } from "@/src/types/finance";

const wallets: Wallet[] = [
  { id: "bank", name: "Ngân hàng", type: "bank", balance: 10_000_000 },
];

const baseCategory: Category = {
  id: "internet",
  name: "Internet",
  type: "expense",
  planningGroup: "fixed",
};

function tx(overrides: Partial<Transaction> & Pick<Transaction, "id">): Transaction {
  return {
    type: "expense",
    amount: 500_000,
    categoryId: "internet",
    walletId: "bank",
    note: "Internet",
    date: "2026-09-05",
    ...overrides,
  };
}

describe("RECURRING-MONEY-MANAGER-1 canonical read model", () => {
  it("prefers an exact category schedule over its legacy transaction mirror", () => {
    const categories: Category[] = [
      {
        ...baseCategory,
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-05",
      },
    ];
    const transactions = [
      tx({
        id: "legacy",
        isRecurring: true,
        recurrence: "monthly",
        nextRunDate: "2026-10-05",
      }),
    ];

    const schedules = buildRecurringMoneySchedules({ categories, transactions, wallets });
    expect(schedules).toHaveLength(1);
    expect(schedules[0].source).toBe("category");
    expect(schedules[0].shadowedSourceIds).toEqual(["legacy"]);
  });

  it("keeps non-identical legacy schedules visible instead of guessing they are duplicates", () => {
    const categories: Category[] = [
      {
        ...baseCategory,
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-05",
      },
    ];
    const transactions = [
      tx({
        id: "legacy",
        amount: 550_000,
        isRecurring: true,
        recurrence: "monthly",
        nextRunDate: "2026-10-05",
      }),
    ];

    const schedules = buildRecurringMoneySchedules({ categories, transactions, wallets });
    expect(schedules).toHaveLength(2);
    expect(schedules.some((item) => item.source === "transaction")).toBe(true);
  });

  it("keeps schedules on different wallets separate even when every other mirror field matches", () => {
    const categories: Category[] = [
      {
        ...baseCategory,
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-05",
      },
    ];
    const transactions = [
      tx({
        id: "legacy-other-wallet",
        walletId: "cash",
        isRecurring: true,
        recurrence: "monthly",
        nextRunDate: "2026-10-05",
      }),
    ];
    const twoWallets: Wallet[] = [
      ...wallets,
      { id: "cash", name: "Tiền mặt", type: "cash", balance: 1_000_000 },
    ];

    const schedules = buildRecurringMoneySchedules({
      categories,
      transactions,
      wallets: twoWallets,
    });
    expect(schedules).toHaveLength(2);
    expect(schedules.map((item) => item.walletId).sort()).toEqual([
      "bank",
      "cash",
    ]);
  });

  it("keeps a paused category schedule authoritative over an exact active legacy mirror", () => {
    const categories: Category[] = [
      {
        ...baseCategory,
        isRecurring: false,
        recurrence: "monthly",
        defaultAmount: 500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-05",
      },
    ];
    const transactions = [
      tx({
        id: "legacy-active",
        isRecurring: true,
        recurrence: "monthly",
        nextRunDate: "2026-10-05",
      }),
    ];

    const schedules = buildRecurringMoneySchedules({ categories, transactions, wallets });
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      source: "category",
      enabled: false,
      shadowedSourceIds: ["legacy-active"],
    });
    expect(toRecurringScheduleInputs(schedules)).toEqual([]);
  });

  it("keeps paused schedule metadata so it can be resumed without re-entering the plan", () => {
    const categories: Category[] = [
      {
        ...baseCategory,
        isRecurring: false,
        recurrence: "monthly",
        defaultAmount: 500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-05",
      },
    ];
    const schedules = buildRecurringMoneySchedules({ categories, transactions: [], wallets });
    expect(schedules).toHaveLength(1);
    expect(schedules[0].enabled).toBe(false);
    expect(schedules[0].issues).toEqual([]);
  });

  it("flags stale wallet/category references instead of forecasting with unverifiable data", () => {
    const schedules = buildRecurringMoneySchedules({
      categories: [baseCategory],
      wallets,
      transactions: [
        tx({
          id: "broken",
          walletId: "deleted-wallet",
          categoryId: "deleted-category",
          isRecurring: true,
          recurrence: "monthly",
          nextRunDate: "2026-10-05",
        }),
      ],
    });
    expect(schedules[0].issues).toContain("missing-wallet-reference");
    expect(schedules[0].issues).toContain("missing-category-reference");
  });

  it("feeds forecasts only from enabled fully valid schedules", () => {
    const categories: Category[] = [
      {
        ...baseCategory,
        isRecurring: true,
        recurrence: "monthly",
        defaultAmount: 500_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-05",
      },
      {
        id: "paused",
        name: "Paused",
        type: "expense",
        isRecurring: false,
        recurrence: "monthly",
        defaultAmount: 100_000,
        defaultWalletId: "bank",
        nextRunDate: "2026-10-06",
      },
    ];
    const schedules = buildRecurringMoneySchedules({ categories, transactions: [], wallets });
    expect(toRecurringScheduleInputs(schedules)).toEqual([
      expect.objectContaining({ id: "category-internet", amount: 500_000 }),
    ]);
  });
});
