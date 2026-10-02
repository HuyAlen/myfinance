import { describe, expect, it } from "vitest";
import type { FinanceReviewItem } from "@/src/lib/dashboard/dashboardIntelligence";
import type { Transaction } from "@/src/types/finance";
import {
  DEFAULT_FINANCE_REVIEW_FILTERS,
  countActiveFinanceReviewFilters,
  filterFinanceReviewItems,
  getFinanceReviewSeverity,
} from "./financeReviewInbox2";

const transactions: Transaction[] = [
  {
    id: "a",
    type: "expense",
    amount: 100,
    categoryId: "food",
    walletId: "cash",
    note: "A",
    date: "2026-10-01",
  },
  {
    id: "b",
    type: "expense",
    amount: 200,
    categoryId: "transport",
    walletId: "bank",
    note: "B",
    date: "2026-10-02",
  },
];

const items: FinanceReviewItem[] = [
  {
    transactionId: "a",
    title: "A",
    amount: 100,
    date: "2026-10-01",
    reasons: ["possible-duplicate"],
  },
  {
    transactionId: "b",
    title: "B",
    amount: 200,
    date: "2026-10-02",
    reasons: ["unusual-expense"],
  },
];

describe("FINANCE-REVIEW-INBOX-2 filtering", () => {
  it("maps duplicate and category mismatch to high severity", () => {
    expect(getFinanceReviewSeverity(["possible-duplicate"])).toBe("high");
    expect(getFinanceReviewSeverity(["category-type-mismatch"])).toBe("high");
    expect(getFinanceReviewSeverity(["uncategorized"])).toBe("action");
    expect(getFinanceReviewSeverity(["unusual-expense"])).toBe("info");
  });

  it("filters by severity, reason, wallet and category", () => {
    expect(
      filterFinanceReviewItems({
        items,
        transactions,
        filters: {
          ...DEFAULT_FINANCE_REVIEW_FILTERS,
          walletId: "bank",
        },
      }).map((item) => item.transactionId),
    ).toEqual(["b"]);

    expect(
      filterFinanceReviewItems({
        items,
        transactions,
        filters: {
          ...DEFAULT_FINANCE_REVIEW_FILTERS,
          severity: "high",
        },
      }).map((item) => item.transactionId),
    ).toEqual(["a"]);
  });

  it("counts active filters without treating defaults as active", () => {
    expect(countActiveFinanceReviewFilters(DEFAULT_FINANCE_REVIEW_FILTERS)).toBe(
      0,
    );
    expect(
      countActiveFinanceReviewFilters({
        ...DEFAULT_FINANCE_REVIEW_FILTERS,
        reason: "possible-duplicate",
        walletId: "cash",
      }),
    ).toBe(2);
  });
});
