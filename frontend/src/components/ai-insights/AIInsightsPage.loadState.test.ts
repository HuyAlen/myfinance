import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AIInsightsPage distinguishes first-load failure from last-known-good refreshes (FINANCE-DATA-1B)", () => {
  const source = readFileSync(path.resolve(__dirname, "AIInsightsPage.tsx"), "utf8");
  const normalized = source.replace(/\s+/g, " ");

  it("declares loading, error, and successful-snapshot readiness state", () => {
    expect(source).toContain("isLoadingInsights");
    expect(source).toContain("insightsLoadError");
    expect(source).toContain("isInsightsDataReady");
    expect(source).toContain("setIsInsightsDataReady(true)");
  });

  it("never clears the seven data arrays when a refresh fails", () => {
    const start = source.indexOf("const reloadData = useCallback");
    const end = source.indexOf("const runReload = useCallback", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    for (const setter of [
      "setWallets([]",
      "setCategories([]",
      "setTransactions([]",
      "setDebts([]",
      "setGoals([]",
      "setInvestments([]",
      "setBudgets([]",
    ]) {
      expect(catchSource).not.toContain(setter);
    }
  });

  it("withholds analysis only when no successful snapshot exists yet", () => {
    expect(normalized).toContain("if (isLoadingInsights && !isInsightsDataReady) { return (");
    expect(normalized).toContain("if (insightsLoadError && !isInsightsDataReady) { return (");
  });

  it("keeps last-known-good analytics visible and offers retry after refresh failure", () => {
    expect(normalized).toContain("{insightsLoadError && isInsightsDataReady && (");
    expect(source).toContain("Đang hiển thị dữ liệu gần nhất đã tải thành công.");
    expect(source).toContain("onClick={() => void runReload()}");
  });

  it("declares no hooks after the first-load early-return gates", () => {
    const gateIdx = source.indexOf("if (isLoadingInsights && !isInsightsDataReady) {");
    expect(gateIdx).toBeGreaterThan(-1);
    const rest = source.slice(gateIdx);
    for (const hook of ["useState(", "useEffect(", "useMemo(", "useCallback(", "useRef("]) {
      expect(rest.indexOf(hook)).toBe(-1);
    }
  });
});
