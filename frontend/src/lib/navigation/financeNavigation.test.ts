import { describe, expect, it } from "vitest";
import {
  buildBudgetsHref,
  buildDebtsHref,
  buildGoalsHref,
  buildSavingsHref,
  buildTransactionsHref,
  buildWalletsHref,
  getMonthDateRange,
  hasTransactionsContext,
  isValidISODate,
  isValidYearMonth,
  parseFocusId,
  parseTransactionsContext,
} from "./financeNavigation";

describe("isValidYearMonth", () => {
  it("accepts valid months", () => {
    expect(isValidYearMonth("2026-01")).toBe(true);
    expect(isValidYearMonth("2026-12")).toBe(true);
    expect(isValidYearMonth("2026-02")).toBe(true);
  });

  it("rejects month 00 and month 13", () => {
    expect(isValidYearMonth("2026-00")).toBe(false);
    expect(isValidYearMonth("2026-13")).toBe(false);
  });

  it("rejects a completely invalid shape", () => {
    expect(isValidYearMonth("0000-00")).toBe(false);
    expect(isValidYearMonth("not-a-month")).toBe(false);
    expect(isValidYearMonth("2026-1")).toBe(false);
    expect(isValidYearMonth("2026/01")).toBe(false);
  });
});

describe("getMonthDateRange — calendar-correct month expansion", () => {
  it.each([
    ["2026-01", "2026-01-01", "2026-01-31"],
    ["2026-02", "2026-02-01", "2026-02-28"], // non-leap February
    ["2028-02", "2028-02-01", "2028-02-29"], // leap February
    ["2026-04", "2026-04-01", "2026-04-30"],
    ["2026-06", "2026-06-01", "2026-06-30"],
    ["2026-09", "2026-09-01", "2026-09-30"],
    ["2026-11", "2026-11-01", "2026-11-30"],
    ["2026-12", "2026-12-01", "2026-12-31"],
  ])("%s -> %s .. %s", (month, expectedFrom, expectedTo) => {
    const range = getMonthDateRange(month);
    expect(range?.dateFrom).toBe(expectedFrom);
    expect(range?.dateTo).toBe(expectedTo);
  });

  it("returns undefined for an invalid month rather than a fabricated date", () => {
    expect(getMonthDateRange("2026-13")).toBeUndefined();
    expect(getMonthDateRange("2026-00")).toBeUndefined();
    expect(getMonthDateRange("not-a-month")).toBeUndefined();
  });

  describe("Gregorian leap-year rules (divisible by 4, except by 100, unless by 400)", () => {
    it.each([
      ["2000-02", 29], // divisible by 400 -> leap
      ["2024-02", 29], // divisible by 4, not by 100 -> leap
      ["2028-02", 29], // divisible by 4, not by 100 -> leap
      ["1900-02", 28], // divisible by 100, not by 400 -> not leap
      ["2026-02", 28], // not divisible by 4 -> not leap
      ["2100-02", 28], // divisible by 100, not by 400 -> not leap
    ])("%s has %i days", (month, expectedDays) => {
      const range = getMonthDateRange(month);
      const [, , dayStr] = range!.dateTo.split("-");
      expect(Number(dayStr)).toBe(expectedDays);
    });
  });
});

describe("isValidISODate", () => {
  it("accepts real calendar dates, including leap-day February", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-12-31")).toBe(true);
    expect(isValidISODate("2026-04-30")).toBe(true);
  });

  it("rejects a non-existent Feb 29 in a non-leap year", () => {
    expect(isValidISODate("2026-02-29")).toBe(false);
  });

  it("rejects impossible days for short/30-day months", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-02-31")).toBe(false);
    expect(isValidISODate("2026-04-31")).toBe(false);
    expect(isValidISODate("2026-06-31")).toBe(false);
    expect(isValidISODate("2026-09-31")).toBe(false);
    expect(isValidISODate("2026-11-31")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidISODate("2026-00-10")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
  });

  it("rejects an out-of-range day", () => {
    expect(isValidISODate("2026-01-00")).toBe(false);
    expect(isValidISODate("2026-01-32")).toBe(false);
  });

  it("rejects non-ISO shapes rather than normalizing them", () => {
    expect(isValidISODate("08/12/2026")).toBe(false);
    expect(isValidISODate("2026-8-1")).toBe(false);
  });

  it("does not rely on JS Date's silent month-rollover normalization", () => {
    // new Date(2026, 1, 31) would silently normalize to March 3 — this must
    // be rejected outright instead of being treated as a valid date.
    expect(isValidISODate("2026-02-31")).toBe(false);
  });
});

