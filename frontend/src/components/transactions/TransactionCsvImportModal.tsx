"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { Category, Wallet } from "@/src/types/finance";
import type { TransactionRule } from "@/src/lib/transactions/transactionRules";
import {
  buildTransactionCsvImportPreviewWithRules,
  materializeTransactionCsvImportRows,
  TRANSACTION_CSV_IMPORT_MAX_ROWS,
  type TransactionCsvImportPreview,
} from "@/src/lib/transactions/transactionCsvImport";
import {
  addTransaction,
  getTransactions,
} from "@/src/services/finance/financeStorage";
import { formatVND } from "@/src/services/finance/financeCalculations";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

type ImportRunResult = {
  importedCount: number;
  duplicateCount: number;
  failures: Array<{ rowNumber: number; error: string }>;
};

export default function TransactionCsvImportModal({
  wallets,
  categories,
  rules,
  onClose,
  onImported,
}: {
  wallets: Wallet[];
  categories: Category[];
  rules: TransactionRule[];
  onClose: () => void;
  onImported: (result: ImportRunResult) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<TransactionCsvImportPreview | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [runResult, setRunResult] = useState<ImportRunResult | null>(null);

  const canImport = Boolean(
    preview &&
      !preview.fatalError &&
      preview.readyCount > 0 &&
      preview.errorCount === 0 &&
      !isReading &&
      !isImporting &&
      !runResult,
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setFileName(file.name);
    setPreview(null);
    setLoadError(null);
    setRunResult(null);
    setProcessedCount(0);

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setLoadError("File CSV vượt quá 2 MB. Hãy chia thành file nhỏ hơn.");
      return;
    }

    setIsReading(true);
    try {
      // Duplicate detection is intentionally all-time, not limited to the
      // currently visible date filter. This makes re-importing an exported
      // file idempotent across month/quarter/year views.
      const [csvText, existingTransactions] = await Promise.all([
        file.text(),
        getTransactions(),
      ]);
      const nextPreview = buildTransactionCsvImportPreviewWithRules({
        csvText,
        wallets,
        categories,
        rules,
        existingTransactions,
      });
      setPreview(nextPreview);
      if (nextPreview.fatalError) setLoadError(nextPreview.fatalError);
    } catch (error) {
      console.error("[TransactionCsvImportModal] file preflight failed:", error);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Không thể đọc hoặc đối chiếu file CSV. Vui lòng thử lại.",
      );
    } finally {
      setIsReading(false);
    }
  }

  async function handleImport() {
    if (!preview || !canImport) return;

    const rows = materializeTransactionCsvImportRows(preview, () =>
      crypto.randomUUID(),
    );
    if (rows.length === 0) return;

    setIsImporting(true);
    setProcessedCount(0);
    const failures: Array<{ rowNumber: number; error: string }> = [];
    let importedCount = 0;

    try {
      // Each row goes through the canonical Finance Engine mutation boundary.
      // A row is atomic with its Wallet effects; if a later row fails, earlier successful rows remain real
      // and are reported explicitly instead of being hidden behind a fake all-or-nothing browser transaction.
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const result = await addTransaction(row.transaction);
        if (result.error) {
          failures.push({ rowNumber: row.rowNumber, error: result.error });
        } else {
          importedCount += 1;
        }
        setProcessedCount(index + 1);
      }

      const result: ImportRunResult = {
        importedCount,
        duplicateCount: preview.duplicateCount,
        failures,
      };
      setRunResult(result);
      if (importedCount > 0) await onImported(result);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-130 flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-csv-import-title"
        aria-describedby="transaction-csv-import-description"
        className="flex h-dvh w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-4xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="flex size-9 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <FileSpreadsheet size={18} />
            </div>
            <h2
              id="transaction-csv-import-title"
              className="mt-3 text-xl font-black tracking-tight text-slate-900"
            >
              Nhập giao dịch từ CSV
            </h2>
            <p
              id="transaction-csv-import-description"
              className="mt-1 max-w-xl text-xs font-medium leading-5 text-slate-500"
            >
              Kiểm tra trước khi ghi. File CSV xuất từ MyFinance có thể nhập lại trực tiếp; tên cột tiếng Anh phổ biến cũng được nhận diện tự động.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            aria-label="Đóng nhập CSV"
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Chọn file CSV"
          />

          <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/40 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800">
                  {fileName || "Chọn file giao dịch"}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Tối đa {TRANSACTION_CSV_IMPORT_MAX_ROWS} dòng/lần, 2 MB. Cột bắt buộc: Ngày, Loại, Danh mục, Ví, Số tiền.
                </p>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isReading || isImporting}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isReading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {isReading ? "Đang kiểm tra..." : "Chọn CSV"}
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">
            <strong className="text-slate-800">Quy tắc an toàn:</strong> Thu/Chi cần khớp Danh mục và Ví hiện có. Chuyển tiền dùng “Ví A -&gt; Ví B” hoặc cột Ví nhận. Dòng trùng hoàn toàn với lịch sử sẽ tự bỏ qua. Import dùng cùng Finance Engine với thao tác thêm thủ công nên ảnh hưởng số dư Ví tương ứng.
          </div>

          {loadError ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{loadError}</span>
            </div>
          ) : null}

          {preview && !preview.fatalError ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatusCard label="Sẵn sàng" value={preview.readyCount} tone="ready" />
                <StatusCard label="Theo rule" value={preview.ruleAppliedCount ?? 0} tone="rule" />
                <StatusCard label="Trùng" value={preview.duplicateCount} tone="duplicate" />
                <StatusCard label="Lỗi" value={preview.errorCount} tone="error" />
              </div>

              {preview.errorCount > 0 ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                  Hãy sửa tất cả dòng lỗi rồi chọn lại CSV. MyFinance không âm thầm bỏ qua dữ liệu không hợp lệ.
                </div>
              ) : null}

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <p className="text-xs font-black text-slate-700">Xem trước</p>
                  <p className="text-[10px] font-bold text-slate-400">
                    {preview.rows.length > 20
                      ? `20/${preview.rows.length} dòng đầu`
                      : `${preview.rows.length} dòng`}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[760px] w-full text-left text-xs">
                    <thead className="bg-white text-[10px] font-black uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Dòng</th>
                        <th className="px-3 py-2">Trạng thái</th>
                        <th className="px-3 py-2">Ngày</th>
                        <th className="px-3 py-2">Loại</th>
                        <th className="px-3 py-2">Số tiền</th>
                        <th className="px-3 py-2">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {preview.rows.slice(0, 20).map((row) => (
                        <tr key={`${row.rowNumber}-${row.fingerprint ?? "error"}`}>
                          <td className="px-3 py-2 font-black text-slate-500">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-2">
                            <RowStatus status={row.status} />
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-700">
                            {row.draft?.date ?? "—"}
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-700">
                            {row.draft?.type === "income"
                              ? "Thu"
                              : row.draft?.type === "expense"
                                ? "Chi"
                                : row.draft?.type === "transfer"
                                  ? "Chuyển"
                                  : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-black tabular-nums text-slate-800">
                            {row.draft ? formatVND(row.draft.amount) : "—"}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-slate-500">
                            {row.errors.length > 0
                              ? row.errors.join(" · ")
                              : row.status === "duplicate"
                                ? "Đã có trong lịch sử hoặc trùng trong file"
                                : row.appliedRuleName
                                  ? `Quy tắc: ${row.appliedRuleName}${row.draft?.note ? ` · ${row.draft.note}` : ""}`
                                  : row.draft?.note || "Sẵn sàng nhập"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}

          {isImporting && preview ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center justify-between gap-3 text-xs font-black text-blue-700">
                <span>Đang nhập giao dịch...</span>
                <span>
                  {processedCount}/{preview.readyCount}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width:
                      preview.readyCount > 0
                        ? `${Math.round((processedCount / preview.readyCount) * 100)}%`
                        : "0%",
                  }}
                />
              </div>
            </div>
          ) : null}

          {runResult ? (
            <div
              className={
                "mt-4 rounded-2xl border p-4 " +
                (runResult.failures.length === 0
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50")
              }
            >
              <div className="flex items-start gap-3">
                {runResult.failures.length === 0 ? (
                  <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle size={19} className="mt-0.5 shrink-0 text-amber-600" />
                )}
                <div>
                  <p className="text-sm font-black text-slate-800">
                    Đã nhập {runResult.importedCount} giao dịch
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Bỏ qua {runResult.duplicateCount} dòng trùng. {runResult.failures.length > 0 ? `${runResult.failures.length} dòng không thể ghi.` : "Không có lỗi ghi dữ liệu."}
                  </p>
                  {runResult.failures.length > 0 ? (
                    <div className="mt-2 space-y-1 text-[11px] font-bold text-amber-800">
                      {runResult.failures.slice(0, 8).map((failure) => (
                        <p key={`${failure.rowNumber}-${failure.error}`}>
                          Dòng {failure.rowNumber}: {failure.error}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {runResult ? "Đóng" : "Hủy"}
            </button>
            {!runResult ? (
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={!canImport}
                className="min-h-11 flex-1 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImporting
                  ? `Đang nhập ${processedCount}/${preview?.readyCount ?? 0}`
                  : preview?.readyCount
                    ? `Nhập ${preview.readyCount} giao dịch`
                    : "Kiểm tra CSV trước"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ready" | "rule" | "duplicate" | "error";
}) {
  const styles = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rule: "border-violet-200 bg-violet-50 text-violet-700",
    duplicate: "border-slate-200 bg-slate-50 text-slate-600",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <div className={`rounded-2xl border p-3 text-center ${styles[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function RowStatus({ status }: { status: "ready" | "duplicate" | "error" }) {
  const labels = {
    ready: "Sẵn sàng",
    duplicate: "Trùng",
    error: "Lỗi",
  };
  const styles = {
    ready: "bg-emerald-50 text-emerald-700",
    duplicate: "bg-slate-100 text-slate-600",
    error: "bg-rose-50 text-rose-700",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
