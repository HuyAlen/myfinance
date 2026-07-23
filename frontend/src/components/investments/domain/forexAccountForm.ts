import type { ForexAccount } from "@/src/types/finance";
import type { ForexAccountFormState } from "./forexAccountTypes";

export function createEmptyForexAccountForm(): ForexAccountFormState {
  return {
    name: "",
    broker: "",
    accountNumber: "",
    currency: "USD",
    status: "active",
    openedAt: "",
    notes: "",
  };
}

export function mapForexAccountToForm(
  account: ForexAccount,
): ForexAccountFormState {
  return {
    id: account.id,
    name: account.name,
    broker: account.broker,
    accountNumber: account.accountNumber ?? "",
    currency: account.currency,
    status: account.status,
    openedAt: account.openedAt ?? "",
    notes: account.notes ?? "",
  };
}

export function validateForexAccountForm(
  form: ForexAccountFormState,
): string | null {
  if (!form.name.trim()) return "Vui lòng nhập tên tài khoản Forex.";
  if (!form.broker.trim()) return "Vui lòng nhập broker hoặc nền tảng.";
  if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) {
    return "Mã tiền tệ phải gồm 3 ký tự, ví dụ USD hoặc VND.";
  }
  return null;
}

export function mapFormToForexAccount(
  form: ForexAccountFormState,
): ForexAccount {
  return {
    id: form.id ?? crypto.randomUUID(),
    name: form.name.trim(),
    broker: form.broker.trim(),
    accountNumber: form.accountNumber.trim() || undefined,
    currency: form.currency.trim().toUpperCase(),
    status: form.status,
    openedAt: form.openedAt || undefined,
    notes: form.notes.trim() || undefined,
  };
}