describe("buildTransactionsHref", () => {
  it("builds a URL with walletId", () => {
    expect(buildTransactionsHref({ walletId: "w1" })).toBe(
      "/transactions?walletId=w1",
    );
  });

  it("builds a URL with categoryId + month (Budget drill-down)", () => {
    expect(
      buildTransactionsHref({ categoryId: "food", month: "2026-08" }),
    ).toBe("/transactions?categoryId=food&month=2026-08");
  });

  it("builds a URL with an explicit date range (Reports drill-down)", () => {
    expect(
      buildTransactionsHref({
        categoryId: "food",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31",
      }),
    ).toBe(
      "/transactions?categoryId=food&dateFrom=2026-07-01&dateTo=2026-07-31",
    );
  });

  it("builds a URL with a type filter", () => {
    expect(buildTransactionsHref({ type: "expense" })).toBe(
      "/transactions?type=expense",
    );
  });

  it("omits undefined/empty params rather than emitting empty query keys", () => {
    expect(
      buildTransactionsHref({
        walletId: undefined,
        categoryId: "",
        month: undefined,
      }),
    ).toBe("/transactions");
  });

  it("returns the bare path when no context is provided", () => {
    expect(buildTransactionsHref({})).toBe("/transactions");
  });

  it("URL-encodes special characters in ids", () => {
    const href = buildTransactionsHref({ categoryId: "ăn uống" });
    const params = new URL(href, "http://localhost").searchParams;
    expect(params.get("categoryId")).toBe("ăn uống");
  });

  it("does NOT encode budget-derived spent/limitAmount/usagePercent — the builder only accepts identifiers/filters", () => {
    // Type-level guarantee: TransactionsNavigationContext has no such fields.
    const href = buildTransactionsHref({ categoryId: "food", month: "2026-08" });
    expect(href).not.toContain("spent");
    expect(href).not.toContain("limitAmount");
    expect(href).not.toContain("usagePercent");
  });
});

describe("parseTransactionsContext", () => {
  it("accepts categoryId", () => {
    const params = new URLSearchParams("categoryId=food");
    expect(parseTransactionsContext(params).categoryId).toBe("food");
  });

  it("accepts walletId", () => {
    const params = new URLSearchParams("walletId=w1");
    expect(parseTransactionsContext(params).walletId).toBe("w1");
  });

  it("accepts a valid month and expands it into dateFrom/dateTo", () => {
    const params = new URLSearchParams("month=2026-08");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2026-08-01");
    expect(result.dateTo).toBe("2026-08-31");
  });

  it("expands a leap-year February month correctly (regression: previously produced 2028-02-31)", () => {
    const params = new URLSearchParams("month=2028-02");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2028-02-01");
    expect(result.dateTo).toBe("2028-02-29");
  });

  it("expands a non-leap February correctly (regression: previously produced 2026-02-31)", () => {
    const params = new URLSearchParams("month=2026-02");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2026-02-01");
    expect(result.dateTo).toBe("2026-02-28");
  });

  it("ignores an invalid month rather than propagating it", () => {
    const params = new URLSearchParams("month=not-a-month");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBeUndefined();
    expect(result.dateTo).toBeUndefined();
  });

  it("ignores a calendar-invalid month (2026-13) rather than propagating it", () => {
    const params = new URLSearchParams("month=2026-13");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBeUndefined();
    expect(result.dateTo).toBeUndefined();
  });

  it("falls back to an explicit dateFrom/dateTo range when no month is present", () => {
    const params = new URLSearchParams(
      "dateFrom=2026-07-01&dateTo=2026-07-31",
    );
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2026-07-01");
    expect(result.dateTo).toBe("2026-07-31");
  });

  it("month takes precedence over an explicit dateFrom/dateTo pair when both are present (unchanged policy)", () => {
    const params = new URLSearchParams(
      "month=2026-08&dateFrom=2026-01-01&dateTo=2026-01-31",
    );
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2026-08-01");
    expect(result.dateTo).toBe("2026-08-31");
  });

  it("falls back to the explicit dateFrom/dateTo pair when month is invalid", () => {
    const params = new URLSearchParams(
      "month=2026-13&dateFrom=2026-07-01&dateTo=2026-07-31",
    );
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2026-07-01");
    expect(result.dateTo).toBe("2026-07-31");
  });

  it("accepts a partial range: dateFrom only", () => {
    const params = new URLSearchParams("dateFrom=2026-08-01");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2026-08-01");
    expect(result.dateTo).toBeUndefined();
  });

  it("accepts a partial range: dateTo only", () => {
    const params = new URLSearchParams("dateTo=2026-08-31");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBeUndefined();
    expect(result.dateTo).toBe("2026-08-31");
  });

  it("ignores an invalid dateFrom/dateTo", () => {
    const params = new URLSearchParams("dateFrom=08/2026&dateTo=nope");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBeUndefined();
    expect(result.dateTo).toBeUndefined();
  });

  it("ignores a calendar-invalid dateFrom (2026-02-31) — regression for §18", () => {
    const params = new URLSearchParams("dateFrom=2026-02-31");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBeUndefined();
  });

  it("ignores a calendar-invalid dateTo (2026-13-01) — regression for §18", () => {
    const params = new URLSearchParams("dateTo=2026-13-01");
    const result = parseTransactionsContext(params);
    expect(result.dateTo).toBeUndefined();
  });

  it("accepts a valid leap-day dateFrom (2028-02-29) — regression for §18", () => {
    const params = new URLSearchParams("dateFrom=2028-02-29");
    const result = parseTransactionsContext(params);
    expect(result.dateFrom).toBe("2028-02-29");
  });

  it("accepts a known type filter", () => {
    const params = new URLSearchParams("type=income");
    expect(parseTransactionsContext(params).type).toBe("income");
  });

  it("ignores an unrecognized type filter", () => {
    const params = new URLSearchParams("type=bogus");
    expect(parseTransactionsContext(params).type).toBeUndefined();
  });

  it("returns an empty object (normal defaults) for empty params", () => {
    expect(parseTransactionsContext(new URLSearchParams())).toEqual({});
  });

  it("ignores unknown params without throwing", () => {
    const params = new URLSearchParams("foo=bar&walletId=w1");
    expect(() => parseTransactionsContext(params)).not.toThrow();
    expect(parseTransactionsContext(params).walletId).toBe("w1");
  });
});

