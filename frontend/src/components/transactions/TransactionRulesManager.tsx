"use client";

import { useMemo, useState } from "react";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import type { Category, Wallet } from "@/src/types/finance";
import { getCategoryPlanningGroup } from "@/src/services/finance/financeCalculations";
import type {
  TransactionRule,
  TransactionRuleType,
} from "@/src/lib/transactions/transactionRules";
import {
  createTransactionRule,
  deleteTransactionRule,
  setTransactionRuleEnabled,
  updateTransactionRule,
  type TransactionRuleInput,
} from "@/src/services/finance/transactionRulesStorage";

type RuleForm = {
  id?: string;
  name: string;
  enabled: boolean;
  priority: string;
  transactionType: TransactionRuleType;
  noteContains: string;
  walletId: string;
  amountMin: string;
  amountMax: string;
  actionCategoryId: string;
  actionWalletId: string;
};

const EMPTY_FORM: RuleForm = {
  name: "",
  enabled: true,
  priority: "100",
  transactionType: "expense",
  noteContains: "",
  walletId: "",
  amountMin: "",
  amountMax: "",
  actionCategoryId: "",
  actionWalletId: "",
};

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

function toInput(form: RuleForm): TransactionRuleInput {
  return {
    name: form.name,
    enabled: form.enabled,
    priority: Number(form.priority),
    transactionType: form.transactionType,
    noteContains: form.noteContains || null,
    walletId: form.walletId || null,
    amountMin: toNumberOrNull(form.amountMin),
    amountMax: toNumberOrNull(form.amountMax),
    actionCategoryId: form.actionCategoryId || null,
    actionWalletId: form.actionWalletId || null,
  };
}

