import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "SettingsPage.tsx"), "utf8");

describe("SettingsPage FINANCE-DATA-2 backup flow", () => {
  it("exports through the canonical single-RPC service instead of assembling pf_* collections", () => {
    const start = source.indexOf("async function handleExportJson() {");
    const end = source.indexOf("function requestBackupRestore", start);
    const region = source.slice(start, end);

    expect(region).toContain("exportFinanceBackup()");
    expect(region).not.toContain("Promise.all(");
    expect(region).not.toContain("pf_wallets");
  });

  it("validates the selected file before offering the destructive restore confirmation", () => {
    const start = source.indexOf("function handleImportJson(");
    const end = source.indexOf("// ── Scroll-to helper", start);
    const region = source.slice(start, end);

    expect(region).toContain("validateFinanceBackup(parsed)");
    expect(region).toContain("if (!validation.ok)");
    expect(region).toContain("requestBackupRestore(validation.backup, file.name)");
  });

  it("performs restore only from the confirmation action", () => {
    const start = source.indexOf("function requestBackupRestore(");
    const end = source.indexOf("function handleImportJson(", start);
    const region = source.slice(start, end);

    expect(region).toContain("setPendingAction({");
    expect(region).toContain("onConfirm: async () => {");
    expect(region).toContain("restoreFinanceBackup(backup)");
    expect(region).toContain("transaction server-authoritative");
    expect(region).toContain("rollback");
    expect(region).toContain("half-restored");
  });
});
