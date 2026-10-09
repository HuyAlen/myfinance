"use client";

import { useState } from "react";
import {
  CheckCircle2, Clock3, RefreshCcw, ShieldCheck,
  AlertCircle,
} from "lucide-react";
import type { Wallet } from "@/src/types/finance";
import type { WalletReconciliationRecord } from "@/src/services/finance/financeStorage";
import { formatVND } from "@/src/services/finance/financeCalculations";
import {
  getWalletReconciliationStatus,
  walletReconciliationStatusLabels,
  type WalletReconciliationStatus,
} from "@/src/lib/walletReconciliationStatus";

type SpendableWallet = Wallet & { type: "cash" | "bank" | "ewallet" };

type Props = {
  wallets: SpendableWallet[];
  records: WalletReconciliationRecord[];
  isLoading: boolean;
  error: string | null;
  historyRecords: WalletReconciliationRecord[];
  isHistoryLoading: boolean;
  historyError: string | null;
  onReconcile: (wallet: SpendableWallet) => void;
};

type StatusFilter = "all" | WalletReconciliationStatus;
const statusFilters: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "never", label: "Chưa đối soát" },
  { value: "needs_review", label: "Cần kiểm tra lại" },
  { value: "reconciled", label: "Đã đối soát" },
];

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

function getStatusClass(status: WalletReconciliationStatus) {
  switch (status) {
    case "never": return "border-amber-200 bg-amber-50 text-amber-800";
    case "needs_review": return "border-orange-200 bg-orange-50 text-orange-800";
    case "reconciled": return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export default function WalletReconciliationCenter({
  wallets,
  records,
  isLoading,
  error,
  historyRecords,
  isHistoryLoading,
  historyError,
  onReconcile,
}: Props) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const reconciliationDataReady = !isLoading && !error;
  const latestByWallet = new Map<string, WalletReconciliationRecord>();
  for (const record of records) {
    const current = latestByWallet.get(record.walletId);
    if (
      !current ||
      new Date(record.reconciledAt).getTime() >
        new Date(current.reconciledAt).getTime()
    ) {
      latestByWallet.set(record.walletId, record);
    }
  }

  const walletRows = wallets.map((wallet) => {
    const receipt = latestByWallet.get(wallet.id);
    return {
      wallet,
      receipt,
      status: getWalletReconciliationStatus(wallet, receipt),
    };
  });
  const reconciledCount = walletRows.filter((row) => row.status === "reconciled").length;
  const neverReconciled = walletRows.filter((row) => row.status === "never");
  const needsReview = walletRows.filter((row) => row.status === "needs_review");
  const oldestReconciledWallet = walletRows
    .filter((row) => row.status === "reconciled")
    .sort((a, b) =>
      new Date(a.receipt?.reconciledAt ?? 0).getTime() -
      new Date(b.receipt?.reconciledAt ?? 0).getTime(),
    )[0]?.wallet;
  const reconciliationPriorityWallet =
    neverReconciled[0]?.wallet ?? needsReview[0]?.wallet ?? oldestReconciledWallet;
  const latestRecord = records.reduce<WalletReconciliationRecord | null>(
    (latest, record) => {
      if (!latest) return record;
      return new Date(record.reconciledAt).getTime() >
        new Date(latest.reconciledAt).getTime()
        ? record
        : latest;
    },
    null,
  );
  const visibleRows = walletRows.filter((row) => filter === "all" || row.status === filter);
  const orderedRows = [...visibleRows].sort((a, b) => {
    const order: Record<WalletReconciliationStatus, number> = {
      never: 0, needs_review: 1, reconciled: 2,
    };
    return order[a.status] - order[b.status] || a.wallet.name.localeCompare(b.wallet.name, "vi");
  });

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
          <p className="mt-2 hidden max-w-2xl text-xs leading-5 text-slate-500 sm:block sm:text-sm">
            Mức độ đối soát giúp theo dõi từng ví theo bản ghi số dư và biên nhận gần nhất.
            Số dư khớp vẫn được xác nhận, không tạo Thu/Chi hay điều chỉnh số dư.
          </p>
        </div>

        {reconciliationDataReady && reconciliationPriorityWallet ? (
          <button
            type="button"
            onClick={() => onReconcile(reconciliationPriorityWallet)}
            className={
              neverReconciled.length > 0 || needsReview.length > 0
                ? "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200/60 transition hover:bg-blue-700"
                : "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-100"
            }
          >
            <RefreshCcw size={15} />
            {neverReconciled.length > 0
              ? "Đối soát tiếp theo"
              : needsReview.length > 0
                ? "Kiểm tra lại"
                : "Đối soát lâu nhất"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 size={13} />
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide">Đã đối soát</span>
          </div>
          <p className="mt-1.5 text-base font-black tabular-nums text-emerald-800 sm:text-xl">
            {reconciliationDataReady && wallets.length > 0 ? `${reconciledCount}/${wallets.length}` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-emerald-700/80 sm:text-xs">
            chưa có biến động số dư tiếp theo
          </p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
          <div className="flex items-center gap-1.5 text-amber-600">
            <Clock3 size={13} />
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide">Chưa đối soát</span>
          </div>
          <p className="mt-1.5 text-base font-black tabular-nums text-amber-800 sm:text-xl">
            {reconciliationDataReady && wallets.length > 0 ? neverReconciled.length : "—"}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-amber-700/80 sm:text-xs">
            chưa có biên nhận lần đầu
          </p>
        </div>
        <div className="col-span-2 rounded-2xl border border-orange-100 bg-orange-50/70 p-3 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-orange-600">
            <AlertCircle size={13} />
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-wide">Cần kiểm tra lại</span>
          </div>
          <p className="mt-1.5 text-base font-black tabular-nums text-orange-800 sm:text-xl">
            {reconciliationDataReady && wallets.length > 0 ? needsReview.length : "—"}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-orange-700/80 sm:text-xs">
            có biến động hoặc biên nhận cũ
          </p>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-700">
          Không thể xác định trạng thái đối soát. {error}
        </div>
      ) : isLoading ? (
        <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-100" />
      ) : wallets.length > 0 ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-slate-800">Trạng thái từng ví</h3>
            <span className="text-[10px] font-semibold text-slate-500">
              Gần nhất: {latestRecord ? formatDateTime(latestRecord.reconciledAt) : "chưa có biên nhận"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Lọc trạng thái đối soát">
            {statusFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={
                  "min-h-10 rounded-xl border px-2.5 py-2 text-[11px] font-bold transition sm:text-xs " +
                  (filter === item.value
                    ? "border-blue-300 bg-blue-100 text-blue-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200">
            {orderedRows.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs font-medium text-slate-500">
                Không có ví trong trạng thái này.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {orderedRows.map(({ wallet, receipt, status }) => (
                  <div key={wallet.id} data-reconciliation-wallet-id={wallet.id}
                       className="flex min-w-0 items-center justify-between gap-2 px-3 py-3 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-slate-800 sm:text-sm">{wallet.name}</p>
                      <span className={"mt-1 inline-flex max-w-full rounded-full border px-2 py-0.5 text-[10px] font-bold " + getStatusClass(status)}>
                        {walletReconciliationStatusLabels[status]}
                      </span>
                      <p className="mt-1 text-[10px] leading-4 text-slate-500 sm:text-xs">
                        {!receipt
                          ? "Chưa xác nhận số dư lần đầu"
                          : receipt.balanceRevision == null
                            ? `Biên nhận cũ ${formatDateTime(receipt.reconciledAt)} · cần xác nhận lại`
                            : status === "needs_review"
                              ? `Số dư đã biến động sau ${formatDateTime(receipt.reconciledAt)}`
                              : `Đã xác nhận ${formatDateTime(receipt.reconciledAt)}${receipt.difference === 0 ? " · số dư khớp" : ""}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onReconcile(wallet)}
                      aria-label={`Đối soát số dư ${wallet.name}`}
                      className="min-h-11 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700 hover:bg-blue-100 sm:text-xs"
                    >
                      {status === "reconciled" ? "Đối soát lại" : "Kiểm tra"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">
            “Cần kiểm tra lại” không có nghĩa là số dư đang sai. Hệ thống chỉ phát hiện
            biến động số dư MyFinance hoặc biên nhận cũ chưa có phiên bản xác nhận.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">
          Chưa có ví để đối soát.
        </div>
      )}

      {isHistoryLoading ? (
        <div className="mt-4 h-20 animate-pulse rounded-2xl bg-slate-100" />
      ) : historyError ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
          {historyError}
        </div>
      ) : historyRecords.length > 0 ? (
        <div className="mt-4 hidden sm:block">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-black text-slate-700">Lịch sử đối soát gần đây</p>
            <span className="text-[10px] font-bold text-slate-400">
              {historyRecords.length} biên nhận
            </span>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {historyRecords.slice(0, 5).map((record) => {
              const wallet = wallets.find((item) => item.id === record.walletId);
              return (
                <div key={record.id} className="flex items-center gap-3 bg-white px-3 py-2.5">
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
                    {record.difference === 0 ? (
                      <p className="text-xs font-black text-emerald-600">Số dư khớp</p>
                    ) : (
                      <p className={"text-xs font-black tabular-nums " +
                        (record.difference > 0 ? "text-emerald-600" : "text-rose-600")}
                      >
                        {record.difference > 0 ? "+" : "−"}
                        {formatVND(Math.abs(record.difference))}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                      {formatVND(record.expectedBalance)} → {formatVND(record.actualBalance)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : wallets.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-xs leading-5 text-slate-600">
          Chưa có biên nhận đối soát. Bắt đầu với ví bạn có thể kiểm tra số dư thực tế ngay lúc này.
        </div>
      ) : null}
    </section>
  );
}
