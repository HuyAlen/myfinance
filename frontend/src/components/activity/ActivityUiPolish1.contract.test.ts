import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "ActivityPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("ACTIVITY-UI-POLISH-1", () => {
  it("uses the full AppShell content width instead of a narrow max-w-6xl wrapper", () => {
    expect(source).toContain('data-activity-center="true"');
    expect(source).toContain(
      'className="w-full space-y-3 overflow-x-hidden pb-5 pt-1 md:space-y-5 md:pb-0 md:pt-0"',
    );
    expect(source).not.toContain("mx-auto w-full max-w-6xl");
  });

  it("strengthens the Activity hero hierarchy without changing read-only semantics", () => {
    expect(source).toContain('data-activity-hero="true"');
    expect(source).toContain("sm:text-3xl");
    expect(source).toContain("Trung tâm nhật ký");
    expect(source).toContain("Chỉ đọc");
    expect(source).toContain("Lịch sử hoạt động");
  });

  it("keeps desktop filters compact and mobile filters separate", () => {
    expect(source).toContain('data-activity-desktop-filters="true"');
    expect(source).toContain("Xử lý trên máy chủ · theo kỳ đang chọn");
    expect(source).toContain("focus:ring-4 focus:ring-blue-100");
    expect(source).toContain('aria-labelledby="activity-filter-sheet-title"');
    expect(source).toContain("sm:hidden");
  });

  it("improves actor readability with explicit self/member chips", () => {
    expect(source).toContain(
      "const isCurrentActor = event.actor_user_id === user?.id;",
    );
    expect(source).toContain("Bạn");
    expect(source).toContain("Thành viên");
    expect(source).toContain("{actorEmail}");
    expect(source).toContain("{actorRoleLabel}");
  });

  it("keeps the audit row change summary prominent and details structured", () => {
    expect(source).toContain(
      "sm:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.1fr)]",
    );
    expect(source).toContain("font-black text-slate-600");
    expect(source).toContain(
      "sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-5",
    );
  });

  it("right-aligns the pager on desktop while preserving full mobile width", () => {
    expect(source).toContain(
      "sm:ml-auto sm:w-fit sm:min-w-[430px]",
    );
    expect(source).toContain('aria-label="Phân trang lịch sử hoạt động"');
  });

  it("does not change audit loading, filtering or cursor-pagination behavior", () => {
    expect(source).toContain("getFinanceAuditEvents({");
    expect(source).toContain("entityType:");
    expect(source).toContain("action:");
    expect(source).toContain("actorUserId:");
    expect(source).toContain("const goOlder = () =>");
    expect(source).toContain("const goNewer = () =>");
  });
});
