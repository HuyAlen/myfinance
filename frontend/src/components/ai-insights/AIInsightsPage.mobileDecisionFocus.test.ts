import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AIInsightsPage iPhone decision focus (AI-INSIGHTS-MOBILE-POLISH-1)", () => {
  const source = readFileSync(path.resolve(__dirname, "AIInsightsPage.tsx"), "utf8");

  it("keeps the mobile hero compact and soft-blue", () => {
    expect(source).toContain('rounded-[1.75rem] border border-blue-100');
    expect(source).toContain('text-[1.55rem]');
    expect(source).toContain('bg-linear-to-br from-blue-50 via-white to-cyan-50');
  });

  it("uses a horizontal snap rail for first-viewport metrics", () => {
    expect(source).toContain("data-mobile-kpi-rail");
    expect(source).toContain("snap-x snap-mandatory");
    expect(source).toContain("overflow-x-auto");
  });

  it("keeps mobile metric values on one readable line without truncation", () => {
    const start = source.indexOf("function MetricCard(");
    expect(start).toBeGreaterThan(-1);
    const metric = source.slice(start, source.indexOf("function InsightCard", start));
    expect(metric).toContain("whitespace-nowrap");
    expect(metric).not.toContain("truncate");
    expect(metric).toContain("min-w-[10.25rem]");
  });

  it("puts next actions ahead of long-form insights on mobile", () => {
    expect(source).toContain("data-next-actions");
    expect(source).toContain('data-next-actions className="order-1');
    expect(source).toContain('data-insight-list className="order-2');
    expect(source).toContain("xl:order-2");
    expect(source).toContain("xl:order-1");
  });

  it("reduces mobile section density while preserving desktop spacing", () => {
    expect(source).toContain('className="space-y-4 sm:space-y-6"');
    expect(source).toContain("p-4 shadow-sm sm:rounded-4xl sm:p-6");
  });

  it("removes truncation from emergency-fund money values", () => {
    const start = source.indexOf("{/* 3 metric tiles */}");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("{/* Recommendation row */}", start);
    const region = source.slice(start, end);
    expect(region).not.toContain("truncate");
    expect(region).toContain("break-words");
  });

  it("shrinks score dials on phones without changing desktop size", () => {
    expect(source).toContain("size-20");
    expect(source).toContain("sm:size-24");
  });

  it("uses stacked forecast scenario cards on phones and keeps desktop table", () => {
    expect(source).toContain("data-mobile-scenario-cards");
    expect(source).toContain('data-mobile-scenario-cards className="grid gap-2.5 sm:hidden"');
    expect(source).toContain('className="hidden overflow-x-auto rounded-2xl border border-slate-100 sm:block"');
  });

  it("uses stacked budget-category cards on phones", () => {
    expect(source).toContain("data-mobile-budget-cards");
    expect(source).toContain("smartBudget.categoryAnalysis");
    expect(source).toContain("Math.min(100, c.usagePercent)");
  });

  it("does not reintroduce misleading AI budget recommendation copy", () => {
    expect(source).not.toContain("Đề xuất ngân sách từ AI");
    expect(source).toContain("Đề xuất ngân sách");
  });

  it("uses a calmer mobile surface for FIRE instead of an orange hero treatment", () => {
    expect(source).toContain("data-fire-section");
    expect(source).toContain("Lộ trình FIRE");
    expect(source).toContain("bg-blue-100 text-blue-700");
  });

  it("preserves sparse-history forecast trust messaging", () => {
    expect(source).toContain("transactionCoverage.hasForecastHistory");
    expect(source).toContain("Chưa đủ 6 tháng dữ liệu giao dịch");
    expect(source).toContain("dự báo chỉ mang tính tham khảo");
  });

  it("preserves correctness-1 recovery contracts", () => {
    for (const token of [
      "INSIGHTS_LOAD_TIMEOUT_MS = 10_000",
      "INSIGHTS_INITIAL_RETRY_MS = 750",
      "getTransactionsInRange",
      "isReloadingRef",
      "hasPendingReloadRef",
      'window.addEventListener("online"',
      'document.addEventListener("visibilitychange"',
      "useRealtimeTable(",
    ]) {
      expect(source).toContain(token);
    }
  });
});
