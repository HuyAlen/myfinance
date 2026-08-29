import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const activityPage = read("frontend/src/components/activity/ActivityPage.tsx");
const presentation = read(
  "frontend/src/components/activity/activityAuditPresentation.ts",
);

describe("ACTIVITY-DATA-1 accurate audit semantics", () => {
  it("loads canonical finance labels for references shown inside audit snapshots", () => {
    for (const getter of [
      "getWallets()",
      "getCategories()",
      "getSavings()",
      "getForexAccounts()",
    ]) {
      expect(activityPage).toContain(getter);
    }
    expect(activityPage).toContain("createAuditReferenceLabels");
    expect(presentation).toContain("resolveReference");
    expect(presentation).toContain('categoryId: "Danh mục"');
    expect(presentation).toContain('walletId: "Ví"');
  });

  it("compares complete update snapshots and excludes technical metadata from change counts", () => {
    expect(presentation).toContain("getChangedRows");
    expect(presentation).toContain("valuesEqual");
    expect(presentation).toContain('"user_id"');
    expect(presentation).toContain('"created_at"');
    expect(presentation).toContain('"updated_at"');
    expect(presentation).toContain('mode: "changes"');
    expect(presentation).toContain('heading: "Trước → Sau"');
    expect(presentation).toContain('return `${count} trường thay đổi`');
  });

  it("fails honest for legacy updates that do not contain both snapshots", () => {
    expect(presentation).toContain('rows.length > 0 ? "snapshot" : "empty"');
    expect(presentation).toContain('heading: "Dữ liệu ghi nhận"');
    expect(presentation).toContain("incompleteComparison: true");
    expect(activityPage).toContain(
      "không suy diễn trường thay đổi",
    );
  });

  it("uses create/delete snapshot semantics instead of mislabeling them as before-after changes", () => {
    expect(presentation).toContain('rows.length > 0 ? "created" : "empty"');
    expect(presentation).toContain('heading: "Dữ liệu đã tạo"');
    expect(presentation).toContain('rows.length > 0 ? "deleted" : "empty"');
    expect(presentation).toContain('heading: "Dữ liệu đã xóa"');
    expect(presentation).toContain('return `${count} trường dữ liệu`');
  });

  it("translates engine enums and boolean values into finance language", () => {
    expect(presentation).toContain('expense: "Chi tiêu"');
    expect(presentation).toContain('income: "Thu nhập"');
    expect(presentation).toContain('wallet: "Ví tiền"');
    expect(presentation).toContain('external: "Bên ngoài"');
    expect(presentation).toContain('return value ? "Có" : "Không"');
  });
});
