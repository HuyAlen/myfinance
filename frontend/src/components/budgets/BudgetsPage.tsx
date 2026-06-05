"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { ChartPie, Edit3, Plus, Trash2, X } from "lucide-react";

import type { Budget, Category, Transaction } from "@/src/types/finance";

import {
  addBudget,
  deleteBudget,
  getBudgets,
  getCategories,
  getTransactions,
  initFinanceDemoData,
  updateBudget,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";

type FormState = {
  id?: string;
  categoryId: string;
  month: string;
  limitAmount: string;
};

const emptyForm: FormState = {
  categoryId: "",
  month: "2026-06",
  limitAmount: "",
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadData() {
    const [budgets, categories, transactions] = await Promise.all([
      getBudgets(),
      getCategories(),
      getTransactions(),
    ]);
    setBudgets(budgets);
    setCategories(categories);
    setTransactions(transactions);
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);

  useRealtimeTable(["budgets", "transactions"], reloadData);

  const expenseCategories = useMemo(() => {
    return categories.filter((item) => item.type === "expense");
  }, [categories]);

  function getSpent(categoryId: string, month: string) {
    return transactions
      .filter((item) => {
        return (
          item.type === "expense" &&
          item.categoryId === categoryId &&
          item.date.startsWith(month)
        );
      })
      .reduce((sum, item) => sum + item.amount, 0);
  }

  const budgetSummary = useMemo(() => {
    const totalLimit = budgets.reduce((sum, item) => sum + item.limitAmount, 0);

    const totalSpent = budgets.reduce((sum, item) => {
      return sum + getSpent(item.categoryId, item.month);
    }, 0);

    return {
      totalLimit,
      totalSpent,
      remaining: totalLimit - totalSpent,
      percent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0,
    };
  }, [budgets, transactions]);

  function openCreateForm() {
    setForm({
      ...emptyForm,
      categoryId: expenseCategories[0]?.id ?? "",
    });
    setIsFormOpen(true);
  }

  function openEditForm(budget: Budget) {
    setForm({
      id: budget.id,
      categoryId: budget.categoryId,
      month: budget.month,
      limitAmount: String(budget.limitAmount),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const limitAmount = Number(form.limitAmount);

    if (!form.categoryId) {
      alert("Vui lòng chọn danh mục");
      return;
    }

    if (!form.month) {
      alert("Vui lòng chọn tháng");
      return;
    }

    if (!limitAmount || limitAmount <= 0) {
      alert("Vui lòng nhập ngân sách hợp lệ");
      return;
    }

    const budget: Budget = {
      id: form.id ?? crypto.randomUUID(),
      categoryId: form.categoryId,
      month: form.month,
      limitAmount,
    };

    if (form.id) {
      await updateBudget(budget);
    } else {
      await addBudget(budget);
    }

    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    const ok = confirm("Bạn có chắc muốn xóa ngân sách này?");

    if (!ok) return;

    await deleteBudget(id);
    await reloadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-bold text-blue-600">Quản lý ngân sách</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Ngân sách chi tiêu
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Thiết lập hạn mức chi tiêu theo từng danh mục mỗi tháng.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
          >
            <Plus size={18} />
            Tạo ngân sách
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title="Tổng ngân sách"
          value={formatVND(budgetSummary.totalLimit)}
        />
        <SummaryCard
          title="Đã chi"
          value={formatVND(budgetSummary.totalSpent)}
          danger
        />
        <SummaryCard
          title="Còn lại"
          value={formatVND(budgetSummary.remaining)}
        />
        <SummaryCard
          title="Tỷ lệ sử dụng"
          value={`${budgetSummary.percent}%`}
        />
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {budgets.map((budget) => {
          const category = categories.find(
            (item) => item.id === budget.categoryId,
          );
          const spent = getSpent(budget.categoryId, budget.month);
          const percent = Math.round((spent / budget.limitAmount) * 100);
          const isOver = spent > budget.limitAmount;

          return (
            <div
              key={budget.id}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-100">
                    <ChartPie size={22} />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {category?.name ?? "Danh mục"}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Tháng {budget.month}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(budget)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(budget.id)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-500">Đã chi</p>
                <p
                  className={`mt-1 text-3xl font-black ${isOver ? "text-rose-500" : "text-blue-600"}`}
                >
                  {formatVND(spent)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  / {formatVND(budget.limitAmount)}
                </p>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Tiến độ</span>
                  <span
                    className={`font-bold ${isOver ? "text-rose-500" : "text-slate-900"}`}
                  >
                    {percent}%
                  </span>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className={`h-3 rounded-full ${
                      isOver
                        ? "bg-gradient-to-r from-rose-500 to-orange-400"
                        : "bg-gradient-to-r from-blue-600 to-cyan-500"
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {budgets.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            Chưa có ngân sách nào.
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-y-auto max-h-[90dvh] rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {form.id ? "Sửa ngân sách" : "Tạo ngân sách"}
                </h2>
                <p className="text-sm text-slate-500">
                  Thiết lập hạn mức chi tiêu cho danh mục.
                </p>
              </div>

              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded-2xl bg-slate-100 p-3 text-slate-500 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Danh mục
                </span>
                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      categoryId: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
                >
                  <option value="">Chọn danh mục</option>
                  {expenseCategories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>

              <Input
                label="Tháng"
                type="month"
                value={form.month}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, month: value }))
                }
              />

              <Input
                label="Hạn mức ngân sách"
                type="number"
                value={form.limitAmount}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, limitAmount: value }))
                }
                placeholder="VD: 5000000"
              />

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600"
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
                >
                  {form.id ? "Lưu thay đổi" : "Tạo ngân sách"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  danger,
}: {
  title: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p
        className={`mt-3 text-2xl font-black ${danger ? "text-rose-500" : "text-blue-600"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}
