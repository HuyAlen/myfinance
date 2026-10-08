"use client";

type AuthBootstrapRecoveryProps = {
  onRetry: () => void;
};

export default function AuthBootstrapRecovery({
  onRetry,
}: AuthBootstrapRecoveryProps) {
  return (
    <main className="flex min-h-(--app-height) items-center justify-center bg-[var(--finance-page)] px-4 py-8 sm:px-6">
      <section
        role="alert"
        aria-live="assertive"
        aria-labelledby="auth-recovery-title"
        className="w-full max-w-lg rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-[0_12px_40px_rgba(54,83,107,0.10)] sm:p-7"
      >
        <div
          aria-hidden="true"
          className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-xl font-black text-blue-600"
        >
          !
        </div>

        <h1
          id="auth-recovery-title"
          className="mt-4 text-xl font-black tracking-tight text-slate-900 sm:text-2xl"
        >
          Không thể kiểm tra phiên đăng nhập
        </h1>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
          MyFinance chưa xác nhận được trạng thái phiên nên sẽ không tự chuyển
          bạn sang trang đăng nhập. Hãy kiểm tra kết nối và thử lại.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Thử kiểm tra lại
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Tải lại ứng dụng
          </button>
        </div>
      </section>
    </main>
  );
}