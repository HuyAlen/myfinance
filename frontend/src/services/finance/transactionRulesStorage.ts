import { supabase } from "@/src/lib/supabase";
import { getFinanceOwnerUserId } from "@/src/services/finance/householdService";
import type { Database } from "@/src/lib/database.types";
import type {
  TransactionRule,
  TransactionRuleType,
} from "@/src/lib/transactions/transactionRules";

type RuleRow = Database["public"]["Tables"]["transaction_rules"]["Row"];

export type TransactionRuleInput = {
  name: string;
  enabled: boolean;
  priority: number;
  transactionType: TransactionRuleType;
  noteContains?: string | null;
  walletId?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  actionCategoryId?: string | null;
  /** @deprecated TRANSACTION-RULE-CATEGORY-ONLY-1 ignores wallet actions. */
  actionWalletId?: string | null;
};

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapRuleRow(row: RuleRow): TransactionRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    priority: row.priority,
    transactionType: row.transaction_type,
    noteContains: row.note_contains,
    walletId: row.wallet_id,
    amountMin: row.amount_min === null ? null : Number(row.amount_min),
    amountMax: row.amount_max === null ? null : Number(row.amount_max),
    actionCategoryId: row.action_category_id,
    actionWalletId: row.action_wallet_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateRuleInput(input: TransactionRuleInput): string | null {
  if (!input.name.trim()) return "Vui lòng đặt tên cho quy tắc.";
  if (input.name.trim().length > 80) return "Tên quy tắc tối đa 80 ký tự.";
  if (input.transactionType !== "income" && input.transactionType !== "expense") {
    return "Loại giao dịch của quy tắc không hợp lệ.";
  }

  const priority = Number(input.priority);
  if (!Number.isInteger(priority) || priority < 0 || priority > 9999) {
    return "Ưu tiên phải là số nguyên từ 0 đến 9999.";
  }

  const min = normalizeOptionalNumber(input.amountMin);
  const max = normalizeOptionalNumber(input.amountMax);
  if (min !== null && min < 0) return "Số tiền tối thiểu không hợp lệ.";
  if (max !== null && max < 0) return "Số tiền tối đa không hợp lệ.";
  if (min !== null && max !== null && min > max) {
    return "Số tiền tối thiểu không được lớn hơn tối đa.";
  }

  if (!normalizeOptionalText(input.actionCategoryId)) {
    return "Quy tắc cần một danh mục gợi ý.";
  }

  return null;
}

function toDbPayload(userId: string, input: TransactionRuleInput) {
  return {
    user_id: userId,
    name: input.name.trim(),
    enabled: input.enabled,
    priority: Number(input.priority),
    transaction_type: input.transactionType,
    note_contains: normalizeOptionalText(input.noteContains),
    wallet_id: normalizeOptionalText(input.walletId),
    amount_min: normalizeOptionalNumber(input.amountMin),
    amount_max: normalizeOptionalNumber(input.amountMax),
    action_category_id: normalizeOptionalText(input.actionCategoryId),
    // Legacy DB column stays present for compatibility, but category-only is
    // the canonical action contract. Saving a rule clears any old wallet action.
    action_wallet_id: null,
  };
}

export async function getTransactionRules(): Promise<TransactionRule[]> {
  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) throw new Error("Không có phiên đăng nhập. Vui lòng đăng nhập lại.");

  const { data, error } = await supabase
    .from("transaction_rules")
    .select(
      "id,user_id,name,enabled,priority,transaction_type,note_contains,wallet_id,amount_min,amount_max,action_category_id,action_wallet_id,created_at,updated_at",
    )
    .eq("user_id", ownerUserId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[transactionRulesStorage] getTransactionRules:", error.message);
    throw new Error("Không thể tải quy tắc giao dịch.");
  }

  return (data ?? []).map(mapRuleRow);
}

export async function createTransactionRule(
  input: TransactionRuleInput,
): Promise<{ error: string | null }> {
  const validationError = validateRuleInput(input);
  if (validationError) return { error: validationError };

  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) return { error: "Không có phiên đăng nhập. Vui lòng đăng nhập lại." };

  const { error } = await supabase
    .from("transaction_rules")
    .insert(toDbPayload(ownerUserId, input));

  if (error) {
    console.error("[transactionRulesStorage] createTransactionRule:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

export async function updateTransactionRule(
  id: string,
  input: TransactionRuleInput,
): Promise<{ error: string | null }> {
  const validationError = validateRuleInput(input);
  if (validationError) return { error: validationError };

  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) return { error: "Không có phiên đăng nhập. Vui lòng đăng nhập lại." };

  const { error } = await supabase
    .from("transaction_rules")
    .update(toDbPayload(ownerUserId, input))
    .eq("id", id)
    .eq("user_id", ownerUserId);

  if (error) {
    console.error("[transactionRulesStorage] updateTransactionRule:", error.message);
    return { error: error.message };
  }

  return { error: null };
}

export async function setTransactionRuleEnabled(
  id: string,
  enabled: boolean,
): Promise<{ error: string | null }> {
  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) return { error: "Không có phiên đăng nhập. Vui lòng đăng nhập lại." };

  const { error } = await supabase
    .from("transaction_rules")
    .update({ enabled })
    .eq("id", id)
    .eq("user_id", ownerUserId);

  if (error) {
    console.error("[transactionRulesStorage] setTransactionRuleEnabled:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function deleteTransactionRule(
  id: string,
): Promise<{ error: string | null }> {
  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) return { error: "Không có phiên đăng nhập. Vui lòng đăng nhập lại." };

  const { error } = await supabase
    .from("transaction_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", ownerUserId);

  if (error) {
    console.error("[transactionRulesStorage] deleteTransactionRule:", error.message);
    return { error: error.message };
  }
  return { error: null };
}