describe("hasTransactionsContext", () => {
  it("is false for an empty query", () => {
    expect(hasTransactionsContext(new URLSearchParams())).toBe(false);
  });

  it("is false when only an unrelated param (e.g. action=create) is present", () => {
    expect(hasTransactionsContext(new URLSearchParams("action=create"))).toBe(
      false,
    );
  });

  it("is true when any contextual param is present", () => {
    expect(hasTransactionsContext(new URLSearchParams("walletId=w1"))).toBe(
      true,
    );
  });
});

describe("Entity-focus href builders", () => {
  it("builds a Budget focus URL", () => {
    expect(buildBudgetsHref({ budgetId: "b1" })).toBe("/budgets?budgetId=b1");
  });

  it("builds a Wallet focus URL", () => {
    expect(buildWalletsHref({ walletId: "w1" })).toBe("/wallets?walletId=w1");
  });

  it("builds a Savings focus URL", () => {
    expect(buildSavingsHref({ savingId: "s1" })).toBe("/savings?savingId=s1");
  });

  it("builds a Goal focus URL", () => {
    expect(buildGoalsHref({ goalId: "g1" })).toBe("/goals?goalId=g1");
  });

  it("builds a Debt focus URL", () => {
    expect(buildDebtsHref({ debtId: "d1" })).toBe("/debts?debtId=d1");
  });

  it("returns the bare path when no id is provided (normal, unfiltered page)", () => {
    expect(buildBudgetsHref()).toBe("/budgets");
    expect(buildWalletsHref()).toBe("/wallets");
    expect(buildSavingsHref()).toBe("/savings");
    expect(buildGoalsHref()).toBe("/goals");
    expect(buildDebtsHref()).toBe("/debts");
  });
});

describe("parseFocusId", () => {
  it("returns the id when present", () => {
    expect(parseFocusId(new URLSearchParams("budgetId=b1"), "budgetId")).toBe(
      "b1",
    );
  });

  it("returns undefined for a missing id (safe default: no focus)", () => {
    expect(
      parseFocusId(new URLSearchParams(), "budgetId"),
    ).toBeUndefined();
  });

  it("returns undefined for an empty id", () => {
    expect(
      parseFocusId(new URLSearchParams("budgetId="), "budgetId"),
    ).toBeUndefined();
  });

  it("does not crash on an id that doesn't correspond to any real entity — that is the destination page's job to ignore", () => {
    expect(
      parseFocusId(new URLSearchParams("budgetId=does-not-exist"), "budgetId"),
    ).toBe("does-not-exist");
  });
});

describe("Budget -> Transactions drill-down round trip (build + parse)", () => {
  it("Food / 2026-02 produces a calendar-valid dateFrom/dateTo range end-to-end", () => {
    const href = buildTransactionsHref({ categoryId: "food", month: "2026-02" });
    expect(href).toBe("/transactions?categoryId=food&month=2026-02");

    const url = new URL(href, "http://localhost");
    const result = parseTransactionsContext(url.searchParams);

    expect(result.categoryId).toBe("food");
    expect(result.dateFrom).toBe("2026-02-01");
    expect(result.dateTo).toBe("2026-02-28");
  });

  it("Food / 2028-02 (leap year) resolves dateTo to Feb 29, not Feb 31", () => {
    const href = buildTransactionsHref({ categoryId: "food", month: "2028-02" });
    const url = new URL(href, "http://localhost");
    const result = parseTransactionsContext(url.searchParams);

    expect(result.dateFrom).toBe("2028-02-01");
    expect(result.dateTo).toBe("2028-02-29");
  });
});
