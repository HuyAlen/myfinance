"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  CheckCircle2,
  MessageSquareText,
  X,
} from "lucide-react";
import type { SavingAccount } from "@/src/types/finance";
import {
  createSavingInternalTransfer,
  type SavingInternalTransferResult,
} from "@/src/services/finance/financeStorage";

type SavingTransferAccount = SavingAccount & { walletId?: string };

type Props = {
  source: SavingTransferAccount;
  savings: SavingTransferAccount[];
  onClose: () => void;
  onTransferred: (result: SavingInternalTransferResult) => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const formatInput = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
};

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function SavingsInternalTransferModal({
  source,
  savings,
  onClose,
  onTransferred,
}: Props) {
  const destinations = useMemo(
    () => savings.filter((saving) => saving.id !== source.id),
    [savings, source.id],
  );
  const [destinationId, setDestinationId] = useState(destinations[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const destination =
    destinations.find((saving) => saving.id === destinationId) ?? null;
  const numericAmount = Number(amount.replace(/\D/g, "")) || 0;
  const sourceAfter = source.balance - numericAmount;
  const destinationAfter = destination
    ? destination.balance + numericAmount
    : null;

  const setFullBalance = () => {
    setAmount(String(Math.max(0, source.balance)));
    setError("");
  };

  const submit = async () => {
    if (isSubmitting) return;

    if (!destination) {
      setError("Vui lòng chọn khoản tiết kiệm nhận tiền.");
      return;
    }
    if (destination.id === source.id) {
      setError("Khoản nguồn và khoản đích phải khác nhau.");
      return;
    }
    if (numericAmount <= 0) {
      setError("Số tiền chuyển phải lớn hơn 0.");
      return;
    }
    if (numericAmount > source.balance) {
      setError("Số tiền chuyển không được lớn hơn số dư khoản nguồn.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const { data, error: transferError } = await createSavingInternalTransfer({
        sourceSavingId: source.id,
        destinationSavingId: destination.id,
        amount: numericAmount,
        transactionDate: todayKey(),
        sourceTransactionId: crypto.randomUUID(),
        destinationTransactionId: crypto.randomUUID(),
        note: note.trim() || null,
      });

      if (transferError || !data) {
        setError(transferError || "Không thể chuyển giữa các khoản tiết kiệm.");
        return;
      }

      onTransferred(data);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-savings-internal-transfer="true"
      className="fixed inset-x-0 top-0 z-150 h-[var(--savings-visual-viewport-height,100dvh)] overflow-hidden bg-white sm:inset-0 sm:h-auto sm:flex sm:items-center sm:justify-center sm:bg-slate-950/55 sm:p-4 sm:backdrop-blur-[2px]"
    >
      <button
        type="button"
        aria-label="Đóng chuyển tiết kiệm"
        className="absolute inset-0 hidden cursor-default sm:block"
        onClick={isSubmitting ? undefined : onClose}
      />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-4xl sm:shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <div>
            <h2 className="text-[1.15rem] font-black tracking-tight text-slate-900 sm:text-xl">
              Chuyển giữa các khoản
            </h2>
            <p className="mt-0.5 text-[10px] font-medium leading-4 text-slate-400 sm:text-xs">
              Gom tiền mà không đi qua ví và không tạo thu/chi giả.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50 sm:size-9"
            aria-label="Đóng"
          >
            <X size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-500">
              Khoản nguồn
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="truncate text-sm font-black text-slate-900">
                {source.name}
              </p>
              <p className="shrink-0 text-base font-black text-blue-700">
                {formatCurrency(source.balance)}
              </p>
            </div>
          </div>

          <label className="mt-3 block">
            <span className="text-sm font-black text-slate-700">Chuyển đến</span>
            <select
              value={destinationId}
              onChange={(event) => {
                setDestinationId(event.target.value);
                setError("");
              }}
              className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:text-sm"
            >
              {destinations.map((saving) => (
                <option key={saving.id} value={saving.id}>
                  {saving.name} · {formatCurrency(saving.balance)}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-sm font-black text-slate-700">Số tiền</span>
              <button
                type="button"
                onClick={setFullBalance}
                className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-700 transition hover:bg-blue-100"
              >
                Chuyển toàn bộ
              </button>
            </div>
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100">
              <Banknote
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-500"
              />
              <input
                inputMode="numeric"
                value={formatInput(amount)}
                onChange={(event) => {
                  setAmount(event.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                placeholder="Nhập số tiền"
                className="w-full rounded-2xl bg-transparent py-3 pl-11 pr-4 text-xl font-black tracking-tight text-slate-900 outline-none placeholder:text-sm placeholder:font-bold placeholder:text-slate-300"
              />
            </div>
          </div>

          <label className="mt-3 block">
            <span className="text-sm font-black text-slate-700">Ghi chú</span>
            <div className="mt-1.5 flex min-h-11 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
              <MessageSquareText size={16} className="shrink-0 text-blue-500" />
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: Gom quỹ khẩn cấp"
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-700 outline-none placeholder:text-slate-400 sm:text-sm"
              />
            </div>
          </label>

          <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50/70 p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-white text-blue-600">
                <ArrowLeftRight size={16} />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Sau khi chuyển
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  Tổng tiết kiệm không thay đổi
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white p-3">
                <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {source.name}
                </p>
                <p className={`mt-1 text-sm font-black ${sourceAfter < 0 ? "text-rose-600" : "text-slate-900"}`}>
                  {formatCurrency(Math.max(0, sourceAfter))}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-rose-500">
                  −{formatCurrency(numericAmount)}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">
                  {destination?.name ?? "Khoản đích"}
                </p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {destinationAfter === null
                    ? "-"
                    : formatCurrency(destinationAfter)}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-emerald-600">
                  +{formatCurrency(numericAmount)}
                </p>
              </div>
            </div>
          </div>

          {numericAmount > source.balance ? (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">
              Số tiền chuyển vượt quá số dư khoản nguồn.
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-600">
              {error}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 size={13} />
            Không thay đổi số dư ví hoặc tổng tài sản.
          </div>
        </div>

        <div className="relative z-20 grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 bg-white px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:px-6 sm:py-3.5 sm:shadow-none">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={
              isSubmitting ||
              !destination ||
              numericAmount <= 0 ||
              numericAmount > source.balance
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeftRight size={16} />
            {isSubmitting ? "Đang chuyển..." : "Xác nhận chuyển"}
          </button>
        </div>
      </div>
    </div>
  );
}
