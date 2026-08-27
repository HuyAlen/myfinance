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

  it("keeps mobile HeroMini surfaces compact while preserving responsive desktop polish", () => {
    expect(source).toContain("min-h-[78px]");
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
    expect(source).toContain('valueClass="text-[#173A6A]"');
    expect(source).toContain('valueClass={summary.totalDebt > 0 ? "text-rose-500" : "text-[#173A6A]"}');
  });
});


describe("DASH-COLOR-POLISH-1.1 refined light financial palette", () => {
  const source = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");

  it("keeps the Dashboard free of pure/near-black text tokens", () => {
    expect(source).not.toContain("text-black");
    expect(source).not.toContain("text-slate-950");
    expect(source).not.toContain("text-slate-900");
  });

  it("replaces the saturated hero with a light blue-white financial surface", () => {
    expect(source).toContain("from-white via-[#F8FBFF] to-[#EEF5FF]");
    expect(source).not.toContain("from-[#2F6FF7] via-[#4A78F2] to-[#675BF5]");
    expect(source).toContain("text-[#173A6A] sm:text-5xl");
    expect(source).toContain("border border-blue-200 bg-white/90");
  });

  it("uses one restrained blue icon family for HeroMini assets", () => {
    const blueIcons = source.split('iconClass="bg-blue-50 text-blue-600"').length - 1;
    expect(blueIcons).toBe(5);
    expect(source).not.toContain('iconClass="bg-emerald-50 text-emerald-600"');
    expect(source).not.toContain('iconClass="bg-violet-50 text-violet-600"');
    expect(source).not.toContain('iconClass="bg-amber-50 text-amber-600"');
    expect(source).not.toContain('iconClass="bg-rose-50 text-rose-500"');
  });
});
