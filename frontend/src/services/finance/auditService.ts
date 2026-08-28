import { supabase } from "@/src/lib/supabase";
import type { Database } from "@/src/lib/database.types";

export const AUDIT_ENTITY_TYPES = [
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
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditAction = "insert" | "update" | "delete";
export type FinanceAuditEvent =
  Database["public"]["Tables"]["finance_audit_log"]["Row"];

export type FinanceAuditCursor = {
  createdAt: string;
  id: string;
};

export type FinanceAuditQuery = {
  cursor?: FinanceAuditCursor | null;
  pageSize?: number;
  entityType?: AuditEntityType | "all";
  action?: AuditAction | "all";
  actorUserId?: string | "all";
  createdFrom?: string;
  createdTo?: string;
};

export type FinanceAuditPage = {
  events: FinanceAuditEvent[];
  pageSize: number;
  hasMore: boolean;
  nextCursor: FinanceAuditCursor | null;
};

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const SELECT_FIELDS =
  "id,household_id,finance_owner_user_id,actor_user_id,actor_email,actor_role,entity_type,entity_id,action,before_data,after_data,metadata,request_id,transaction_id,created_at";

export async function getFinanceAuditEvents(
  options: FinanceAuditQuery = {},
): Promise<FinanceAuditPage> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  let query = supabase
    .from("finance_audit_log")
    .select(SELECT_FIELDS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (options.entityType && options.entityType !== "all") {
    query = query.eq("entity_type", options.entityType);
  }
  if (options.action && options.action !== "all") {
    query = query.eq("action", options.action);
  }
  if (options.actorUserId && options.actorUserId !== "all") {
    query = query.eq("actor_user_id", options.actorUserId);
  }
  if (options.createdFrom) {
    query = query.gte("created_at", options.createdFrom);
  }
  if (options.createdTo) {
    query = query.lte("created_at", options.createdTo);
  }

  if (options.cursor) {
    const createdAt = options.cursor.createdAt;
    const id = options.cursor.id;
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error("[auditService] getFinanceAuditEvents:", error.message);
    throw new Error("Không thể tải lịch sử hoạt động. Vui lòng thử lại.");
  }

  const rows = (data ?? []) as FinanceAuditEvent[];
  const hasMore = rows.length > pageSize;
  const events = rows.slice(0, pageSize);
  const lastEvent = events.at(-1);

  return {
    events,
    pageSize,
    hasMore,
    nextCursor:
      hasMore && lastEvent
        ? { createdAt: lastEvent.created_at, id: lastEvent.id }
        : null,
  };
}
