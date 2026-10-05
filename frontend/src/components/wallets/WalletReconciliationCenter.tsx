"use client";

import { CheckCircle2, Clock3, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import type { Wallet } from "@/src/types/finance";
import type { WalletReconciliationRecord } from "@/src/services/finance/financeStorage";
import { formatVND } from "@/src/services/finance/financeCalculations";

type SpendableWallet = Wallet & { type: "cash" | "bank" | "ewallet" };

type Props = {
  wallets: SpendableWallet[];
  records: WalletReconciliationRecord[];
  isLoading: boolean;
  error: string | null;
  onReconcile: (wallet: SpendableWallet) => void;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function WalletReconciliationCenter({
  wallets,
  records,
  isLoading,
  error,
  onReconcile,
}: Props) {
  const latestByWallet = new Map<string, WalletReconciliationRecord>();
  for (const record of records) {
    if (!latestByWallet.has(record.walletId)) {
      latestByWallet.set(record.walletId, record);
    }
  }

  const reconciledCount = wallets.filter((wallet) =>
    latestByWallet.has(wallet.id),
  ).length;
  const neverReconciled = wallets.filter(
    (wallet) => !latestByWallet.has(wallet.id),
  );
  const latestRecord = records[0] ?? null;

  return (
    <section
      data-wallet-reconciliation-center="true"
      className="rounded-3xl border border-blue-200 bg-white p-3.5 shadow-sm sm:rounded-4xl sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <ShieldCheck size={18} />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">
                Trung tâm đối soát
              </p>
              <h2 className="mt-0.5 text-base font-black text-slate-900 sm:text-lg">
                Đối soát số dư
              </h2>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500 sm:text-sm">
            So khớp số dư MyFinance với số dư thực tế. Điều chỉnh chỉ cập nhật
            bản ghi số dư và lưu biên nhận đối soát, không tạo Thu/Chi giả.
          </p>
        </div>

        {neverReconciled[0] ? (
          <button
            type="button"
            onClick={() => onReconcile(neverReconciled[0])}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200/60 transition hover:bg-blue-700"
          >
            <RefreshCcw size={15} />
            Đối soát tiếp theo
          </button>
        ) : wallets[0] ? (
          <button
            type="button"
            onClick={() => onReconcile(wallets[0])}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-100"
          >
            <RefreshCcw size={15} />
            Đối soát lại
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center gap-1.5 text-slate-400">
            <WalletCards size={13} />
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide">
              Mức độ đối soát
            </span>
          </div>
          <p className="mt-1.5 text-base font-black tabular-nums text-slate-900 sm:text-xl">
            {wallets.length > 0 ? `${reconciledCount}/${wallets.length}` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500 sm:text-xs">
            ví đã từng đối soát
          </p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
          <div className="flex items-center gap-1.5 text-amber-500">
            <Clock3 size={13} />
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide">
              Chưa đối soát
            </span>
          </div>
          <p className="mt-1.5 text-base font-black tabular-nums text-amber-800 sm:text-xl">
            {wallets.length > 0 ? neverReconciled.length : "—"}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-amber-700/80 sm:text-xs">
            cần xác nhận số dư lần đầu
          </p>
        </div>

        <div className="col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-emerald-500">
            <CheckCircle2 size={13} />
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide">
              Gần nhất
            </span>
          </div>
          <p className="mt-1.5 whitespace-nowrap text-[11px] font-black text-emerald-800 sm:text-sm">
            {latestRecord ? formatDateTime(latestRecord.reconciledAt) : "Chưa có"}
          </p>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-emerald-700/80 sm:text-xs">
            {latestRecord
              ? wallets.find((wallet) => wallet.id === latestRecord.walletId)?.name ??
                "Ví đã đối soát"
              : "chưa có biên nhận"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 h-20 animate-pulse rounded-2xl bg-slate-100" />
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
          {error}
        </div>
      ) : records.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-700">
              Lịch sử đối soát gần đây
            </p>
            <span className="text-[10px] font-bold text-slate-400">
              {records.length} biên nhận
            </span>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {records.slice(0, 5).map((record) => {
              const wallet = wallets.find((item) => item.id === record.walletId);
              return (
                <div
                  key={record.id}
                  className="flex items-center gap-3 bg-white px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-800 sm:text-sm">
                      {wallet?.name ?? "Ví"}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400 sm:text-xs">
                      {formatDateTime(record.reconciledAt)}
                      {record.note ? ` · ${record.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={
                        "text-xs font-black tabular-nums " +
                        (record.difference > 0
                          ? "text-emerald-600"
                          : "text-rose-600")
                      }
                    >
                      {record.difference > 0 ? "+" : "−"}
                      {formatVND(Math.abs(record.difference))}
                    </p>
                    <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                      {formatVND(record.expectedBalance)} →{" "}
                      {formatVND(record.actualBalance)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : wallets.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-xs leading-5 text-slate-600">
          Chưa có biên nhận đối soát. Bắt đầu với ví bạn có thể kiểm tra số dư thực
          tế ngay lúc này.
        </div>
      ) : null}
    </section>
  );
}
