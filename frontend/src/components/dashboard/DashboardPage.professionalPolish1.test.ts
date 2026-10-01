import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(path.resolve(__dirname, "DashboardPage.tsx"), "utf8");
const header = readFileSync(path.resolve(__dirname, "../layout/Header.tsx"), "utf8");

describe("DASHBOARD-PROFESSIONAL-POLISH-1", () => {
  it("keeps the Net Worth hero semantically independent from cash movement", () => {
    const start = dashboard.indexOf("DASH-MOBILE-POLISH-2.1: True Soft Blue hierarchy.");
    const end = dashboard.indexOf("Mobile uses a flatter financial breakdown", start);
    const hero = dashboard.slice(start, end);
    expect(hero).toContain("netWorthHistorySummary.changeFromPrevious!");
    expect(hero).toContain("so với snapshot trước");
    expect(hero).not.toContain("Dòng tiền dương");
    expect(hero).not.toContain("netCashMovement");
  });

  it("gives Forex cash-in and cash-out explicit direction without reclassifying them as income/expense", () => {
    expect(dashboard).toContain('| "forex-in"');
    expect(dashboard).toContain('| "forex-out"');
    expect(dashboard).toContain('kind: isDeposit ? ("forex-out" as const) : ("forex-in" as const)');
    expect(dashboard).toContain('kind === "income" || kind === "forex-in"');
    expect(dashboard).toContain('kind === "expense" || kind === "forex-out"');
  });

  it("removes the Dashboard violet island and uses the primary blue/cyan family", () => {
    expect(dashboard).not.toContain("violet-");
    expect(dashboard).toContain('from-[#2F80ED] to-[#17B6D4]');
    expect(dashboard).toContain('from-[#2F80ED] to-[#17A9D4]');
    expect(dashboard).toContain("Rút về ví · trong kỳ");
    expect(dashboard).toContain("Nạp + phí · trong kỳ");
  });

  it("makes Budget status dense and scannable", () => {
    expect(dashboard).toContain("const budgetAttentionHealthyCount = Math.max(");
    expect(dashboard).toContain("const budgetAttentionNeedsReviewCount =");
    expect(dashboard).toContain(">Trong hạn</p>");
    expect(dashboard).toContain(">Cần chú ý</p>");
    expect(dashboard).toContain(">Vượt</p>");
  });

  it("keeps KPI and daily cards neutral while reserving semantic color for values/icons", () => {
    expect(dashboard.split('border: "border-[#DCE8F1]"').length - 1).toBe(4);
    expect(dashboard).toContain('card: "border-[#DCE8F1] bg-[#FCFEFF]"');
  });

  it("treats zero-income Financial Structure as no-data, not a judgement", () => {
    expect(dashboard).toContain('financialStructureAdjusted.income <= 0');
    expect(dashboard).toContain('? "Chưa đủ dữ liệu thu nhập"');
    expect(dashboard).toContain('? "neutral"');
    expect(dashboard).toContain('item.tone === "neutral"');
  });

  it("de-emphasizes realtime status without removing realtime behavior", () => {
    expect(header).toContain('className="hidden h-10 items-center gap-1.5 px-1.5 text-[11px] font-bold text-[#60778D] lg:flex"');
    expect(header).toContain('connected ? "Online" : "Sync..."');
    expect(header).toContain('const { status, lastSync } = useRealtime();');
  });
});
