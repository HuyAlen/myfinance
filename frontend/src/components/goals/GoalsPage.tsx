"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import { Edit3, Plus, Target, Trash2, X } from "lucide-react";

import type { Goal } from "@/src/types/finance";

import {
  addGoal,
  deleteGoal,
  getGoals,
  initFinanceDemoData,
  updateGoal,
} from "@/src/services/finance/financeStorage";

import { formatVND } from "@/src/services/finance/financeCalculations";

type FormState = {
  id?: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
};

const emptyForm: FormState = {
  name: "",
  targetAmount: "",
  currentAmount: "",
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadData() {
    setGoals(await getGoals());
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);

  useRealtimeTable(["goals"], reloadData);

  const summary = useMemo(() => {
    const totalTarget = goals.reduce((sum, item) => sum + item.targetAmount, 0);
    const totalCurrent = goals.reduce(
      (sum, item) => sum + item.currentAmount,
      0,
    );
    const percent =
      totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;

    return {
      totalTarget,
      totalCurrent,
      remaining: totalTarget - totalCurrent,
      percent,
    };
  }, [goals]);

  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(goal: Goal) {
    setForm({
      id: goal.id,
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      currentAmount: String(goal.currentAmount),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const targetAmount = Number(form.targetAmount);
    const currentAmount = Number(form.currentAmount);

    if (!form.name.trim()) {
      alert("Vui lòng nhập tên mục tiêu");
      return;
    }

    if (!targetAmount || targetAmount <= 0) {
      alert("Vui lòng nhập số tiền mục tiêu hợp lệ");
      return;
    }

    if (Number.isNaN(currentAmount) || currentAmount < 0) {
      alert("Vui lòng nhập số tiền đã tiết kiệm hợp lệ");
      return;
    }

    const goal: Goal = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      targetAmount,
      currentAmount,
    };

    if (form.id) {
      await updateGoal(goal);
    } else {
      await addGoal(goal);
    }

    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    const ok = confirm("Bạn có chắc muốn xóa mục tiêu này?");

    if (!ok) return;

    await deleteGoal(id);
    await reloadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-bold text-blue-600">
              Mục tiêu tài chính
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Theo dõi mục tiêu
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Lập kế hoạch và theo dõi tiến độ cho các mục tiêu tài chính lớn.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
          >
            <Plus size={18} />
            Thêm mục tiêu
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard title="Tổng mục tiêu" value={`${goals.length}`} />
        <SummaryCard title="Cần đạt" value={formatVND(summary.totalTarget)} />
        <SummaryCard
          title="Đã tiết kiệm"
          value={formatVND(summary.totalCurrent)}
          success
        />
        <SummaryCard title="Tiến độ chung" value={`${summary.percent}%`} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex justify-between text-sm">
          <span className="font-bold text-slate-700">
            Tiến độ tất cả mục tiêu
          </span>
          <span className="font-black text-blue-600">{summary.percent}%</span>
        </div>

        <div className="h-4 rounded-full bg-slate-100">
          <div
            className="h-4 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
            style={{ width: `${Math.min(summary.percent, 100)}%` }}
          />
        </div>

        <p className="mt-3 text-sm text-slate-500">
          Còn cần tiết kiệm thêm {formatVND(summary.remaining)} để hoàn thành
          tất cả mục tiêu.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => {
          const percent = Math.round(
            (goal.currentAmount / goal.targetAmount) * 100,
          );
          const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
          const completed = percent >= 100;

          return (
            <div
              key={goal.id}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-12 items-center justify-center rounded-2xl text-white shadow-lg ${
                      completed
                        ? "bg-gradient-to-br from-emerald-500 to-teal-400"
                        : "bg-gradient-to-br from-blue-600 to-cyan-500"
                    }`}
                  >
                    <Target size={22} />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {goal.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {completed
                        ? "Đã hoàn thành"
                        : `Còn ${formatVND(remaining)}`}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(goal)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-500">Đã tiết kiệm</p>
                <p className="mt-1 text-3xl font-black text-blue-600">
                  {formatVND(goal.currentAmount)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  / {formatVND(goal.targetAmount)}
                </p>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Tiến độ</span>
                  <span className="font-bold text-slate-900">{percent}%</span>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className={`h-3 rounded-full ${
                      completed
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-gradient-to-r from-blue-600 to-cyan-500"
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            Chưa có mục tiêu nào. Hãy thêm mục tiêu đầu tiên.
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-y-auto max-h-[90dvh] rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Chỉnh sửa mục tiêu" : "Thêm mục tiêu mới"}
                </h2>
                <p className="text-sm text-slate-500">
                  Cập nhật số tiền mục tiêu và số tiền đã tiết kiệm.
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
                label="Tên mục tiêu"
                value={form.name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, name: value }))
                }
                placeholder="VD: Mua laptop, Quỹ khẩn cấp..."
              />

              <Input
                label="Số tiền mục tiêu"
                type="number"
                value={form.targetAmount}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, targetAmount: value }))
                }
                placeholder="VD: 30000000"
              />

              <Input
                label="Số tiền đã tiết kiệm"
                type="number"
                value={form.currentAmount}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, currentAmount: value }))
                }
                placeholder="VD: 12000000"
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
                  {form.id ? "Lưu thay đổi" : "Thêm mục tiêu"}
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
  success,
}: {
  title: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p
        className={`mt-3 text-2xl font-black ${
          success ? "text-emerald-600" : "text-blue-600"
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
