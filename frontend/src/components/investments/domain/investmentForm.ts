import type { Investment } from "@/src/types/finance";
import type { InvestmentFormState } from "./investmentTypes";

export function getLocalDateInputValue(date = new Date()): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function createEmptyInvestmentForm(): InvestmentFormState {
  return {
    name: "",
    type: "stock",
    symbol: "",
    investedAmount: "",
    currentValue: "",
    purchaseDate: getLocalDateInputValue(),
    notes: "",
  };
}

export function mapInvestmentToForm(
  investment: Investment,
): InvestmentFormState {
  return {
    id: investment.id,
    name: investment.name,
    type: investment.type,
    symbol: investment.symbol ?? "",
    investedAmount: String(investment.investedAmount),
    currentValue: String(investment.currentValue),
    purchaseDate: investment.purchaseDate ?? getLocalDateInputValue(),
    notes: investment.notes ?? "",
  };
}

export function validateInvestmentForm(
  form: InvestmentFormState,
): string | null {
  const investedAmount = Number(form.investedAmount);
  const currentValue = Number(form.currentValue);

  if (!form.name.trim()) return "Vui lòng nhập tên tài sản đầu tư";
  if (!Number.isFinite(investedAmount) || investedAmount <= 0) {
    return "Vui lòng nhập số vốn đầu tư hợp lệ";
  }
  if (!Number.isFinite(currentValue) || currentValue < 0) {
    return "Vui lòng nhập giá trị hiện tại hợp lệ";
  }
  if (form.purchaseDate && form.purchaseDate > getLocalDateInputValue()) {
    return "Ngày mua không được lớn hơn ngày hiện tại";
  }
  return null;
}

export function mapFormToInvestment(form: InvestmentFormState): Investment {
  return {
    id: form.id ?? crypto.randomUUID(),
    name: form.name.trim(),
    type: form.type,
    symbol: form.symbol.trim().toUpperCase() || undefined,
    investedAmount: Number(form.investedAmount),
    currentValue: Number(form.currentValue),
    purchaseDate: form.purchaseDate || undefined,
    notes: form.notes.trim() || undefined,
  };
}
