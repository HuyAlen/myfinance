import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX conditionals since this repo's files are CRLF.
 *
 * SettingsPage's stat pills (Ví tiền/Danh mục/Giao dịch/Khoản nợ/Mục
 * tiêu) rendered `stats.*` unconditionally — a failed initial
 * reloadStats() showed "0" on every pill, indistinguishable from a
 * genuinely fresh account. Proves the pills now withhold the real number
 * until the first load has settled successfully.
 */
describe("SettingsPage stat pills distinguish load failure from a real zero (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SettingsPage.tsx"),
    "utf8",
  );

  it("declares isLoadingStats (default true) and statsLoadError state", () => {
    expect(source).toContain("isLoadingStats");
    expect(source).toContain("statsLoadError");
  });

  it("reloadStats clears the error on success and sets a message on failure, without touching stats", () => {
    const start = source.indexOf("const reloadStats = useCallback(async (): Promise<boolean> => {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setStatsLoadError(null)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setStatsLoadError(");
    expect(catchSource).not.toContain("setStats({");
    expect(catchSource).toContain("setIsLoadingStats(false)");
  });

  it("both stat-pill rendering sites withhold the real count until loaded, without ever rendering a bare stats.value", () => {
    const occurrences = source.split(
      'isLoadingStats ? "…" : statsLoadError ? "–" : s.value',
    ).length - 1;
    expect(occurrences).toBe(2);
  });

  it("handleExportJson is left unchanged (already correct from 1A) — still has its own error toast", () => {
    const start = source.indexOf("async function handleExportJson() {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(
      "Không thể xuất dữ liệu. Vui lòng thử lại.",
      start,
    );
    expect(end).toBeGreaterThan(start);
    const region = source.slice(start, end + 60);
    expect(region).toContain('variant: "error"');
  });
});
