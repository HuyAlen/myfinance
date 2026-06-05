"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Edit3,
  Folder,
  Plus,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import type { Category, CategoryType, Transaction } from "@/src/types/finance";

import {
  addCategory,
  deleteCategory,
  getCategories,
  getTransactions,
  initFinanceDemoData,
  updateCategory,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";

type FormState = {
  id?: string;
  name: string;
  type: CategoryType;
};

const emptyForm: FormState = {
  name: "",
  type: "expense",
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<CategoryType>("expense");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadData() {
    const [categories, transactions] = await Promise.all([
      getCategories(),
      getTransactions(),
    ]);
    setCategories(categories);
    setTransactions(transactions);
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);

  const filteredCategories = useMemo(() => {
    return categories.filter((item) => item.type === activeTab);
  }, [categories, activeTab]);

  const stats = useMemo(() => {
    const incomeCategories = categories.filter(
      (item) => item.type === "income",
    );
    const expenseCategories = categories.filter(
      (item) => item.type === "expense",
    );

    const totalIncome = transactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + item.amount, 0);

    const totalExpense = transactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      incomeCount: incomeCategories.length,
      expenseCount: expenseCategories.length,
      totalIncome,
      totalExpense,
    };
  }, [categories, transactions]);

  function getCategoryUsage(categoryId: string) {
    const related = transactions.filter(
      (item) => item.categoryId === categoryId,
    );

    const total = related.reduce((sum, item) => sum + item.amount, 0);

    return {
      count: related.length,
      total,
    };
  }

  function openCreateForm(type: CategoryType = activeTab) {
    setForm({
      name: "",
      type,
    });
    setIsFormOpen(true);
  }

  function openEditForm(category: Category) {
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.name.trim()) {
      alert("Vui lòng nhập tên danh mục");
      return;
    }

    const category: Category = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
    };

    if (form.id) {
      await updateCategory(category);
    } else {
      await addCategory(category);
    }

    await reloadData();
    setActiveTab(category.type);
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(category: Category) {
    const usage = getCategoryUsage(category.id);

    if (usage.count > 0) {
      alert(
        `Không thể xóa danh mục "${category.name}" vì đang có ${usage.count} giao dịch liên kết.\nHãy xóa hoặc phân loại lại các giao dịch đó trước khi xóa danh mục.`,
      );
      return;
    }

    const ok = confirm(`Bạn có chắc muốn xóa danh mục "${category.name}"?`);

    if (!ok) return;

    await deleteCategory(category.id);
    await reloadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-bold text-blue-600">Quản lý danh mục</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Danh mục thu chi
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Tạo và quản lý nhóm thu nhập, chi tiêu dùng cho giao dịch.
            </p>
          </div>

          <button
            onClick={() => openCreateForm(activeTab)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
          >
            <Plus size={18} />
            Thêm danh mục
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title="Danh mục thu"
          value={`${stats.incomeCount}`}
          subtitle="Nhóm thu nhập"
          type="income"
        />

        <SummaryCard
          title="Danh mục chi"
          value={`${stats.expenseCount}`}
          subtitle="Nhóm chi tiêu"
          type="expense"
        />

        <SummaryCard
          title="Tổng thu"
          value={formatVND(stats.totalIncome)}
          subtitle="Theo giao dịch hiện tại"
          type="income"
        />

        <SummaryCard
          title="Tổng chi"
          value={formatVND(stats.totalExpense)}
          subtitle="Theo giao dịch hiện tại"
          type="expense"
        />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="inline-flex rounded-2xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab("expense")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                activeTab === "expense"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              <ArrowDownRight size={16} />
              Chi tiêu
            </button>

            <button
              onClick={() => setActiveTab("income")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${
                activeTab === "income"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              <ArrowUpRight size={16} />
              Thu nhập
            </button>
          </div>

          <button
            onClick={() => openCreateForm(activeTab)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600"
          >
            <Plus size={16} />
            Thêm {activeTab === "income" ? "thu nhập" : "chi tiêu"}
          </button>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filteredCategories.map((category) => {
          const usage = getCategoryUsage(category.id);

          return (
            <div
              key={category.id}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CategoryIcon type={category.type} />

                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {category.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {category.type === "income" ? "Thu nhập" : "Chi tiêu"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(category)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(category)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-3xl bg-slate-50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Số giao dịch</span>
                  <span className="font-black text-slate-900">
                    {usage.count}
                  </span>
                </div>

                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-slate-500">Tổng giá trị</span>
                  <span
                    className={`font-black ${
                      category.type === "income"
                        ? "text-emerald-600"
                        : "text-rose-500"
                    }`}
                  >
                    {formatVND(usage.total)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            Chưa có danh mục nào trong nhóm này.
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-y-auto max-h-[90dvh] rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {form.id ? "Sửa danh mục" : "Thêm danh mục"}
                </h2>
                <p className="text-sm text-slate-500">
                  Danh mục sẽ được dùng khi thêm giao dịch.
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
              <Input
                label="Tên danh mục"
                value={form.name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, name: value }))
                }
                placeholder="VD: Ăn uống, Lương, Di chuyển..."
              />

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Loại danh mục
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, type: "expense" }))
                    }
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                      form.type === "expense"
                        ? "border-rose-200 bg-rose-50 text-rose-600"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    Chi tiêu
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, type: "income" }))
                    }
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                      form.type === "income"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    Thu nhập
                  </button>
                </div>
              </div>

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
                  {form.id ? "Lưu thay đổi" : "Thêm danh mục"}
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
  subtitle,
  type,
}: {
  title: string;
  value: string;
  subtitle: string;
  type: "income" | "expense";
}) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p
        className={`mt-3 text-2xl font-black ${
          type === "income" ? "text-emerald-600" : "text-rose-500"
        }`}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function CategoryIcon({ type }: { type: CategoryType }) {
  const className =
    type === "income"
      ? "bg-gradient-to-br from-emerald-500 to-teal-400"
      : "bg-gradient-to-br from-rose-500 to-orange-400";

  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${className}`}
    >
      {type === "income" ? <Tag size={21} /> : <Folder size={21} />}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}
