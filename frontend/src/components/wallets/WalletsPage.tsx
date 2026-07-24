"use client";

import { useEffect, useMemo, useState } from "react";
import { useRealtimeTable } from "@/src/components/realtime/RealtimeProvider";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
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
  addTransaction,
  addWallet,
  deleteWallet,
  getTransactions,
  getWallets,
  updateWallet,
} from "@/src/services/finance/financeStorage";

import {
  formatVND,
  getTotalAssets,
  getTotalExpense,
  getTotalIncome,
} from "@/src/services/finance/financeCalculations";
import { CurrencyInput } from "@/src/components/ui/CurrencyInput";
import { SaveError } from "@/src/components/ui/SaveError";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { useToast } from "@/src/components/ui/ToastProvider";

// ─── Constants ────────────────────────────────────────────────────────────────
type FormState = {
  id?: string;
  name: string;
  type: FinanceWalletType;
  balance: string;
};

type TransferFormState = {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  date: string;
  note: string;
};

const createEmptyTransferForm = (): TransferFormState => ({
  fromWalletId: "",
  toWalletId: "",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  note: "",
});

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
  { label: "Tiền mặt", value: "cash", description: "Tiền mặt đang giữ" },
  { label: "Ngân hàng", value: "bank", description: "Tài khoản ngân hàng" },
  {
    label: "Ví điện tử",
    value: "ewallet",
    description: "Momo, ZaloPay, ShopeePay...",
  },
];

const TYPE_COLORS: Record<FinanceWalletType, string> = {
  cash: "#f59e0b",
  bank: "#2563eb",
  ewallet: "#7c3aed",
  investment: "#10b981",
};

type EngineTransferTransaction = Transaction & {
  transferReferenceType?: string | null;
  transfer_reference_type?: string | null;
  sourceType?: string | null;
  source_type?: string | null;
  destinationType?: string | null;
  destination_type?: string | null;
};

function getTransferReferenceType(transaction: Transaction) {
  const tx = transaction as EngineTransferTransaction;
  return tx.transferReferenceType ?? tx.transfer_reference_type ?? null;
}

