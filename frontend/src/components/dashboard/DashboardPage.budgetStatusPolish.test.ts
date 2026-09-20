import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("DashboardPage budget status polish", () => {
  const source = readFileSync(
    path.resolve(__dirname, "DashboardPage.tsx"),
    "utf8",
  );

  const sectionStart = source.indexOf("{/* Budget attention */}");
  const sectionEnd = source.indexOf(
    "{/* UI-DASH-1: monthly progress",
    sectionStart,
  );
  const sectionSource = source.slice(sectionStart, sectionEnd);

  it("summarizes the aggregate over-budget amount without a misleading positive sign", () => {
    expect(source).toContain("const budgetAttentionTotalOverAmount = useMemo(");
    expect(source).toContain("sum + item.overAmount");
    expect(sectionSource).toContain("Tổng vượt");
    expect(sectionSource).toContain("{formatVND(budgetAttentionTotalOverAmount)}");
    expect(sectionSource).not.toContain(
      "+{formatVND(budgetAttentionTotalOverAmount)}",
    );
  });

  it("labels each over-budget amount explicitly and removes the ambiguous overflow bars", () => {
    expect(sectionSource).toContain("Vượt {formatVND(item.overAmount)}");
    expect(sectionSource).toContain("{item.usagePercent}% đã dùng");
    expect(sectionSource).not.toContain("+{formatVND(item.overAmount)}");
    expect(sectionSource).not.toContain("item.usagePercent - 100");
    expect(sectionSource).not.toContain(
      "budgetAttention.topWarning.usagePercent,\n                            100",
    );
  });

  it("keeps every canonical over-budget item clickable by its own budget id", () => {
    expect(sectionSource).toContain("budgetAttention.overBudgetItems.map(");
    expect(sectionSource).not.toMatch(/overBudgetItems\s*\.\s*slice\(/);
    expect(sectionSource).toContain(
      "buildBudgetsHref({ budgetId: item.budgetId })",
    );
  });

  it("uses a compact contextual footer CTA instead of a full-width action", () => {
    expect(sectionSource).toContain('"Xem tất cả ngân sách"');
    expect(sectionSource).toContain("<ArrowUpRight size={15} />");
    expect(sectionSource).toContain("inline-flex min-h-10");
    expect(sectionSource).not.toContain(
      'className="mt-4 flex min-h-11 w-full items-center justify-center',
    );
  });
});
