import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");

describe("SETTINGS-HOUSEHOLD-DATA-SAFETY-1 UI contract", () => {
  it("uses the authenticated HouseholdProvider and a fail-closed access helper", () => {
    expect(source).toContain("useHousehold()");
    expect(source).toContain("resolveBackupWorkspaceAccess(");
    expect(source).toContain("if (!expectedWorkspaceId) return;");
  });
  it("passes an explicit workspace ID through each dangerous path", () => {
    for (const operation of [
      "exportFinanceBackup(expectedWorkspaceId)",
      "restoreFinanceBackup(backup, expectedWorkspaceId)",
      "resetFinanceDemoData(expectedWorkspaceId)",
      "clearAllUserData(expectedWorkspaceId)",
    ]) {
      expect(source).toContain(operation);
    }
  });
  it("blocks both reset buttons, import, export and delete when scope is not owner", () => {
    expect((source.match(/disabled=\{!backupAccess\.allowed\}/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(source).toContain('data-settings-backup-scope={backupAccess.allowed ? "owner" : "blocked"}');
    expect(source).toContain('data-settings-danger-workspace="true"');
  });
  it("displays the actual destination workspace in destructive confirmation", () => {
    expect(source).toContain('`Đặt lại dữ liệu mẫu trong ${backupAccess.workspaceName}?`');
    expect(source).toContain('`Xóa toàn bộ dữ liệu trong ${backupAccess.workspaceName}?`');
    expect(source).toContain('`Khôi phục vào ${backupAccess.workspaceName}?`');
  });
  it("does not issue a scoped RPC until JSON validation has succeeded", () => {
    const start = source.indexOf("function handleImportJson(");
    const end = source.indexOf("// ── Scroll-to helper", start);
    const part = source.slice(start, end);
    expect(part.indexOf("validateFinanceBackup(parsed)")).toBeLessThan(part.indexOf("requestBackupRestore(validation.backup"));
  });
});