function isWalletTransfer(transaction: Transaction) {
  if (transaction.type !== "transfer") return false;

  const referenceType = getTransferReferenceType(transaction);

  // Old wallet-transfer rows did not have transfer_reference_type yet,
  // but they always have transferToWalletId. Keep them visible as wallet transfers.
  if (!referenceType) return Boolean(transaction.transferToWalletId);

  return referenceType === "wallet";
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletType[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [transferForm, setTransferForm] = useState<TransferFormState>(
    createEmptyTransferForm,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  async function reloadData() {
    const [w, t] = await Promise.all([getWallets(), getTransactions()]);
    setWallets(w);
    setTransactions(t);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);
  useRealtimeTable(["wallets", "transactions"], reloadData);

  // ── Existing computations ─────────────────────────────────────────────────
  const totalAssets = useMemo(() => getTotalAssets(wallets), [wallets]);

  const walletStats = useMemo(
    () =>
      walletTypeOptions.map((o) => ({
        ...o,
        total: wallets
          .filter((w) => w.type === o.value)
          .reduce((s, w) => s + w.balance, 0),
        count: wallets.filter((w) => w.type === o.value).length,
      })),
    [wallets],
  );

  // ── New analytics ─────────────────────────────────────────────────────────
  const now = new Date();
  const currentMonth =
    now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  const currentMonthTxns = useMemo(
    () => transactions.filter((t) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth],
  );
  const currentMonthNet = useMemo(
    () => getTotalIncome(currentMonthTxns) - getTotalExpense(currentMonthTxns),
    [currentMonthTxns],
  );

  const currentMonthTransfers = useMemo(
    () => currentMonthTxns.filter(isWalletTransfer),
    [currentMonthTxns],
  );

  const currentMonthTransferTotal = useMemo(
    () => currentMonthTransfers.reduce((sum, t) => sum + t.amount, 0),
    [currentMonthTransfers],
  );

  // Per-wallet monthly flow
  const walletFlow = useMemo(() => {
    const map = new Map<
      string,
      {
        income: number;
        expense: number;
        transferIn: number;
        transferOut: number;
      }
    >();
    for (const w of wallets) {
      const wt = currentMonthTxns.filter((t) => t.walletId === w.id);
      map.set(w.id, {
        income: getTotalIncome(wt),
        expense: getTotalExpense(wt),
        transferIn: currentMonthTransfers
          .filter((t) => t.transferToWalletId === w.id)
          .reduce((sum, t) => sum + t.amount, 0),
        transferOut: currentMonthTransfers
          .filter((t) => t.walletId === w.id)
          .reduce((sum, t) => sum + t.amount, 0),
      });
    }
    return map;
  }, [wallets, currentMonthTxns, currentMonthTransfers]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
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

  function openTransferForm(defaultFromWalletId?: string) {
    const fromWalletId = defaultFromWalletId ?? wallets[0]?.id ?? "";
    const toWalletId =
      wallets.find((wallet) => wallet.id !== fromWalletId)?.id ?? "";

    setTransferForm({
      ...createEmptyTransferForm(),
      fromWalletId,
      toWalletId,
    });
    setSaveError(null);
    setIsTransferOpen(true);
  }

  async function handleTransferSubmit(event: React.FormEvent) {
    event.preventDefault();

    const amount = Number(transferForm.amount);
    const fromWallet = wallets.find(
      (wallet) => wallet.id === transferForm.fromWalletId,
    );
    const toWallet = wallets.find(
      (wallet) => wallet.id === transferForm.toWalletId,
    );

    if (!fromWallet) {
      setSaveError("Vui lòng chọn ví nguồn");
      return;
    }

    if (!toWallet) {
      setSaveError("Vui lòng chọn ví đích");
      return;
    }

    if (fromWallet.id === toWallet.id) {
      setSaveError("Ví nguồn và ví đích phải khác nhau");
      return;
    }

    if (!amount || amount <= 0) {
      setSaveError("Vui lòng nhập số tiền hợp lệ");
      return;
    }

    if (fromWallet.balance < amount) {
      setSaveError("Ví nguồn không đủ số dư để chuyển tiền");
      return;
    }

    const transaction = {
      id: crypto.randomUUID(),
      type: "transfer",
      amount,
      categoryId: "wallet-transfer",
      walletId: fromWallet.id,
      transferToWalletId: toWallet.id,
      note:
        transferForm.note.trim() ||
        `Chuyển tiền từ ${fromWallet.name} sang ${toWallet.name}`,
      date: transferForm.date,
      transferReferenceType: "wallet",
      transfer_reference_type: "wallet",
      sourceType: "wallet",
      source_type: "wallet",
      destinationType: "wallet",
      destination_type: "wallet",
    } as Transaction & EngineTransferTransaction;

    setSaveError(null);

    // Finance Engine v2 rule:
    // WalletsPage only creates the transfer transaction.
    // addTransaction() is the single place that applies wallet balance effects.
    // Do not call updateWallet() here, otherwise the source/destination balances
    // are deducted/added twice.
    const transactionResult = await addTransaction(transaction);
    if (transactionResult.error) {
      setSaveError(transactionResult.error);
      return;
    }

    toast({
      variant: "success",
      message: `Đã chuyển ${formatVND(amount)} từ ${fromWallet.name} sang ${toWallet.name}.`,
    });
    await reloadData();
    setIsTransferOpen(false);
    setTransferForm(createEmptyTransferForm());
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const balance = Number(form.balance);
    if (!form.name.trim()) {
      setSaveError("Vui lòng nhập tên ví");
      return;
    }
    if (Number.isNaN(balance) || balance < 0) {
      setSaveError("Vui lòng nhập số dư hợp lệ");
      return;
    }
    const wallet: WalletType = {
      id: form.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      balance,
    };
    setSaveError(null);
    const { error } = form.id
      ? await updateWallet(wallet)
      : await addWallet(wallet);
    if (error) {
      setSaveError(error);
      return;
    }
    await reloadData();
    setIsFormOpen(false);
    setForm(emptyForm);
  }

  function handleDelete(id: string) {
    const wallet = wallets.find((w) => w.id === id);
    const linked = transactions.filter(
      (t) => t.walletId === id || t.transferToWalletId === id,
    );
    if (linked.length > 0) {
      toast({
        variant: "warning",
        message: `Không thể xóa ví "${wallet?.name ?? "này"}" vì đang có ${linked.length} giao dịch liên kết. Hãy xóa hoặc chuyển các giao dịch trước.`,
      });
      return;
    }
    setPendingAction({
      title: `Xóa ví "${wallet?.name ?? "này"}"?`,
      description:
        "Hành động này không thể hoàn tác. Ví sẽ bị xóa khỏi tài khoản của bạn.",
      variant: "danger",
      onConfirm: async () => {
        const { error } = await deleteWallet(id);
        if (error) {
          toast({ variant: "error", message: "Lỗi xóa ví: " + error });
          return;
        }
        toast({ variant: "success", message: "Đã xóa ví thành công." });
        await reloadData();
      },
    });
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* SECTION 1 · Wallet Overview */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-500">
              Wallet Center
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
              Ví tiền
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Quản lý tiền mặt, tài khoản ngân hàng và ví điện tử.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => openTransferForm()}
              disabled={wallets.length < 2}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeftRight size={16} />
              Chuyển tiền
            </button>
            <button
              onClick={openCreateForm}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200/60 transition hover:bg-blue-700 active:scale-[.98]"
            >
              <Plus size={16} />
              Thêm ví
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WalletSummaryCard
            label="Tổng số dư"
            value={formatVND(totalAssets)}
            note={`${wallets.length} ví đang quản lý`}
            tone="blue"
          />
          <WalletSummaryCard
            label="Tiền vào tháng này"
            value={formatVND(getTotalIncome(currentMonthTxns))}
            note={`Tháng ${now.getMonth() + 1}/${now.getFullYear()}`}
            tone="emerald"
          />
          <WalletSummaryCard
            label="Tiền ra tháng này"
            value={formatVND(getTotalExpense(currentMonthTxns))}
            note={
              currentMonthNet >= 0 ? "Dòng tiền đang dương" : "Chi lớn hơn thu"
            }
            tone="rose"
          />
          <WalletSummaryCard
            label="Chuyển giữa ví"
            value={formatVND(currentMonthTransferTotal)}
            note={`${currentMonthTransfers.length} giao dịch`}
            tone="indigo"
          />
        </div>
      </section>
      {/* SECTION 2 · Wallet Types */}
      <section className="rounded-4xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">
              Phân loại ví
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tổng số dư theo loại ví đang sử dụng.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {wallets.length} ví
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {walletStats.map((stat) => {
            const percentage =
              totalAssets > 0
                ? Math.round((stat.total / totalAssets) * 100)
                : 0;
            return (
              <button
                key={stat.value}
                type="button"
                onClick={() => {
                  const wallet = wallets.find(
                    (item) => item.type === stat.value,
                  );
                  if (wallet) openEditForm(wallet);
                  else {
                    setForm({ ...emptyForm, type: stat.value });
                    setIsFormOpen(true);
                  }
                }}
                className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <WalletIcon type={stat.value} compact />
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {stat.label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {stat.count} ví
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-slate-700">
                    {percentage}%
                  </span>
                </div>
                <p className="mt-4 text-xl font-black text-slate-900">
                  {formatVND(stat.total)}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(percentage, 100)}%`,
                      background: TYPE_COLORS[stat.value],
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3 · Wallet List
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="mb-4 flex items-center gap-2 px-1">
          <div className="size-1.5 rounded-full bg-blue-600" />
          <p className="text-sm font-black text-slate-700">Danh sách ví</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wallets.map((wallet) => {
            const pct =
              totalAssets > 0
                ? Math.round((wallet.balance / totalAssets) * 100)
                : 0;
            const flow = walletFlow.get(wallet.id) ?? {
              income: 0,
              expense: 0,
              transferIn: 0,
              transferOut: 0,
            };
            const net = flow.income - flow.expense;
            const txCount = transactions.filter(
              (t) =>
                t.walletId === wallet.id || t.transferToWalletId === wallet.id,
            ).length;
            const color = TYPE_COLORS[wallet.type];

            return (
              <div
                key={wallet.id}
                className="group relative rounded-4xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md"
              >
                {/* Header */}
                <div className="min-w-0 pr-20">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0">
                      <WalletIcon type={wallet.type} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black leading-tight text-slate-900 wrap-anywhere">
                        {wallet.name}
                      </h3>
                      <span
                        className="mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          borderColor: color + "33",
                          background: color + "11",
                          color,
                        }}
                      >
                        {getWalletTypeLabel(wallet.type)}
                      </span>
                    </div>
                  </div>

                  <div className="absolute right-6 top-6 z-10 flex shrink-0 gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditForm(wallet)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-400 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                      aria-label="Sửa ví"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(wallet.id)}
                      className="flex size-8 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-400 shadow-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                      aria-label="Xóa ví"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div className="mt-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Số dư hiện tại
                  </p>
                  <p className="mt-1 text-2xl font-black text-blue-700">
                    {formatVND(wallet.balance)}
                  </p>
                </div>

                {/* Monthly flow */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-center">
                    <p className="text-[9px] font-bold text-emerald-600 uppercase">
                      Thu
                    </p>
                    <p className="mt-0.5 text-xs font-black text-emerald-700">
                      {flow.income > 0
                        ? Math.round(flow.income / 1e3) + "K"
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-rose-50 px-2.5 py-2 text-center">
                    <p className="text-[9px] font-bold text-rose-500 uppercase">
                      Chi
                    </p>
                    <p className="mt-0.5 text-xs font-black text-rose-600">
                      {flow.expense > 0
                        ? Math.round(flow.expense / 1e3) + "K"
                        : "—"}
                    </p>
                  </div>
                  <div
                    className={
                      "rounded-xl px-2.5 py-2 text-center " +
                      (net >= 0 ? "bg-blue-50" : "bg-rose-50")
                    }
                  >
                    <p
                      className={
                        "text-[9px] font-bold uppercase " +
                        (net >= 0 ? "text-blue-600" : "text-rose-500")
                      }
                    >
                      Ròng
                    </p>
                    <p
                      className={
                        "mt-0.5 flex items-center justify-center gap-0.5 text-xs font-black " +
                        (net >= 0 ? "text-blue-700" : "text-rose-600")
                      }
                    >
                      {net > 0 ? (
                        <ArrowUpRight size={9} />
                      ) : net < 0 ? (
                        <ArrowDownRight size={9} />
                      ) : null}
                      {net !== 0 ? Math.round(Math.abs(net) / 1e3) + "K" : "—"}
                    </p>
                  </div>
                </div>

                {/* Contribution bar */}
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tỷ trọng tài sản</span>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-700">{pct}%</span>
                      <span className="text-slate-400">
                        · {txCount} giao dịch
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full transition-all duration-500"
                      style={{ width: pct + "%", background: color }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openTransferForm(wallet.id)}
                  disabled={wallets.length < 2}
                  className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-xs font-black text-indigo-600 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowLeftRight size={13} />
                  Chuyển tiền từ ví này
                </button>
              </div>
            );
          })}

          {/* Empty state */}
          {wallets.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-4xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-12 text-center md:col-span-2 xl:col-span-3">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-blue-100">
                <Wallet size={24} className="text-blue-400" />
              </div>
              <h3 className="mt-4 text-base font-black text-slate-700">
                Chưa có ví tiền nào
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Bắt đầu bằng cách thêm ví đầu tiên của bạn.
              </p>
              <button
                onClick={openCreateForm}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Plus size={15} />
                Thêm ví tiền
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          Transfer Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-950/55 px-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex h-[min(90dvh,700px)] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-3 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:p-6 sm:pb-4">
              <div>
                <div className="mb-2 flex size-9 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-blue-500 text-white shadow-lg shadow-indigo-100">
                  <ArrowLeftRight size={18} />
                </div>
                <h2 className="text-xl font-black text-slate-900">
                  Chuyển tiền giữa các ví
                </h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-400">
                  Chuyển tiền chỉ thay đổi số dư giữa các ví.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleTransferSubmit}
              className="min-h-0 flex flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 py-4 pb-5 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-5">
                {wallets.length < 2 ? (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-700">
                    Bạn cần ít nhất 2 ví để dùng tính năng chuyển tiền.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <WalletSelect
                      label="Từ ví"
                      wallets={wallets}
                      value={transferForm.fromWalletId}
                      onChange={(value) => {
                        setTransferForm((prev) => ({
                          ...prev,
                          fromWalletId: value,
                          toWalletId:
                            prev.toWalletId && prev.toWalletId !== value
                              ? prev.toWalletId
                              : (wallets.find((wallet) => wallet.id !== value)
                                  ?.id ?? ""),
                        }));
                      }}
                    />

                    <WalletSelect
                      label="Đến ví"
                      wallets={wallets.filter(
                        (wallet) => wallet.id !== transferForm.fromWalletId,
                      )}
                      value={transferForm.toWalletId}
                      onChange={(value) =>
                        setTransferForm((prev) => ({
                          ...prev,
                          toWalletId: value,
                        }))
                      }
                    />

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-sm font-black text-slate-700">
                          Số tiền chuyển
                        </p>
                        <CurrencyInput
                          value={transferForm.amount}
                          onChange={(raw: string) =>
                            setTransferForm((prev) => ({
                              ...prev,
                              amount: raw,
                            }))
                          }
                          placeholder="0"
                        />
                      </div>
                      <FormInput
                        label="Ngày chuyển"
                        type="date"
                        value={transferForm.date}
                        onChange={(value) =>
                          setTransferForm((prev) => ({ ...prev, date: value }))
                        }
                      />
                    </div>

                    <FormInput
                      label="Ghi chú"
                      value={transferForm.note}
                      onChange={(value) =>
                        setTransferForm((prev) => ({ ...prev, note: value }))
                      }
                      placeholder="VD: Rút tiền mặt, chuyển sang ví chi tiêu..."
                    />
                  </div>
                )}

                <SaveError
                  message={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTransferOpen(false)}
                    className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={wallets.length < 2}
                    className="flex-1 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Chuyển tiền
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CRUD Modal
          ══════════════════════════════════════════════════════════════════ */}
      {isFormOpen && (
        <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-950/55 px-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex h-[min(84dvh,620px)] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl">
            {/* Modal header */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-3 pt-[calc(0.875rem+env(safe-area-inset-top))] sm:p-6 sm:pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {form.id ? "Sửa ví tiền" : "Thêm ví tiền"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-400">
                  Nhập thông tin ví hoặc tài khoản thanh toán.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="min-h-0 flex flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 py-4 pb-5 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <FormInput
                    label="Tên ví"
                    value={form.name}
                    onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="VD: Vietcombank, Tiền mặt..."
                  />
                  {/* Balance with ₫ prefix */}
                  <div>
                    <p className="mb-1.5 text-sm font-black text-slate-700">
                      Số dư hiện tại
                    </p>
                    <CurrencyInput
                      value={form.balance}
                      onChange={(raw: string) =>
                        setForm((p) => ({ ...p, balance: raw }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Wallet type */}
                <div className="mt-4">
                  <p className="mb-2.5 text-sm font-black text-slate-700">
                    Loại ví
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {walletTypeOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({ ...p, type: o.value }))
                        }
                        className={
                          "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all " +
                          (form.type === o.value
                            ? "border-blue-300 bg-blue-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")
                        }
                      >
                        <WalletIcon type={o.value} />
                        <div>
                          <p
                            className={
                              "text-sm font-black " +
                              (form.type === o.value
                                ? "text-blue-700"
                                : "text-slate-900")
                            }
                          >
                            {o.label}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {o.description}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <SaveError
                  message={saveError}
                  onDismiss={() => setSaveError(null)}
                />
              </div>

              {/* Actions */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-2xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-[.98]"
                  >
                    {form.id ? "Lưu thay đổi" : "Thêm ví tiền"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WalletSummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "blue" | "emerald" | "rose" | "indigo";
}) {
  const styles = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };

  return (
    <div className={"rounded-3xl border p-4 " + styles[tone]}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 truncate text-xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold opacity-70">{note}</p>
    </div>
  );
}

function WalletIcon({
  type,
  compact = false,
}: {
  type: FinanceWalletType;
  compact?: boolean;
}) {
  const base = compact
    ? "flex size-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
    : "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm";

  if (type === "bank") {
    return (
      <div className={base + " bg-linear-to-br from-blue-600 to-cyan-500"}>
        <Landmark size={20} />
      </div>
    );
  }

  if (type === "ewallet") {
    return (
      <div className={base + " bg-linear-to-br from-violet-500 to-indigo-500"}>
        <Wallet size={20} />
      </div>
    );
  }

  if (type === "investment") {
    return (
      <div className={base + " bg-linear-to-br from-emerald-500 to-teal-400"}>
        <Landmark size={20} />
      </div>
    );
  }

  return (
    <div className={base + " bg-linear-to-br from-amber-400 to-orange-500"}>
      <Banknote size={20} />
    </div>
  );
}

function WalletBrandLogo({
  wallet,
  size = "sm",
}: {
  wallet?: Pick<WalletType, "name" | "type"> | null;
  size?: "sm" | "md";
}) {
  const name = (wallet?.name ?? "").toLowerCase();
  const type = wallet?.type ?? "cash";
  const dimension =
    size === "md" ? "size-10 rounded-2xl text-sm" : "size-8 rounded-xl text-xs";

  if (type === "bank") {
    if (name.includes("vietcombank") || name.includes("vcb")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-emerald-50 text-emerald-700 shadow-sm`}
        >
          <span className="font-black">VCB</span>
        </span>
      );
    }

    if (name.includes("mb") || name.includes("mbbank")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-blue-50 text-blue-700 shadow-sm`}
        >
          <span className="font-black">MB</span>
        </span>
      );
    }

    if (name.includes("techcombank") || name.includes("tcb")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-red-50 text-red-600 shadow-sm`}
        >
          <span className="font-black">TCB</span>
        </span>
      );
    }

    if (name.includes("vpbank") || name.includes("vpb")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-emerald-50 text-emerald-600 shadow-sm`}
        >
          <span className="font-black">VP</span>
        </span>
      );
    }

    return (
      <span
        className={`flex ${dimension} shrink-0 items-center justify-center bg-blue-50 text-blue-600 shadow-sm`}
      >
        <Landmark size={size === "md" ? 18 : 15} />
      </span>
    );
  }

  if (type === "ewallet") {
    if (name.includes("momo")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-pink-50 text-pink-600 shadow-sm`}
        >
          <span className="font-black">mo</span>
        </span>
      );
    }

    if (name.includes("zalopay") || name.includes("zalo")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-blue-50 text-blue-600 shadow-sm`}
        >
          <span className="font-black">ZP</span>
        </span>
      );
    }

    if (name.includes("vn pay") || name.includes("vnpay")) {
      return (
        <span
          className={`flex ${dimension} shrink-0 items-center justify-center bg-indigo-50 text-indigo-600 shadow-sm`}
        >
          <span className="font-black">VN</span>
        </span>
      );
    }

    return (
      <span
        className={`flex ${dimension} shrink-0 items-center justify-center bg-violet-50 text-violet-600 shadow-sm`}
      >
        <Wallet size={size === "md" ? 18 : 15} />
      </span>
    );
  }

  return (
    <span
      className={`flex ${dimension} shrink-0 items-center justify-center bg-amber-50 text-amber-600 shadow-sm`}
    >
      <Banknote size={size === "md" ? 18 : 15} />
    </span>
  );
}

function getWalletTypeLabel(type: FinanceWalletType) {
  if (type === "bank") return "Ngân hàng";
  if (type === "ewallet") return "Ví điện tử";
  return "Tiền mặt";
}

function WalletSelect({
  label,
  wallets,
  value,
  onChange,
}: {
  label: string;
  wallets: WalletType[];
  value: string;
  onChange: (value: string) => void;
}) {
  const selectedWallet = wallets.find((wallet) => wallet.id === value);

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="relative">
          {selectedWallet && (
            <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
              <WalletBrandLogo wallet={selectedWallet} />
            </div>
          )}
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={
              "min-h-11 w-full rounded-2xl border border-slate-200 bg-white py-2.5 pr-4 text-base font-bold text-slate-700 outline-none focus:border-blue-400 sm:text-sm " +
              (selectedWallet ? "pl-14" : "pl-4")
            }
          >
            <option value="">Chọn ví</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} · {formatVND(wallet.balance)}
              </option>
            ))}
          </select>
        </div>
        {selectedWallet && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs">
            <span className="flex items-center gap-2 font-bold text-slate-500">
              <WalletBrandLogo wallet={selectedWallet} />
              {getWalletTypeLabel(selectedWallet.type)}
            </span>
            <span className="font-black text-slate-900">
              {formatVND(selectedWallet.balance)}
            </span>
          </div>
        )}
      </div>
    </label>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base outline-none focus:border-blue-400 focus:bg-white sm:text-sm"
      />
    </label>
  );
}
