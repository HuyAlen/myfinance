"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { Edit3, Landmark, Plus, Trash2, X } from "lucide-react";

import type { Debt } from "@/src/types/finance";

import {
  addDebt,
  deleteDebt,
  getDebts,
  initFinanceDemoData,
  updateDebt,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";

type FormState = {
  id?: string;
  name: string;
  totalAmount: string;
  remainingAmount: string;
};

const emptyForm: FormState = {
  name: "",
  totalAmount: "",
  remainingAmount: "",
};

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadData() {
    setDebts(await getDebts());
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);

  useRealtimeTable(["debts"], reloadData);

  const summary = useMemo(() => {
    const totalAmount = debts.reduce((sum, item) => sum + item.totalAmount, 0);
    const remainingAmount = debts.reduce(
      (sum, item) => sum + item.remainingAmount,
      0,
    );
    const paidAmount = totalAmount - remainingAmount;
    const paidPercent =
      totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

    return {
      totalAmount,
      remainingAmount,
      paidAmount,
      paidPercent,
    };
  }, [debts]);

  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(debt: Debt) {
    setForm({
      id: debt.id,
      name: debt.name,
      totalAmount: String(debt.totalAmount),
      remainingAmount: String(debt.remainingAmount),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const totalAmount = Number(form.totalAmount);
    const remainingAmount = Number(form.remainingAmount);

    if (!form.name.trim()) {
      alert("Vui lòng nhập tên khoản nợ");
      return;
    }

    if (!totalAmount || totalAmount <= 0) {
      alert("Vui lòng nhập tổng số tiền vay hợp lệ");
      return;
    }

    if (Number.isNaN(remainingAmount) || remainingAmount < 0) {
      alert("Vui lòng nhập số tiền còn lại hợp lệ");
      return;
    }

    if (remainingAmount > totalAmount) {
      alert("Số tiền còn lại không được lớn hơn tổng số tiền vay");
      return;
    }

    const debt: Debt = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      totalAmount,
      remainingAmount,
    };

    if (form.id) {
      await updateDebt(debt);
    } else {
      await addDebt(debt);
    }

    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    const ok = confirm("Bạn có chắc muốn xóa khoản nợ này?");

    if (!ok) return;

    await deleteDebt(id);
    await reloadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-bold text-blue-600">Nợ & khoản vay</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Quản lý nợ phải trả
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Theo dõi khoản vay, số tiền còn lại và tiến độ đã thanh toán.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
          >
            <Plus size={18} />
            Thêm khoản nợ
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          title="Tổng khoản vay"
          value={formatVND(summary.totalAmount)}
        />
        <SummaryCard
          title="Còn phải trả"
          value={formatVND(summary.remainingAmount)}
          danger
        />
        <SummaryCard
          title="Đã thanh toán"
          value={formatVND(summary.paidAmount)}
          success
        />
        <SummaryCard title="Tiến độ trả nợ" value={`${summary.paidPercent}%`} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex justify-between text-sm">
          <span className="font-bold text-slate-700">
            Tiến độ trả nợ tổng thể
          </span>
          <span className="font-black text-blue-600">
            {summary.paidPercent}%
          </span>
        </div>

        <div className="h-4 rounded-full bg-slate-100">
          <div
            className="h-4 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
            style={{ width: `${Math.min(summary.paidPercent, 100)}%` }}
          />
        </div>

        <p className="mt-3 text-sm text-slate-500">
          Còn phải trả {formatVND(summary.remainingAmount)} trên tổng{" "}
          {formatVND(summary.totalAmount)}.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {debts.map((debt) => {
          const paidAmount = debt.totalAmount - debt.remainingAmount;
          const paidPercent =
            debt.totalAmount > 0
              ? Math.round((paidAmount / debt.totalAmount) * 100)
              : 0;

          const isPaid = debt.remainingAmount <= 0;

          return (
            <div
              key={debt.id}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-12 items-center justify-center rounded-2xl text-white shadow-lg ${
                      isPaid
                        ? "bg-gradient-to-br from-emerald-500 to-teal-400"
                        : "bg-gradient-to-br from-orange-400 to-rose-500"
                    }`}
                  >
                    <Landmark size={22} />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {debt.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {isPaid
                        ? "Đã tất toán"
                        : `Còn ${formatVND(debt.remainingAmount)}`}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(debt)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(debt.id)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-500">Còn phải trả</p>
                <p
                  className={`mt-1 text-3xl font-black ${
                    isPaid ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {formatVND(debt.remainingAmount)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Tổng vay: {formatVND(debt.totalAmount)}
                </p>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Đã trả</span>
                  <span className="font-bold text-slate-900">
                    {paidPercent}%
                  </span>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className={`h-3 rounded-full ${
                      isPaid
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-gradient-to-r from-orange-400 to-rose-500"
                    }`}
                    style={{ width: `${Math.min(paidPercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {debts.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            Chưa có khoản nợ nào.
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-y-auto max-h-[90dvh] rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Chỉnh sửa khoản nợ" : "Thêm khoản nợ mới"}
                </h2>
                <p className="text-sm text-slate-500">
                  Cập nhật tổng khoản vay và số tiền còn phải trả.
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
                label="Tên khoản nợ"
                value={form.name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, name: value }))
                }
                placeholder="VD: Vay mua xe, Thẻ tín dụng..."
              />

              <Input
                label="Tổng số tiền vay"
                type="number"
                value={form.totalAmount}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, totalAmount: value }))
                }
                placeholder="VD: 50000000"
              />

              <Input
                label="Số tiền còn lại"
                type="number"
                value={form.remainingAmount}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, remainingAmount: value }))
                }
                placeholder="VD: 25000000"
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
                  {form.id ? "Lưu thay đổi" : "Thêm khoản nợ"}
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
  success,
}: {
  title: string;
  value: string;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p
        className={`mt-3 text-2xl font-black ${
          danger
            ? "text-rose-500"
            : success
              ? "text-emerald-600"
              : "text-blue-600"
        }`}
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
