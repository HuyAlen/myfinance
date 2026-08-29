import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const activityPage = readFileSync(
  path.join(repoRoot, "frontend/src/components/activity/ActivityPage.tsx"),
  "utf8",
);
const presentation = readFileSync(
  path.join(
    repoRoot,
    "frontend/src/components/activity/activityAuditPresentation.ts",
  ),
  "utf8",
);

describe("AUDIT-UI-1.1 compact activity hierarchy", () => {
  it("suppresses the global quick-action FAB while the read-only activity ledger is open", () => {
    expect(activityPage).toContain(
      'import { useSuppressGlobalFabsWhileOpen } from "@/src/components/layout/FabVisibilityProvider"',
    );
    expect(activityPage).toContain("useSuppressGlobalFabsWhileOpen(true)");
  });

  it("keeps the activity workspace intentionally bounded on wide desktop screens", () => {
    expect(activityPage).toContain("max-w-6xl");
    expect(activityPage).toContain("Lịch sử hoạt động");
    expect(activityPage).not.toContain(
      "bg-linear-to-br from-blue-50 via-white to-cyan-50",
    );
  });

  it("keeps filters compact and sticky under the application header", () => {
    expect(activityPage).toContain("sticky top-0 z-20");
    expect(activityPage).toContain("activeFilterCount");
    expect(activityPage).toContain("clearFilters");
    expect(activityPage).toContain("Xóa lọc");
  });

  it("uses dense expandable ledger rows instead of tall cards", () => {
    expect(activityPage).toContain("<details");
    expect(activityPage).toContain('min-h-[72px]');
    expect(activityPage).toContain("Nhấn để xem chi tiết");
    expect(activityPage).toContain("group-open:rotate-90");
  });

  it("keeps actor, role and event time compact while preserving full detail on expansion", () => {
    expect(activityPage).toContain("actorLabel");
    expect(activityPage).toContain("ROLE_LABELS[event.actor_role]");
    expect(activityPage).toContain("formatEventClock(event.created_at)");
    expect(activityPage).toContain("formatEventTime(event.created_at)");
  });

  it("gives true old and new values equal readable columns while preserving action-specific headings", () => {
    expect(activityPage).toContain(
      "grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)]",
    );
    expect(activityPage).toContain("line-through decoration-slate-300");
    expect(activityPage).toContain("font-black text-blue-700");
    expect(activityPage).toContain("presentation.heading");
    expect(presentation).toContain('heading: "Trước → Sau"');
    expect(presentation).toContain('heading: "Dữ liệu đã tạo"');
    expect(presentation).toContain('heading: "Dữ liệu đã xóa"');
  });
});
