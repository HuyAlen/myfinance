import { supabase } from "@/src/lib/supabase";
import { getFinanceOwnerUserId } from "@/src/services/finance/householdService";
import {
  buildTransactionReviewFingerprint,
  type TransactionReviewAcknowledgementInput,
} from "@/src/lib/transactions/transactionReviewWorkflow";

export async function getTransactionReviewAcknowledgementKeys(): Promise<
  Set<string>
> {
  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) {
    throw new Error("Không có phiên đăng nhập. Vui lòng đăng nhập lại.");
  }

  const { data, error } = await supabase
    .from("transaction_review_acknowledgements")
    .select("transaction_id,reason,fingerprint")
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "[transactionReviewStorage] getTransactionReviewAcknowledgementKeys:",
      error.message,
    );
    throw new Error("Không thể tải trạng thái rà soát giao dịch.");
  }

  return new Set(
    (data ?? []).map(
      (row) => `${row.reason}::${row.transaction_id}::${row.fingerprint}`,
    ),
  );
}

export async function acknowledgeTransactionReviewReasons(
  acknowledgements: readonly TransactionReviewAcknowledgementInput[],
): Promise<{ error: string | null }> {
  if (acknowledgements.length === 0) return { error: null };

  const ownerUserId = await getFinanceOwnerUserId();
  if (!ownerUserId) {
    return { error: "Không có phiên đăng nhập. Vui lòng đăng nhập lại." };
  }

  const rows = acknowledgements.map(({ transaction, reason }) => ({
    user_id: ownerUserId,
    transaction_id: transaction.id,
    reason,
    fingerprint: buildTransactionReviewFingerprint(transaction),
  }));

  const { error } = await supabase
    .from("transaction_review_acknowledgements")
    .upsert(rows, {
      onConflict: "user_id,transaction_id,reason,fingerprint",
      ignoreDuplicates: true,
    });

  if (error) {
    console.error(
      "[transactionReviewStorage] acknowledgeTransactionReviewReasons:",
      error.message,
    );
    return { error: "Không thể lưu xác nhận rà soát. Vui lòng thử lại." };
  }

  return { error: null };
}
