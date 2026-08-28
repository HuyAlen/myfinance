import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");

function regionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("SETTINGS-DOMAIN-CONSISTENCY-1 backup, stats and domain coverage", () => {
  it("uses the canonical backup version for both file naming and user-facing copy", () => {
    expect(source).toContain("FINANCE_BACKUP_VERSION");
    expect(source).toContain("`myfinance-backup-v${FINANCE_BACKUP_VERSION}-`");
    expect(source).toContain("MyFinance V{FINANCE_BACKUP_VERSION}");
    expect(source).not.toContain("file JSON backup V2");
    expect(source).not.toContain("backup MyFinance V2");
  });

  it("keeps V2 compatibility copy distinct from the current V3 export contract", () => {
    expect(source).toContain("Backup V2 hợp lệ vẫn được hỗ trợ");
    expect(source).toContain("backup legacy thiếu dữ liệu bắt buộc sẽ bị từ chối an toàn");
  });

  it("loads counts for Budgets, Investments, Savings and Forex accounts with the same failure boundary as existing stats", () => {
    const reload = regionBetween(
      "const reloadStats = useCallback(async (): Promise<boolean> => {",
      "const runStatsReload = useCallback",
    );

    for (const reader of [
      "getBudgets()",
      "getInvestments()",
      "getSavings()",
      "getForexAccounts()",
    ]) {
      expect(reload).toContain(reader);
    }

    expect(reload).toContain("budgets: budgets.length");
    expect(reload).toContain("investments: investments.length");
    expect(reload).toContain("savings: savings.length");
    expect(reload).toContain("forex: forexAccounts.length");
  });

  it("defines one shared stat registry covering every primary Settings finance domain", () => {
    const registry = regionBetween("const SETTINGS_STAT_ITEMS = [", "] as const satisfies");

    for (const label of [
      "Ví tiền",
      "Danh mục",
      "Giao dịch",
      "Khoản nợ",
      "Mục tiêu",
      "Ngân sách",
      "Đầu tư",
      "Tiết kiệm",
      "Forex",
    ]) {
      expect(registry).toContain(label);
    }

    expect(source.split("statItems.map((s) => (").length - 1).toBe(2);
  });

  it("describes backup and restore coverage for the four previously omitted domains", () => {
    const dataSection = regionBetween('id="settings-data"', 'id="settings-security"');
    for (const label of ["Ngân sách", "Đầu tư", "Tiết kiệm", "Forex"]) {
      expect(dataSection).toContain(label);
    }
    expect(dataSection).toContain("lịch sử Net Worth");
  });
});
