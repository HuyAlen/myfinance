import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTransactionsHref,
  parseTransactionsContext,
} from "@/src/lib/navigation/financeNavigation";
import { resolveTransactionsEffectiveRange } from "@/src/lib/transactions/transactionsPeriod";

const source = readFileSync(
  path.resolve(__dirname, "TransactionsPage.tsx"),
  "utf8",
);

describe("MYFINANCE BUDGET CATEGORY DRILLDOWN HOTFIX P1", () => {
  it("round-trips two distinct categories without confusing the budget id with category id", () => {
    const hrefs = ["family", "shopping"].map((categoryId) =>
      buildTransactionsHref({ categoryId, month: "2026-10", type: "expense" }),
    );
    expect(hrefs[0]).not.toBe(hrefs[1]);
    for (const [index, categoryId] of ["family", "shopping"].entries()) {
      const url = new URL(hrefs[index], "https://example.invalid");
      const parsed = parseTransactionsContext(url.searchParams);
      expect(parsed.categoryId).toBe(categoryId);
      expect(parsed.type).toBe("expense");
      expect(resolveTransactionsEffectiveRange({
        startDate: "2026-09-01", endDate: "2026-09-30",
      }, parsed)).toEqual({
        startDate: "2026-10-01", endDate: "2026-10-31",
      });
    }
  });

  it("initializes category, type and dates directly from the URL context", () => {
    expect(source).toContain('() => urlTransactionsContext?.categoryId ?? ""');
    expect(source).toContain('() => urlTransactionsContext?.dateFrom ?? ""');
    expect(source).toContain('() => urlTransactionsContext?.dateTo ?? ""');
    expect(source).toContain('() => urlTransactionsContext?.walletId ?? ""');
    expect(source).toContain('() => urlTransactionsContext?.type ?? "all"');
  });

  it("commits the applied-key only after the deferred filter update, never before", () => {
    const start = source.indexOf("const appliedContextKeyRef = useRef<string | null>(null);");
    const end = source.indexOf("function openReviewTarget(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const effect = source.slice(start, end);
    const scheduled = effect.indexOf("const timer = window.setTimeout(() => {");
    const categorySetter = effect.indexOf("setCategoryFilter(parsed.categoryId)");
    const appliedMarker = effect.indexOf("appliedContextKeyRef.current = filterContextKey;");
    const schedulerEnd = effect.indexOf("}, 0);", scheduled);

    expect(scheduled).toBeGreaterThan(-1);
    expect(categorySetter).toBeGreaterThan(scheduled);
    expect(appliedMarker).toBeGreaterThan(categorySetter);
    expect(schedulerEnd).toBeGreaterThan(appliedMarker);
    expect(effect).toContain("return () => window.clearTimeout(timer)");
    expect(effect).toContain("}, [filterContextKey]);");
  });

  it("does not let unrelated review URL params replace the category filter key", () => {
    const start = source.indexOf("const filterContextKey = JSON.stringify({");
    const end = source.indexOf("});", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const filterKeySource = source.slice(start, end);
    expect(filterKeySource).toContain("categoryId: urlTransactionsContext?.categoryId");
    expect(filterKeySource).toContain("type: urlTransactionsContext?.type");
    expect(filterKeySource).not.toContain("review:");
    expect(filterKeySource).not.toContain("transactionId:");
  });

  it("keeps a strict category-id predicate on the visible transaction feed", () => {
    expect(source).toContain("if (categoryFilter && t.categoryId !== categoryFilter) return false;");
    expect(source).toContain("transactionDay < effectiveRange.startDate");
    expect(source).toContain("transactionDay > effectiveRange.endDate");
  });
});
