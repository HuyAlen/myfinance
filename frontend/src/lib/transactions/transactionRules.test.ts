import { describe, expect, it } from "vitest";
import {
  applyTransactionRuleMatch,
  evaluateTransactionRules,
  normalizeTransactionRuleText,
  transactionRuleMatches,
  type TransactionRule,
} from "./transactionRules";

const base = (patch: Partial<TransactionRule> = {}): TransactionRule => ({
  id: "r1",
  name: "Grab",
  enabled: true,
  priority: 100,
  transactionType: "expense",
  noteContains: "Gráb",
  walletId: null,
  amountMin: null,
  amountMax: null,
  actionCategoryId: "transport",
  actionWalletId: null,
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
  ...patch,
});

describe("TRANSACTION-RULE-CATEGORY-ONLY-1 engine", () => {
  it("normalizes case and Vietnamese accents for note matching", () => {
    expect(normalizeTransactionRuleText("  GRÁB   Bike ")).toBe("grab bike");
    expect(
      transactionRuleMatches(base(), {
        type: "expense",
        amount: 65000,
        note: "Grab Bike sáng",
        walletId: "vcb",
      }),
    ).toBe(true);
  });

  it("keeps explicit wallet/amount fields as match conditions only", () => {
    const rule = base({
      walletId: "vcb",
      amountMin: 50000,
      amountMax: 100000,
    });
    expect(
      transactionRuleMatches(rule, {
        type: "expense",
        amount: 65000,
        note: "grab",
        walletId: "vcb",
      }),
    ).toBe(true);
    expect(
      transactionRuleMatches(rule, {
        type: "expense",
        amount: 120000,
        note: "grab",
        walletId: "vcb",
      }),
    ).toBe(false);
  });

  it("uses deterministic priority and first-match-wins", () => {
    const match = evaluateTransactionRules(
      [base({ id: "later", priority: 200 }), base({ id: "first", priority: 10 })],
      {
        type: "expense",
        amount: 60000,
        note: "Grab",
        walletId: "cash",
        categoryId: "",
      },
    );
    expect(match?.rule.id).toBe("first");
  });

  it("ignores disabled, transfer, and category no-op rules", () => {
    expect(
      evaluateTransactionRules(
        [base({ enabled: false })],
        {
          type: "expense",
          amount: 60000,
          note: "Grab",
          walletId: "cash",
        },
      ),
    ).toBeNull();

    expect(
      evaluateTransactionRules(
        [base()],
        {
          type: "transfer",
          amount: 60000,
          note: "Grab",
          walletId: "cash",
        },
      ),
    ).toBeNull();

    expect(
      evaluateTransactionRules(
        [base()],
        {
          type: "expense",
          amount: 60000,
          note: "Grab",
          walletId: "cash",
          categoryId: "transport",
        },
      ),
    ).toBeNull();
  });

  it("applies only category and preserves wallet, amount, note and type", () => {
    const candidate = {
      type: "expense" as const,
      amount: 80000,
      note: "Grab",
      walletId: "cash",
      categoryId: "",
    };
    const match = evaluateTransactionRules(
      [base({ actionWalletId: "vcb" })],
      candidate,
    )!;
    const next = applyTransactionRuleMatch(candidate, match);

    expect(next).toEqual({
      ...candidate,
      categoryId: "transport",
    });
    expect(next.walletId).toBe("cash");
    expect(next.amount).toBe(80000);
    expect(candidate).toEqual({
      type: "expense",
      amount: 80000,
      note: "Grab",
      walletId: "cash",
      categoryId: "",
    });
  });

  it("fails closed for legacy wallet-only actions", () => {
    const match = evaluateTransactionRules(
      [base({ actionCategoryId: null, actionWalletId: "vcb" })],
      {
        type: "expense",
        amount: 80000,
        note: "Grab",
        walletId: "cash",
        categoryId: "",
      },
    );

    expect(match).toBeNull();
  });
});