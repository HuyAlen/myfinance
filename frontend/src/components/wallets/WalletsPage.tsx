"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  Banknote,
  BriefcaseBusiness,
  Edit3,
  Landmark,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

import type {
  Transaction,
  Wallet as WalletType,
  WalletType as FinanceWalletType,
} from "@/src/types/finance";

import {
  addWallet,
  deleteWallet,
  getTransactions,
  getWallets,
  initFinanceDemoData,
  updateWallet,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getTotalAssets,
} from "@/src/services/finance/financeCalculations";

type FormState = {
  id?: string;
  name: string;
  type: FinanceWalletType;
  balance: string;
};

const emptyForm: FormState = {
  name: "",
  type: "cash",
  balance: "",
};

const walletTypeOptions: {
  label: string;
  value: FinanceWalletType;
  description: string;
}[] = [
  {
    label: "Tiền mặt",
    value: "cash",
    description: "Tiền mặt đang giữ",
  },
  {
    label: "Ngân hàng",
    value: "bank",
    description: "Tài khoản ngân hàng",
  },
  {
    label: "Ví điện tử",
    value: "ewallet",
    description: "Momo, ZaloPay, ShopeePay...",
  },
  {
    label: "Đầu tư",
    value: "investment",
    description: "Cổ phiếu, quỹ, crypto...",
  },
];

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function reloadData() {
    const [wallets, transactions] = await Promise.all([
      getWallets(),
      getTransactions(),
    ]);
    setWallets(wallets);
    setTransactions(transactions);
  }

  useEffect(() => {
    initFinanceDemoData().then(reloadData);
  }, []);

  useRealtimeTable(["wallets", "transactions"], reloadData);

  const totalAssets = useMemo(() => getTotalAssets(wallets), [wallets]);

  const walletStats = useMemo(() => {
    return walletTypeOptions.map((option) => {
      const total = wallets
        .filter((wallet) => wallet.type === option.value)
        .reduce((sum, wallet) => sum + wallet.balance, 0);

      const count = wallets.filter(
        (wallet) => wallet.type === option.value,
      ).length;

      return {
        ...option,
        total,
        count,
      };
    });
  }, [wallets]);

  function openCreateForm() {
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function openEditForm(wallet: WalletType) {
    setForm({
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
      balance: String(wallet.balance),
    });
    setIsFormOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const balance = Number(form.balance);

    if (!form.name.trim()) {
      alert("Vui lòng nhập tên ví");
      return;
    }

    if (Number.isNaN(balance) || balance < 0) {
      alert("Vui lòng nhập số dư hợp lệ");
      return;
    }

    const wallet: WalletType = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      balance,
    };

    if (form.id) {
      await updateWallet(wallet);
    } else {
      await addWallet(wallet);
    }

    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  async function handleDelete(id: string) {
    const wallet = wallets.find((w) => w.id === id);
    const linked = transactions.filter((t) => t.walletId === id);

    if (linked.length > 0) {
      alert(
        `Không thể xóa ví "${wallet?.name ?? "này"}" vì đang có ${linked.length} giao dịch liên kết.\nHãy xóa hoặc chuyển các giao dịch sang ví khác trước khi xóa ví.`,
      );
      return;
    }

    const ok = confirm(`Bạn có chắc muốn xóa ví "${wallet?.name ?? "này"}"?`);

    if (!ok) return;

    await deleteWallet(id);
    await reloadData();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-sm font-bold text-blue-600">Quản lý ví tiền</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
              Ví tiền & tài khoản
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Quản lý tiền mặt, ngân hàng, ví điện tử và tài sản đầu tư.
            </p>
          </div>

          <button
            onClick={openCreateForm}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
          >
            <Plus size={18} />
            Thêm ví tiền
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.7rem] border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-5 shadow-sm">
          <p className="text-sm font-bold text-blue-600">Tổng tài sản</p>
          <p className="mt-3 text-3xl font-black text-blue-600">
            {formatVND(totalAssets)}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Tính từ tất cả ví tiền hiện có
          </p>
        </div>

        {walletStats.slice(0, 3).map((item) => (
          <div
            key={item.value}
            className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-slate-500">{item.label}</p>
                <p className="mt-3 text-2xl font-black text-slate-900">
                  {formatVND(item.total)}
                </p>
              </div>

              <WalletIcon type={item.value} />
            </div>

            <p className="mt-3 text-sm text-slate-500">
              {item.count} ví • {item.description}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {wallets.map((wallet) => {
          const percent =
            totalAssets > 0
              ? Math.round((wallet.balance / totalAssets) * 100)
              : 0;

          return (
            <div
              key={wallet.id}
              className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <WalletIcon type={wallet.type} />

                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {wallet.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {getWalletTypeLabel(wallet.type)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditForm(wallet)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Edit3 size={16} />
                  </button>

                  <button
                    onClick={() => handleDelete(wallet.id)}
                    className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <p className="mt-6 text-3xl font-black text-blue-600">
                {formatVND(wallet.balance)}
              </p>

              <div className="mt-5">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Tỷ trọng tài sản</span>
                  <span className="font-bold text-slate-900">{percent}%</span>
                </div>

                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {wallets.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            Chưa có ví tiền nào. Hãy thêm ví đầu tiên.
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-y-auto max-h-[90dvh] rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {form.id ? "Sửa ví tiền" : "Thêm ví tiền"}
                </h2>
                <p className="text-sm text-slate-500">
                  Nhập thông tin ví hoặc tài khoản tài chính.
                </p>
              </div>

              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded-2xl bg-slate-100 p-3 text-slate-500 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <Input
                label="Tên ví"
                value={form.name}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, name: value }))
                }
                placeholder="VD: Vietcombank, Tiền mặt..."
              />

              <Input
                label="Số dư hiện tại"
                type="number"
                value={form.balance}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, balance: value }))
                }
                placeholder="VD: 5000000"
              />

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Loại ví
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  {walletTypeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, type: option.value }))
                      }
                      className={`rounded-2xl border p-4 text-left ${
                        form.type === option.value
                          ? "border-blue-200 bg-blue-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <WalletIcon type={option.value} />
                        <div>
                          <p className="font-black text-slate-900">
                            {option.label}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-3 md:col-span-2">
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
                  {form.id ? "Lưu thay đổi" : "Thêm ví tiền"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletIcon({ type }: { type: FinanceWalletType }) {
  const commonClass =
    "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg";

  if (type === "bank") {
    return (
      <div
        className={`${commonClass} bg-gradient-to-br from-blue-600 to-cyan-500`}
      >
        <Landmark size={21} />
      </div>
    );
  }

  if (type === "ewallet") {
    return (
      <div
        className={`${commonClass} bg-gradient-to-br from-violet-500 to-indigo-500`}
      >
        <Wallet size={21} />
      </div>
    );
  }

  if (type === "investment") {
    return (
      <div
        className={`${commonClass} bg-gradient-to-br from-emerald-500 to-teal-400`}
      >
        <BriefcaseBusiness size={21} />
      </div>
    );
  }

  return (
    <div
      className={`${commonClass} bg-gradient-to-br from-amber-400 to-orange-500`}
    >
      <Banknote size={21} />
    </div>
  );
}

function getWalletTypeLabel(type: FinanceWalletType) {
  if (type === "bank") return "Ngân hàng";
  if (type === "ewallet") return "Ví điện tử";
  if (type === "investment") return "Đầu tư";

  return "Tiền mặt";
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
