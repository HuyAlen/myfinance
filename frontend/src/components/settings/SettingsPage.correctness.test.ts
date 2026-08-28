import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");
const normalized = source.replace(/\s+/g, " ");

function regionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("SettingsPage persisted preferences, safe mutations and recoverable readiness (SETTINGS-CORRECTNESS-1)", () => {
  it("persists a versioned per-user local settings snapshot instead of showing fake save feedback", () => {
    expect(source).toContain("SETTINGS_LOCAL_VERSION");
    expect(source).toContain("myfinance-settings-v${SETTINGS_LOCAL_VERSION}:${user?.id ?? \"anonymous\"}");
    const save = regionBetween("function handleSavePrefs() {", "function getAISettingsPayload()");
    expect(save).toContain("window.localStorage.setItem(");
    expect(save).toContain("buildLocalSettingsSnapshot()");
  });

  it("restores profile, preferences, finance thresholds, AI modules and notification toggles from persistence", () => {
    expect(source).toContain("window.localStorage.getItem(localSettingsKey)");
    for (const setter of [
      "setProfileName", "setProfilePhone", "setTimezone", "setLang", "setCurrency",
      "setDateFormat", "setDefaultPage", "setTheme", "setFinMonth", "setSavingsGoal",
      "setBudgetAlert", "setDebtAlert", "setEmergencyFund", "setAiInsights", "setAiForecast",
      "setAiRisk", "setAiGoalCoach", "setAiInvestCoach", "setNotifBudget", "setNotifGoal",
      "setNotifDebt", "setNotifInvest", "setNotifWeekly", "setNotifMonthly",
    ]) expect(source).toContain(`${setter}(`);
  });

  it("makes profile inputs controlled instead of uncontrolled placeholders", () => {
    expect(normalized).toContain('label="Họ và tên" value={profileName} onChange={setProfileName}');
    expect(normalized).toContain('label="Số điện thoại" value={profilePhone} onChange={setProfilePhone}');
    expect(normalized).toContain('label="Múi giờ" value={timezone} onChange={setTimezone}');
    expect(source).toContain('value={value ?? ""}');
    expect(source).not.toContain("defaultValue={value}");
  });

  it("validates finance preference ranges before persistence", () => {
    const save = regionBetween("function handleSavePrefs() {", "function getAISettingsPayload()");
    expect(save).toContain('"Mục tiêu tiết kiệm", savingsGoal, 0, 100');
    expect(save).toContain('"Ngưỡng cảnh báo ngân sách", budgetAlert, 0, 100');
    expect(save).toContain('"Ngưỡng cảnh báo nợ", debtAlert, 0, 100');
    expect(save).toContain('"Quỹ khẩn cấp", emergencyFund, 1, 24');
    expect(save).toContain("Number.isFinite(value)");
  });

  it("bounds every stat read and retries an initial failure", () => {
    const reload = regionBetween("const reloadStats = useCallback", "const runStatsReload");
    for (const label of ["wallets", "categories", "transactions", "debts", "goals"]) {
      expect(reload).toContain(`withSettingsTimeout(`);
      expect(reload).toContain(`\"${label}\"`);
    }
    expect(source).toContain("SETTINGS_STATS_TIMEOUT_MS = 10_000");
    expect(source).toContain("SETTINGS_INITIAL_RETRY_MS = 750");
  });

  it("preserves last-known-good stat counts on refresh failure", () => {
    const reload = regionBetween("const reloadStats = useCallback", "const runStatsReload");
    const catchRegion = reload.slice(reload.indexOf("} catch (error) {"));
    expect(catchRegion).not.toContain("setStats({");
    expect(catchRegion).toContain("statsLoadedRef.current");
    expect(catchRegion).toContain("Đang giữ dữ liệu gần nhất");
  });

  it("coalesces overlapping stat reloads and recovers on foreground/online", () => {
    expect(source).toContain("statsReloadingRef.current");
    expect(source).toContain("statsPendingReloadRef.current");
    expect(source).toContain('document.addEventListener("visibilitychange", onVisibility)');
    expect(source).toContain('window.addEventListener("online", onOnline)');
  });

  it("provides a retry action for failed stats", () => {
    expect(source).toContain("{statsLoadError && (");
    expect(source).toContain("onClick={() => void runStatsReload()}");
    expect(source).toContain("Thử lại");
  });

  it("bounds the AI settings read instead of allowing an infinite settings spinner", () => {
    expect(normalized).toContain('withSettingsTimeout( getAIFinanceSettings(accessToken), "AI settings", )');
    expect(source).toContain("const loadAISettings = useCallback(async (): Promise<boolean> => {");
    expect(source).toContain("void loadAISettings()");
    expect(source).toContain("aiSettingsLoadError");
  });

  it("validates AI temperature and max-token ranges before save or test", () => {
    const validation = regionBetween("function validateAISettingsDraft()", "async function handleSaveAISettings()");
    expect(validation).toContain("temperature < 0 || temperature > 2");
    expect(validation).toContain("maxTokens < 512 || maxTokens > 8192");
    expect(validation).toContain("Number.isInteger(maxTokens)");
    expect(regionBetween("async function handleSaveAISettings()", "function handleRemoveAIApiKey()")).toContain("validateAISettingsDraft()");
    expect(regionBetween("async function handleTestAIConnection()", "// ── RENDER")).toContain("validateAISettingsDraft()");
  });

  it("testing AI connection has no hidden save side effect", () => {
    const testRegion = regionBetween("async function handleTestAIConnection()", "// ── RENDER");
    expect(testRegion).toContain("testAIFinanceConnection(accessToken)");
    expect(testRegion).not.toContain("saveAIFinanceSettings(");
    expect(testRegion).toContain("Hãy lưu cấu hình trước khi kiểm tra kết nối");
  });

  it("guards destructive reset and clear against duplicate execution", () => {
    const reset = regionBetween("async function handleResetDemo()", "async function handleClearAll()");
    const clear = regionBetween("async function handleClearAll()", "async function handleExportJson()");
    for (const region of [reset, clear]) {
      expect(region).toContain("if (destructiveInFlightRef.current) return");
      expect(region).toContain("destructiveInFlightRef.current = true");
      expect(region).toContain("destructiveInFlightRef.current = false");
    }
  });

  it("guards backup restore against duplicate confirmation execution", () => {
    const restore = regionBetween("function requestBackupRestore(", "function handleImportJson(");
    expect(restore).toContain("if (restoreInFlightRef.current) return");
    expect(restore).toContain("restoreInFlightRef.current = true");
    expect(restore).toContain("restoreInFlightRef.current = false");
  });

  it("does not describe cloud deletion as device-only deletion", () => {
    expect(source).toContain("toàn bộ dữ liệu tài chính trong tài khoản này trên cloud");
    expect(source).not.toContain("dữ liệu tài chính trên thiết bị hiện tại");
  });

  it("offers explicit save actions for AI module and notification preferences", () => {
    expect(source).toContain("Lưu tính năng AI");
    expect(source).toContain("Lưu thông báo");
  });
});
