import type { ForexCashTransaction } from "@/src/types/finance";
import type { ForexCashTransactionFormState } from "./forexAccountTypes";

function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function currentTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function createEmptyForexCashTransactionForm(
  forexAccountId = "",
  walletId = "",
): ForexCashTransactionFormState {
  return {
    id: undefined,
    forexAccountId,
    walletId,
    type: "deposit",
    amount: "",
    fee: "",
    transactionDate: todayIso(),
    transactionTime: currentTime(),
    notes: "",
  };
}

export function mapForexCashTransactionToForm(
  transaction: ForexCashTransaction,
): ForexCashTransactionFormState {
  return {
    id: transaction.id,
    forexAccountId: transaction.forexAccountId,
    walletId: transaction.walletId ?? "",
    type: transaction.type,
    amount: String(transaction.amount),
    fee:
      transaction.fee === undefined || transaction.fee === null
        ? ""
        : String(transaction.fee),
    transactionDate: transaction.transactionDate,
    transactionTime: transaction.transactionTime || "00:00",
    notes: transaction.notes ?? "",
  };
}

export function validateForexCashTransactionForm(
  form: ForexCashTransactionFormState,
): string | null {
  if (!form.forexAccountId.trim()) {
    return "Vui lòng chọn tài khoản Forex.";
  }

  if (!form.walletId.trim()) {
    return "Vui lòng chọn ví liên kết.";
  }

  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Số tiền phải lớn hơn 0.";
  }

  const fee = form.fee.trim() === "" ? 0 : Number(form.fee);
  if (!Number.isFinite(fee) || fee < 0) {
    return "Phí không được nhỏ hơn 0.";
  }

  if (form.type === "withdrawal" && fee >= amount) {
    return "Phí rút phải nhỏ hơn số tiền rút.";
  }

  if (!form.transactionDate) {
    return "Vui lòng chọn ngày giao dịch.";
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.transactionTime)) {
    return "Vui lòng chọn giờ giao dịch hợp lệ.";
  }

  return null;
}

export function mapFormToForexCashTransaction(
  form: ForexCashTransactionFormState,
): ForexCashTransaction {
  return {
    id: form.id ?? crypto.randomUUID(),
    forexAccountId: form.forexAccountId,
    walletId: form.walletId,
    type: form.type,
    amount: Number(form.amount),
    currency: "VND",
    fee: form.fee.trim() === "" ? 0 : Number(form.fee),
    transactionDate: form.transactionDate,
    transactionTime: form.transactionTime,
    transactedAt: `${form.transactionDate}T${form.transactionTime}:00`,
    notes: form.notes.trim() || undefined,
  };
}
