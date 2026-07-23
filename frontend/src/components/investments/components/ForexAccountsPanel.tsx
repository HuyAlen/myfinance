"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Edit3,
  Landmark,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { ForexAccount, ForexCashTransaction } from "@/src/types/finance";
import ConfirmDialog, {
  type PendingConfirm,
} from "@/src/components/ui/ConfirmDialog";
import { SaveError } from "@/src/components/ui/SaveError";
import { useToast } from "@/src/components/ui/ToastProvider";
import { forexAccountRepository } from "../data/forexAccountRepository";
import { forexCashTransactionRepository } from "../data/forexCashTransactionRepository";
import {
  calculateForexAccountCashMetrics,
  summarizeForexCashAccounts,
} from "../domain/forexAccountAnalytics";
import {
  createEmptyForexAccountForm,
  mapForexAccountToForm,
  mapFormToForexAccount,
  validateForexAccountForm,
} from "../domain/forexAccountForm";
import {
  createEmptyForexCashTransactionForm,
  mapFormToForexCashTransaction,
  mapForexCashTransactionToForm,
  validateForexCashTransactionForm,
} from "../domain/forexCashTransactionForm";
import type {
  ForexAccountFormState,
  ForexCashTransactionFormState,
} from "../domain/forexAccountTypes";
import { useForexCashAccounts } from "../hooks/useForexCashAccounts";

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "VND" ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString("vi-VN")} ${currency}`;
  }
}

function formatTransactionDateTime(transaction: ForexCashTransaction): string {
  const datePart = String(transaction.transactionDate ?? "").slice(0, 10);
  const timePart = String(transaction.transactionTime ?? "00:00").slice(0, 5);

  if (!datePart) return timePart || "--:--";

  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return `${datePart} · ${timePart}`;

  return `${day}/${month}/${year} · ${timePart}`;
}

function normalizeTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function ForexAccountsPanel() {
  const { accounts, transactions, wallets, isLoading, loadError, reload } =
    useForexCashAccounts();
  const [accountForm, setAccountForm] = useState<ForexAccountFormState>(() =>
    createEmptyForexAccountForm(),
  );
  const [transactionForm, setTransactionForm] =
    useState<ForexCashTransactionFormState>(() =>
      createEmptyForexCashTransactionForm(),
    );
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingConfirm | null>(
    null,
  );
  const { toast } = useToast();

  const summary = useMemo(
    () => summarizeForexCashAccounts(accounts, transactions),
    [accounts, transactions],
  );
  const accountMetrics = useMemo(
    () =>
      accounts.map((account) =>
        calculateForexAccountCashMetrics(account, transactions),
      ),
    [accounts, transactions],
  );

  function openCreateAccount() {
    setAccountForm(createEmptyForexAccountForm());
    setSaveError(null);
    setAccountModalOpen(true);
  }

  function openEditAccount(account: ForexAccount) {
    setAccountForm(mapForexAccountToForm(account));
    setSaveError(null);
    setAccountModalOpen(true);
  }

  function openCreateTransaction(
    accountId = accounts[0]?.id ?? "",
    type: ForexCashTransactionFormState["type"] = "deposit",
  ) {
    const walletId = wallets[0]?.id ?? "";
    setTransactionForm({
      ...createEmptyForexCashTransactionForm(accountId, walletId),
      type,
    });
    setSaveError(null);
    setTransactionModalOpen(true);
  }

  function openEditTransaction(transaction: ForexCashTransaction) {
    setTransactionForm(mapForexCashTransactionToForm(transaction));
    setSaveError(null);
    setTransactionModalOpen(true);
  }

  async function submitAccount(event: React.FormEvent) {
    event.preventDefault();
    if (isSaving) return;
    const validationError = validateForexAccountForm(accountForm);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const account = mapFormToForexAccount({
        ...accountForm,
        currency: "VND",
      });
      const result = accountForm.id
        ? await forexAccountRepository.update(account)
        : await forexAccountRepository.create(account);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      await reload();
      setAccountModalOpen(false);
      toast({
        variant: "success",
        message: accountForm.id
          ? "Đã cập nhật tài khoản Forex."
          : "Đã thêm tài khoản Forex.",
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Không thể lưu tài khoản Forex.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function submitTransaction(event: React.FormEvent) {
    event.preventDefault();
    if (isSaving) return;
    const validationError = validateForexCashTransactionForm(transactionForm);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    const account = accounts.find(
      (item) => item.id === transactionForm.forexAccountId,
    );
    if (!account) {
      setSaveError("Không tìm thấy tài khoản Forex.");
      return;
    }

    const wallet = wallets.find((item) => item.id === transactionForm.walletId);
    if (!wallet) {
      setSaveError("Vui lòng chọn ví nguồn hoặc ví nhận tiền.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const transaction = {
        ...mapFormToForexCashTransaction(transactionForm),
        walletId: wallet.id,
      };
      const result = transactionForm.id
        ? await forexCashTransactionRepository.update(transaction)
        : await forexCashTransactionRepository.create(transaction);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      await reload();
      setTransactionModalOpen(false);
      toast({
        variant: "success",
        message: transactionForm.id
          ? "Đã cập nhật giao dịch Forex."
          : transaction.type === "deposit"
            ? "Đã ghi nhận nạp tiền vào Forex."
            : "Đã ghi nhận rút tiền từ Forex.",
      });
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Không thể lưu giao dịch Forex.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function requestDeleteAccount(account: ForexAccount) {
    setPendingAction({
      title: "Xóa tài khoản Forex?",
      description: `Tài khoản ${account.name} và toàn bộ lịch sử nạp/rút của tài khoản sẽ bị xóa.`,
      variant: "danger",
      onConfirm: async () => {
        const result = await forexAccountRepository.remove(account.id);
        if (result.error) {
          toast({ variant: "error", message: result.error });
          return;
        }
        await reload();
        toast({ variant: "success", message: "Đã xóa tài khoản Forex." });
      },
    });
  }

  function requestDeleteTransaction(transaction: ForexCashTransaction) {
    setPendingAction({
      title: "Xóa giao dịch nạp/rút?",
      description: "Giao dịch này sẽ bị xóa khỏi lịch sử dòng tiền Forex.",
      variant: "danger",
      onConfirm: async () => {
        const result = await forexCashTransactionRepository.remove(
          transaction.id,
        );
        if (result.error) {
          toast({ variant: "error", message: result.error });
          return;
        }
        await reload();
        toast({ variant: "success", message: "Đã xóa giao dịch Forex." });
      },
    });
  }

  const defaultCurrency = "VND";

  return (
    <section className="rounded-4xl border border-sky-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-br from-sky-500 to-blue-600 text-white">
            <Landmark size={19} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-sky-600">
              Forex Cash Account
            </p>
            <h2 className="text-xl font-black text-slate-900">
              Dòng tiền Forex
            </h2>
            <p className="text-xs text-slate-500">
              Chỉ quản lý tiền đã nạp và đã rút, không theo dõi giao dịch
              trading.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"
            aria-label="Làm mới"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={() => openCreateTransaction()}
            disabled={accounts.length === 0}
            className="flex items-center gap-2 rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-bold text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUpRight size={16} /> Ghi nạp/rút
          </button>
          <button
            type="button"
            onClick={openCreateAccount}
            className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700"
          >
            <Plus size={16} /> Thêm tài khoản
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          [
            "Tài khoản",
            `${summary.activeCount}/${summary.accountCount} active`,
          ],
          ["Tổng đã nạp", formatMoney(summary.totalDeposited, defaultCurrency)],
          ["Tổng đã rút", formatMoney(summary.totalWithdrawn, defaultCurrency)],
          ["Phí đã ghi nhận", formatMoney(summary.totalFees, defaultCurrency)],
          ["Dòng tiền ròng", formatMoney(summary.netCashFlow, defaultCurrency)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
          >
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
              {label}
            </p>
            <p className="mt-1 truncate text-sm font-black text-slate-800">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {isLoading && accounts.length === 0 ? (
          <div className="col-span-full rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
            Đang tải dữ liệu Forex...
          </div>
        ) : null}
        {!isLoading && accounts.length === 0 ? (
          <button
            type="button"
            onClick={openCreateAccount}
            className="col-span-full rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 p-8 text-center"
          >
            <p className="font-black text-sky-700">Chưa có tài khoản Forex</p>
            <p className="mt-1 text-sm text-slate-500">
              Tạo tài khoản để bắt đầu ghi nhận tiền nạp và tiền rút.
            </p>
          </button>
        ) : null}

        {accountMetrics.map((account) => (
          <article
            key={account.id}
            className="rounded-2xl border border-slate-200 p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-900">{account.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      account.status === "active"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {account.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {account.broker}
                  {account.accountNumber ? ` · ${account.accountNumber}` : ""} ·
                  VND
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => openEditAccount(account)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                >
                  <Edit3 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteAccount(account)}
                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Metric
                label="Đã nạp"
                value={formatMoney(account.deposits, "VND")}
              />
              <Metric
                label="Đã rút"
                value={formatMoney(account.withdrawals, "VND")}
              />
              <Metric
                label="Dòng tiền ròng"
                value={formatMoney(account.netCashFlow, "VND")}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => openCreateTransaction(account.id, "deposit")}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"
              >
                <ArrowUpRight size={15} /> Nạp
              </button>
              <button
                type="button"
                onClick={() => openCreateTransaction(account.id, "withdrawal")}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"
              >
                <ArrowDownLeft size={15} /> Rút
              </button>
            </div>
          </article>
        ))}
      </div>

      {transactions.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="font-black text-slate-800">Lịch sử nạp/rút</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {transactions.slice(0, 20).map((transaction) => {
              const account = accounts.find(
                (item) => item.id === transaction.forexAccountId,
              );
              const wallet = wallets.find(
                (item) => item.id === transaction.walletId,
              );
              const isDeposit = transaction.type === "deposit";
              return (
                <div
                  key={transaction.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-9 items-center justify-center rounded-xl ${
                        isDeposit
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {isDeposit ? (
                        <ArrowUpRight size={16} />
                      ) : (
                        <ArrowDownLeft size={16} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        {isDeposit ? "Nạp vào Forex" : "Rút từ Forex"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {account?.name ?? "Tài khoản đã xóa"} ·{" "}
                        {wallet?.name ?? "Ví đã xóa"} ·{" "}
                        {formatTransactionDateTime(transaction)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p
                        className={`font-black ${
                          isDeposit ? "text-emerald-600" : "text-blue-700"
                        }`}
                      >
                        {isDeposit ? "+" : "-"}
                        {formatMoney(transaction.amount, "VND")}
                      </p>
                      {(transaction.fee ?? 0) > 0 ? (
                        <p className="text-xs text-slate-400">
                          Phí {formatMoney(transaction.fee ?? 0, "VND")}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditTransaction(transaction)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDeleteTransaction(transaction)}
                      className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {accountModalOpen ? (
        <Modal
          title={
            accountForm.id ? "Cập nhật tài khoản Forex" : "Thêm tài khoản Forex"
          }
          onClose={() => !isSaving && setAccountModalOpen(false)}
        >
          <form onSubmit={submitAccount} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Tên tài khoản *"
                value={accountForm.name}
                onChange={(value) =>
                  setAccountForm((current) => ({ ...current, name: value }))
                }
                placeholder="Forex Main"
              />
              <Field
                label="Broker / nền tảng *"
                value={accountForm.broker}
                onChange={(value) =>
                  setAccountForm((current) => ({ ...current, broker: value }))
                }
                placeholder="IC Markets"
              />
              <Field
                label="Account number"
                value={accountForm.accountNumber}
                onChange={(value) =>
                  setAccountForm((current) => ({
                    ...current,
                    accountNumber: value,
                  }))
                }
              />
              <label>
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Tiền tệ
                </span>
                <input
                  value="VND"
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-600"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Trạng thái
                </span>
                <select
                  value={accountForm.status}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      status: event.target
                        .value as ForexAccountFormState["status"],
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Ngày mở
                </span>
                <input
                  type="date"
                  value={accountForm.openedAt}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      openedAt: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Ghi chú
                </span>
                <textarea
                  value={accountForm.notes}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
            </div>
            <FormActions
              isSaving={isSaving}
              saveError={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setAccountModalOpen(false)}
            />
          </form>
        </Modal>
      ) : null}

      {transactionModalOpen ? (
        <Modal
          title={
            transactionForm.id
              ? "Cập nhật giao dịch Forex"
              : "Ghi nhận nạp/rút Forex"
          }
          onClose={() => !isSaving && setTransactionModalOpen(false)}
        >
          <form onSubmit={submitTransaction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Tài khoản Forex *
                </span>
                <select
                  value={transactionForm.forexAccountId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      forexAccountId: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · VND
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  {transactionForm.type === "deposit"
                    ? "Ví dùng để nạp tiền *"
                    : "Ví nhận tiền rút *"}
                </span>
                <select
                  value={transactionForm.walletId}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      walletId: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  <option value="">Chọn ví</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} · {formatMoney(wallet.balance, "VND")}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  Nạp tiền sẽ trừ số dư ví; rút tiền sẽ cộng số dư ví sau khi
                  trừ phí.
                </p>
              </label>
              <label>
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Loại giao dịch *
                </span>
                <select
                  value={transactionForm.type}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      type: event.target
                        .value as ForexCashTransactionFormState["type"],
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  <option value="deposit">Nạp vào Forex</option>
                  <option value="withdrawal">Rút từ Forex</option>
                </select>
              </label>
              <NumberField
                label="Số tiền (VND) *"
                value={transactionForm.amount}
                onChange={(value) =>
                  setTransactionForm((current) => ({
                    ...current,
                    amount: value,
                  }))
                }
              />
              <NumberField
                label="Phí (VND)"
                value={transactionForm.fee}
                onChange={(value) =>
                  setTransactionForm((current) => ({ ...current, fee: value }))
                }
              />
              <label>
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Ngày giao dịch *
                </span>
                <input
                  type="date"
                  value={transactionForm.transactionDate}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      transactionDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
              <label>
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Giờ giao dịch *
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  placeholder="23:27"
                  value={transactionForm.transactionTime}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      transactionTime: normalizeTimeInput(event.target.value),
                    }))
                  }
                  onBlur={() =>
                    setTransactionForm((current) => {
                      const value = current.transactionTime.trim();
                      if (/^\d{1,2}:\d{2}$/.test(value)) {
                        const [hour, minute] = value.split(":");
                        return {
                          ...current,
                          transactionTime: `${hour.padStart(2, "0")}:${minute}`,
                        };
                      }
                      return current;
                    })
                  }
                  aria-label="Giờ giao dịch theo định dạng 24 giờ"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono tabular-nums"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Định dạng 24 giờ, ví dụ 23:27.
                </p>
              </label>
              {(() => {
                const amount = Number(transactionForm.amount) || 0;
                const fee = Number(transactionForm.fee) || 0;
                const walletEffect =
                  transactionForm.type === "deposit"
                    ? amount + fee
                    : amount - fee;

                if (amount <= 0) return null;

                return (
                  <div className="sm:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-sky-700">
                      Xem trước đồng bộ
                    </p>
                    <div className="mt-2 grid gap-1 text-sm text-slate-700">
                      <p>
                        Forex ghi nhận:{" "}
                        <strong>{formatMoney(amount, "VND")}</strong>
                      </p>
                      <p>
                        {transactionForm.type === "deposit"
                          ? "Ví sẽ giảm"
                          : "Ví sẽ tăng"}
                        : <strong>{formatMoney(walletEffect, "VND")}</strong>
                      </p>
                      {fee > 0 ? (
                        <p>
                          Phí: <strong>{formatMoney(fee, "VND")}</strong>
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Ghi chú
                </span>
                <textarea
                  value={transactionForm.notes}
                  onChange={(event) =>
                    setTransactionForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
            </div>
            <FormActions
              isSaving={isSaving}
              saveError={saveError}
              onDismissError={() => setSaveError(null)}
              onCancel={() => setTransactionModalOpen(false)}
            />
          </form>
        </Modal>
      ) : null}

      <ConfirmDialog
        action={pendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-2xl rounded-t-4xl bg-white shadow-2xl sm:rounded-4xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">
              Dữ liệu này chỉ phản ánh dòng tiền vào và ra khỏi Forex.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-slate-400">{label}</p>
      <p className="font-black text-slate-700">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-2 block text-sm font-black text-slate-700">
        {label}
      </span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-sky-400"
      />
    </label>
  );
}

function FormActions({
  isSaving,
  saveError,
  onDismissError,
  onCancel,
}: {
  isSaving: boolean;
  saveError: string | null;
  onDismissError: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <SaveError message={saveError} onDismiss={onDismissError} />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {isSaving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </>
  );
}