export default function TransactionRulesManager({
  rules,
  categories,
  wallets,
  onClose,
  onChanged,
}: {
  rules: TransactionRule[];
  categories: Category[];
  wallets: Wallet[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const compatibleCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (category.type !== form.transactionType) return false;
        const group = getCategoryPlanningGroup(category);
        return form.transactionType === "income"
          ? group === "income"
          : group === "fixed" || group === "variable";
      }),
    [categories, form.transactionType],
  );

  function editRule(rule: TransactionRule) {
    setError(null);
    setForm({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: String(rule.priority),
      transactionType: rule.transactionType,
      noteContains: rule.noteContains ?? "",
      walletId: rule.walletId ?? "",
      amountMin: rule.amountMin === null ? "" : String(rule.amountMin),
      amountMax: rule.amountMax === null ? "" : String(rule.amountMax),
      actionCategoryId: rule.actionCategoryId ?? "",
      actionWalletId: rule.actionWalletId ?? "",
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function saveRule() {
    if (busyKey) return;
    setError(null);
    setBusyKey("save");
    try {
      const result = form.id
        ? await updateTransactionRule(form.id, toInput(form))
        : await createTransactionRule(toInput(form));
      if (result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      await onChanged();
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleRule(rule: TransactionRule) {
    if (busyKey) return;
    setBusyKey(`toggle:${rule.id}`);
    try {
      const result = await setTransactionRuleEnabled(rule.id, !rule.enabled);
      if (result.error) setError(result.error);
      else await onChanged();
    } finally {
      setBusyKey(null);
    }
  }

  async function removeRule(rule: TransactionRule) {
    if (busyKey) return;
    if (!window.confirm(`Xóa quy tắc "${rule.name}"?`)) return;
    setBusyKey(`delete:${rule.id}`);
    try {
      const result = await deleteTransactionRule(rule.id);
      if (result.error) setError(result.error);
      else {
        if (form.id === rule.id) resetForm();
        await onChanged();
      }
    } finally {
      setBusyKey(null);
    }
  }

  const categoryName = new Map(categories.map((item) => [item.id, item.name]));
  const walletName = new Map(wallets.map((item) => [item.id, item.name]));

  return (
    <div className="fixed inset-0 overflow-x-hidden z-140 flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-rules-title"
        className="flex h-dvh w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-5">
          <div>
            <span className="flex size-9 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Sparkles size={17} />
            </span>
            <h2 id="transaction-rules-title" className="mt-3 text-xl font-black text-slate-900">
              Quy tắc giao dịch
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Quy tắc chỉ tạo gợi ý khi nhập tay và được hiển thị trong preview CSV trước khi ghi. Ưu tiên nhỏ hơn chạy trước; quy tắc khớp đầu tiên thắng.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busyKey)}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
            aria-label="Đóng quy tắc giao dịch"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">
                    {form.id ? "Chỉnh sửa quy tắc" : "Tạo quy tắc mới"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Điều kiện trong cùng một quy tắc được kết hợp bằng AND.
                  </p>
                </div>
                {form.id ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600"
                  >
                    Tạo mới
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-black text-slate-600">Tên quy tắc</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    maxLength={80}
                    placeholder="Ví dụ: Grab → Di chuyển"
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-800 outline-none focus:border-violet-400"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-black text-slate-600">Loại</span>
                  <select
                    value={form.transactionType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        transactionType: event.target.value as TransactionRuleType,
                        actionCategoryId: "",
                      }))
                    }
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                  >
                    <option value="expense">Chi</option>
                    <option value="income">Thu</option>
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-black text-slate-600">Ưu tiên</span>
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    value={form.priority}
                    onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-black text-slate-600">Ghi chú chứa</span>
                  <input
                    value={form.noteContains}
                    onChange={(event) => setForm((current) => ({ ...current, noteContains: event.target.value }))}
                    placeholder="Grab, Highlands, salary..."
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700"
                  />
                  <span className="mt-1 block text-[10px] text-slate-400">Không phân biệt hoa/thường và dấu tiếng Việt.</span>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-black text-slate-600">Ví điều kiện</span>
                  <select
                    value={form.walletId}
                    onChange={(event) => setForm((current) => ({ ...current, walletId: event.target.value }))}
                    className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                  >
                    <option value="">Bất kỳ ví nào</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="mb-1.5 block text-xs font-black text-slate-600">Từ</span>
                    <input
                      type="number"
                      min="0"
                      value={form.amountMin}
                      onChange={(event) => setForm((current) => ({ ...current, amountMin: event.target.value }))}
                      placeholder="0"
                      className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-black text-slate-600">Đến</span>
                    <input
                      type="number"
                      min="0"
                      value={form.amountMax}
                      onChange={(event) => setForm((current) => ({ ...current, amountMax: event.target.value }))}
                      placeholder="∞"
                      className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                    />
                  </label>
                </div>

                <label>
                  <span className="mb-1.5 block text-xs font-black text-violet-700">Đặt danh mục</span>
                  <select
                    value={form.actionCategoryId}
                    onChange={(event) => setForm((current) => ({ ...current, actionCategoryId: event.target.value }))}
                    className="min-h-11 w-full rounded-2xl border border-violet-200 bg-white px-3 text-sm font-bold text-slate-700"
                  >
                    <option value="">Không đổi danh mục</option>
                    {compatibleCategories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-black text-violet-700">Đặt ví</span>
                  <select
                    value={form.actionWalletId}
                    onChange={(event) => setForm((current) => ({ ...current, actionWalletId: event.target.value }))}
                    className="min-h-11 w-full rounded-2xl border border-violet-200 bg-white px-3 text-sm font-bold text-slate-700"
                  >
                    <option value="">Không đổi ví</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {error ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void saveRule()}
                disabled={Boolean(busyKey)}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-black text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:opacity-50"
              >
                <Plus size={16} />
                {busyKey === "save" ? "Đang lưu..." : form.id ? "Lưu quy tắc" : "Thêm quy tắc"}
              </button>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-900">Danh sách quy tắc</p>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                  {rules.filter((rule) => rule.enabled).length}/{rules.length} bật
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {rules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs text-slate-500">
                    Chưa có quy tắc. Tạo quy tắc đầu tiên để MyFinance gợi ý phân loại nhanh hơn.
                  </div>
                ) : (
                  rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="rounded-2xl border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => void toggleRule(rule)}
                          disabled={Boolean(busyKey)}
                          aria-label={rule.enabled ? `Tắt ${rule.name}` : `Bật ${rule.name}`}
                          className={
                            "mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition " +
                            (rule.enabled ? "bg-violet-600" : "bg-slate-300")
                          }
                        >
                          <span
                            className={
                              "block size-5 rounded-full bg-white shadow transition-transform " +
                              (rule.enabled ? "translate-x-4" : "translate-x-0")
                            }
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => editRule(rule)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-black text-slate-800">{rule.name}</p>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">
                              P{rule.priority}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            {rule.transactionType === "income" ? "Thu" : "Chi"}
                            {rule.noteContains ? ` · chứa “${rule.noteContains}”` : ""}
                            {rule.walletId ? ` · ${walletName.get(rule.walletId) ?? "Ví"}` : ""}
                            {rule.amountMin !== null ? ` · ≥ ${rule.amountMin.toLocaleString("vi-VN")}đ` : ""}
                            {rule.amountMax !== null ? ` · ≤ ${rule.amountMax.toLocaleString("vi-VN")}đ` : ""}
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-violet-700">
                            → {[
                              rule.actionCategoryId
                                ? categoryName.get(rule.actionCategoryId) ?? "Danh mục"
                                : null,
                              rule.actionWalletId
                                ? walletName.get(rule.actionWalletId) ?? "Ví"
                                : null,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRule(rule)}
                          disabled={Boolean(busyKey)}
                          aria-label={`Xóa ${rule.name}`}
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
