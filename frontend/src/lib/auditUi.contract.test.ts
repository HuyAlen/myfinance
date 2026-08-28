import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relative: string) =>
  readFileSync(path.join(repoRoot, relative), "utf8");

const pageRoute = read("frontend/app/activity/page.tsx");
const activityPage = read("frontend/src/components/activity/ActivityPage.tsx");
const service = read("frontend/src/services/finance/auditService.ts");
const sidebar = read("frontend/src/components/layout/Sidebar.tsx");
const bottomNav = read("frontend/src/components/layout/BottomNav.tsx");
const householdCard = read(
  "frontend/src/components/settings/HouseholdSettingsCard.tsx",
);

const financeTables = [
  "wallets",
  "categories",
  "transactions",
  "debts",
  "goals",
  "budgets",
  "investments",
  "savings",
  "saving_transactions",
  "forex_accounts",
  "forex_cash_transactions",
];

describe("AUDIT-UI-1 Activity History & Changed by UX", () => {
  it("adds a protected AppShell activity route", () => {
    expect(pageRoute).toContain(
      'import AppShell from "@/src/components/layout/AppShell"',
    );
    expect(pageRoute).toContain(
      'import ActivityPage from "@/src/components/activity/ActivityPage"',
    );
    expect(pageRoute).toContain("<AppShell>");
    expect(pageRoute).toContain("<ActivityPage />");
  });

  it("keeps the audit data service strictly read-only", () => {
    expect(service).toContain('.from("finance_audit_log")');
    expect(service).toContain(".select(SELECT_FIELDS)");
    expect(service).toContain('.order("created_at", { ascending: false })');
    expect(service).toContain('.order("id", { ascending: false })');
    expect(service).toContain(".limit(pageSize + 1)");
    expect(service).not.toContain(".insert(");
    expect(service).not.toContain(".update(");
    expect(service).not.toContain(".delete(");
    expect(service).not.toContain(".upsert(");
  });

  it("offers server-side filters for entity, action, actor and selected date range", () => {
    expect(service).toContain('.eq("entity_type", options.entityType)');
    expect(service).toContain('.eq("action", options.action)');
    expect(service).toContain('.eq("actor_user_id", options.actorUserId)');
    expect(service).toContain('.gte("created_at", options.createdFrom)');
    expect(service).toContain('.lte("created_at", options.createdTo)');
    expect(activityPage).toContain("useDateFilter");
    expect(activityPage).toContain("entityFilter");
    expect(activityPage).toContain("actionFilter");
    expect(activityPage).toContain("actorFilter");
  });

  it("covers every finance mutation domain activated by AUDIT-MUTATION-1", () => {
    for (const table of financeTables) {
      expect(service).toContain(`"${table}"`);
      expect(activityPage).toContain(`${table}:`);
    }
  });

  it("renders real actor attribution and household context instead of generic shared-account copy", () => {
    expect(activityPage).toContain("useHousehold");
    expect(activityPage).toContain("event.actor_user_id");
    expect(activityPage).toContain("event.actor_email");
    expect(activityPage).toContain("event.actor_role");
    expect(activityPage).toContain("Người thay đổi");
    expect(activityPage).toContain("household?.name");
  });

  it("surfaces before/after field changes without exposing only raw JSON", () => {
    expect(activityPage).toContain("getFieldChanges");
    expect(activityPage).toContain("event.before_data");
    expect(activityPage).toContain("event.after_data");
    expect(activityPage).toContain("formatAuditValue");
    expect(activityPage).toContain("Trước → Sau");
    expect(activityPage).toContain("→");
  });

  it("uses stable cursor pagination with an explicit page boundary instead of unbounded append", () => {
    expect(service).toContain("FinanceAuditCursor");
    expect(service).toContain("nextCursor");
    expect(service).toContain("created_at.lt.${createdAt}");
    expect(activityPage).toContain("Mới hơn");
    expect(activityPage).toContain("Cũ hơn");
    expect(activityPage).toContain("cursorHistory");
    expect(activityPage).not.toContain("Tải thêm lịch sử");
    expect(activityPage).not.toContain("dedupeEvents");
  });

  it("makes activity discoverable from desktop, mobile More state and household settings", () => {
    expect(sidebar).toContain(
      '{ label: "Hoạt động", icon: History, href: "/activity" }',
    );
    expect(bottomNav).toContain('"/activity"');
    expect(householdCard).toContain('href="/activity"');
    expect(householdCard).toContain("Lịch sử hoạt động");
  });

  it("communicates immutable audit semantics and honest non-backfill behavior", () => {
    expect(activityPage).toContain("Chỉ đọc");
    expect(activityPage).toContain("không được tự suy diễn hoặc backfill");
    expect(activityPage).toContain("Đang giữ lịch sử đã tải gần nhất.");
  });
});
