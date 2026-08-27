import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DASH-MOBILE-POLISH-1 professional hierarchy and density", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  it("keeps Net Worth as the mobile focal value before supporting description", () => {
    const heroStart = source.indexOf("DASH-MOBILE-POLISH-1");
    expect(heroStart).toBeGreaterThan(-1);

    const hero = source.slice(heroStart, source.indexOf("{/* Operating KPIs */}", heroStart));
    const value = hero.indexOf("{formatVND(summary.netWorth)}");
    const description = hero.indexOf("Tổng tài sản đang sở hữu sau khi trừ toàn bộ nợ phải trả.");

    expect(value).toBeGreaterThan(-1);
    expect(description).toBeGreaterThan(value);
  });

  it("uses a compact secondary Reports action instead of a full-width hero button", () => {
    expect(source).toContain("Xem báo cáo&nbsp;›");
    expect(source).toContain('router.push("/reports")');
    expect(source).not.toContain('className="inline-flex h-10 items-center justify-center rounded-xl border border-blue-100 bg-white/95 px-4');
  });

  it("flattens mobile HeroMini surfaces while preserving responsive desktop polish", () => {
    expect(source).toContain("min-h-[78px]");
    expect(source).toContain("shadow-none");
    expect(source).toContain("sm:hover:shadow-md");
    expect(source).not.toContain("min-h-[100px]");
  });

  it("keeps Net Worth readiness/history semantics untouched", () => {
    expect(source).toContain("{isDashboardReady ? (");
    expect(source).toContain("const netWorthTrendReady = netWorthHistoryReady;");
    expect(source).toContain("netWorthHistorySummary.snapshotCount === 1");
    expect(source).toContain("<NetWorthTrendChart trend={netWorthTrend} />");
  });

  it("uses neutral asset values and reserves semantic debt color for real debt", () => {
    expect(source).toContain('valueClass="text-slate-900"');
    expect(source).toContain('valueClass={summary.totalDebt > 0 ? "text-rose-500" : "text-slate-900"}');
  });
});
