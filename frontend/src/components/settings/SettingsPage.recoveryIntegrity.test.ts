import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "./SettingsPage.tsx"),
  "utf8",
);

function regionBetween(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to);
}

describe("SETTINGS-RECOVERY-INTEGRITY-1 Settings orchestration", () => {
  it("uses one cross-action guard for Reset, Clear and Restore", () => {
    const reset = regionBetween(
      "async function handleResetDemo()",
      "async function handleClearAll()",
    );
    const clear = regionBetween(
      "async function handleClearAll()",
      "async function handleExportJson()",
    );
    const restore = regionBetween(
      "function requestBackupRestore(",
      "function handleImportJson(",
    );

    expect(source).toContain("const recoveryInFlightRef = useRef(false)");
    for (const region of [reset, clear, restore]) {
      expect(region).toContain("if (recoveryInFlightRef.current)");
      expect(region).toContain("recoveryInFlightRef.current = true");
      expect(region).toContain("recoveryInFlightRef.current = false");
      expect(region).toContain("Một thao tác khôi phục dữ liệu khác đang chạy");
    }
  });

  it("describes the server transaction and rollback guarantee without promising an unsafe client-side rollback", () => {
    const restore = regionBetween(
      "function requestBackupRestore(",
      "function handleImportJson(",
    );

    expect(restore).toContain("transaction server-authoritative");
    expect(restore).toContain("lỗi trước khi commit sẽ rollback ");
    expect(restore).toContain("toàn bộ, không để trạng thái half-restored");
    expect(restore).not.toContain("Nếu bất kỳ bước nào thất bại");
  });
});
