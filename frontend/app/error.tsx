"use client";

import { useEffect } from "react";

import {
  getSafeErrorReference,
  reportUnexpectedAppError,
  type RecoverableAppError,
} from "@/src/lib/errorRecovery";

type AppErrorProps = {
  error: RecoverableAppError;
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  const reference = getSafeErrorReference(error);

  useEffect(() => {
    reportUnexpectedAppError("AppErrorBoundary", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-10 sm:px-6">
      <section
        role="alert"
        aria-live="assertive"
        aria-labelledby="app-error-title"
        className="w-full max-w-xl rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-[0_12px_40px_rgba(54,83,107,0.10)] sm:p-7"
      >
        <div
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl font-black text-blue-600"
        >
          !
        </div>

        <h1
          id="app-error-title"
          className="mt-4 text-xl font-black tracking-tight text-slate-900 sm:text-2xl"
        >
          Không thể hiển thị màn hình
        </h1>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          Đã xảy ra lỗi không mong đợi. Bạn có thể thử render lại màn hình hoặc
          tải lại ứng dụng nếu lỗi vẫn tiếp diễn.
        </p>

        <p className="mx-auto mt-3 max-w-md rounded-2xl bg-amber-50 px-3 py-2.5 text-left text-xs font-semibold leading-5 text-amber-800 ring-1 ring-amber-100">
          Nếu lỗi xuất hiện ngay sau thao tác thêm, sửa hoặc xóa dữ liệu, hãy
          kiểm tra trạng thái hiện tại trước khi thực hiện lại để tránh lặp thao
          tác.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => reset()}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Thử lại màn hình
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Tải lại ứng dụng
          </button>
        </div>

        {reference ? (
          <p className="mt-4 text-xs text-slate-500">
            Mã tham chiếu:{" "}
            <code className="font-mono font-bold text-slate-700">
              {reference}
            </code>
          </p>
        ) : null}
      </section>
    </main>
  );
}