import { describe, expect, it } from "vitest";
import type { FinanceAuditEvent } from "@/src/services/finance/auditService";
import {
  buildAuditPresentation,
  createAuditReferenceLabels,
  formatAuditValue,
} from "./activityAuditPresentation";

function event(
  action: "insert" | "update" | "delete",
  beforeData: FinanceAuditEvent["before_data"],
  afterData: FinanceAuditEvent["after_data"],
): FinanceAuditEvent {
  return {
    id: "audit-1",
    household_id: "household-1",
    finance_owner_user_id: "owner-1",
    actor_user_id: "actor-1",
    actor_email: "member@example.com",
    actor_role: "member",
    entity_type: "transactions",
    entity_id: "transaction-1",
    action,
    before_data: beforeData,
    after_data: afterData,
    metadata: {},
    request_id: null,
    transaction_id: 16044,
    created_at: "2026-08-29T14:15:31.773785+00:00",
  } as FinanceAuditEvent;
}

const references = createAuditReferenceLabels({
  categories: [
    { id: "category-food", name: "Ăn Uống" },
    { id: "category-family", name: "Gia Đình Phát Sinh" },
  ],
  wallets: [
    { id: "wallet-cash", name: "Tiền Mặt" },
    { id: "wallet-bank", name: "Vietcombank" },
  ],
  savings: [{ id: "saving-july", name: "Tiết kiệm tháng 07" }],
  forexAccounts: [{ id: "forex-main", name: "FX-Capital" }],
});

describe("ACTIVITY-DATA-1 audit presentation", () => {
  it("counts only real business changes for updates and ignores technical metadata", () => {
    const presentation = buildAuditPresentation(
      event(
        "update",
        {
          id: "transaction-1",
          user_id: "owner-1",
          updated_at: "2026-08-29T14:00:00Z",
          type: "expense",
          amount: 70000,
          note: "Cắt tóc",
          categoryId: "category-food",
          walletId: "wallet-cash",
          source_type: "wallet",
          destination_type: "external",
        },
        {
          id: "transaction-1",
          user_id: "owner-1",
          updated_at: "2026-08-29T14:15:31Z",
          type: "expense",
          amount: 70000,
          note: "Cắt tóc nam",
          categoryId: "category-family",
          walletId: "wallet-cash",
          source_type: "wallet",
          destination_type: "external",
        },
      ),
      references,
    );

    expect(presentation.mode).toBe("changes");
    expect(presentation.heading).toBe("Trước → Sau");
    expect(presentation.countText).toBe("2 trường thay đổi");
    expect(presentation.rows.map((row) => row.key)).toEqual([
      "note",
      "categoryId",
    ]);
    expect(presentation.rows[0]).toMatchObject({
      label: "Ghi chú",
      beforeText: "Cắt tóc",
      afterText: "Cắt tóc nam",
    });
    expect(presentation.rows[1]).toMatchObject({
      label: "Danh mục",
      beforeText: "Ăn Uống",
      afterText: "Gia Đình Phát Sinh",
    });
  });

  it("never claims a true update diff when an old audit row is missing one snapshot", () => {
    const presentation = buildAuditPresentation(
      event(
        "update",
        null,
        {
          type: "expense",
          amount: 70000,
          note: "Cắt tóc",
          categoryId: "category-food",
        },
      ),
      references,
    );

    expect(presentation.mode).toBe("snapshot");
    expect(presentation.heading).toBe("Dữ liệu ghi nhận");
    expect(presentation.incompleteComparison).toBe(true);
    expect(presentation.countText).toBe("4 trường dữ liệu");
    expect(presentation.primaryText).toContain("không đủ snapshot trước/sau");
  });

  it("uses create/delete semantics instead of presenting snapshots as changed fields", () => {
    const created = buildAuditPresentation(
      event("insert", null, { note: "Ăn trưa", amount: 120000 }),
      references,
    );
    const deleted = buildAuditPresentation(
      event("delete", { note: "Ăn trưa", amount: 120000 }, null),
      references,
    );

    expect(created.mode).toBe("created");
    expect(created.heading).toBe("Dữ liệu đã tạo");
    expect(created.countText).toBe("2 trường dữ liệu");
    expect(deleted.mode).toBe("deleted");
    expect(deleted.heading).toBe("Dữ liệu đã xóa");
    expect(deleted.countText).toBe("2 trường dữ liệu");
  });

  it("resolves entity references and canonical finance enums to user-facing labels", () => {
    expect(formatAuditValue("categoryId", "category-food", references)).toBe(
      "Ăn Uống",
    );
    expect(formatAuditValue("wallet_id", "wallet-bank", references)).toBe(
      "Vietcombank",
    );
    expect(formatAuditValue("saving_id", "saving-july", references)).toBe(
      "Tiết kiệm tháng 07",
    );
    expect(formatAuditValue("forex_account_id", "forex-main", references)).toBe(
      "FX-Capital",
    );
    expect(formatAuditValue("type", "expense", references)).toBe("Chi tiêu");
    expect(formatAuditValue("source_type", "wallet", references)).toBe("Ví tiền");
    expect(formatAuditValue("destination_type", "external", references)).toBe(
      "Bên ngoài",
    );
    expect(formatAuditValue("isRecurring", false, references)).toBe("Không");
  });

  it("does not expose a full raw UUID when a referenced entity no longer resolves", () => {
    const missingId = "29d4fcc1-c3a9-41a7-a83c-57ea681813f2";
    const label = formatAuditValue("categoryId", missingId, references);
    expect(label).toContain("Danh mục");
    expect(label).not.toContain(missingId);
    expect(label).toContain("29d4fc…13f2");
  });
});
