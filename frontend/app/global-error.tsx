"use client";

import { useEffect } from "react";

import {
  getSafeErrorReference,
  reportUnexpectedAppError,
  type RecoverableAppError,
} from "@/src/lib/errorRecovery";

type GlobalErrorProps = {
  error: RecoverableAppError;
  reset: () => void;
};

const GLOBAL_ERROR_STYLES = `
  :root {
    color-scheme: light dark;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", sans-serif;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    background: #edf3f8;
    color: #24384b;
  }
  .mf-global-error-shell {
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding:
      max(24px, env(safe-area-inset-top))
      max(16px, env(safe-area-inset-right))
      max(24px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
  }
  .mf-global-error-card {
    width: min(100%, 560px);
    border: 1px solid #dbe7f1;
    border-radius: 28px;
    background: #ffffff;
    padding: 28px;
    box-shadow: 0 18px 55px rgba(54, 83, 107, 0.12);
    text-align: center;
  }
  .mf-global-error-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: #eaf3fc;
    color: #2f80ed;
    font-size: 22px;
    font-weight: 900;
  }
  .mf-global-error-card h1 {
    margin: 16px 0 0;
    font-size: clamp(22px, 5vw, 28px);
    line-height: 1.2;
  }
  .mf-global-error-card p {
    margin: 10px auto 0;
    max-width: 440px;
    color: #61788f;
    font-size: 14px;
    line-height: 1.65;
  }
  .mf-global-error-warning {
    margin-top: 14px !important;
    border: 1px solid #fde7a8;
    border-radius: 16px;
    background: #fff9e8;
    padding: 10px 12px;
    color: #8a5b00 !important;
    text-align: left;
    font-size: 12px !important;
    font-weight: 700;
  }
  .mf-global-error-actions {
    margin-top: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .mf-global-error-actions button {
    min-height: 44px;
    border-radius: 12px;
    padding: 0 14px;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }
  .mf-global-error-primary {
    border: 1px solid #2f80ed;
    background: #2f80ed;
    color: #ffffff;
  }
  .mf-global-error-secondary {
    border: 1px solid #dbe7f1;
    background: #ffffff;
    color: #36536b;
  }
  .mf-global-error-reference {
    margin-top: 14px !important;
    color: #7a8fa2 !important;
    font-size: 12px !important;
  }
  .mf-global-error-reference code {
    font-weight: 800;
    color: #36536b;
  }
  @media (max-width: 520px) {
    .mf-global-error-card {
      padding: 22px 18px;
      border-radius: 24px;
    }
    .mf-global-error-actions {
      grid-template-columns: 1fr;
    }
  }
  @media (prefers-color-scheme: dark) {
    body {
      background: #0f1720;
      color: #e7eef5;
    }
    .mf-global-error-card {
      border-color: #253747;
      background: #16212b;
      box-shadow: none;
    }
    .mf-global-error-card p {
      color: #a8bac8;
    }
    .mf-global-error-secondary {
      border-color: #33485b;
      background: #1c2a36;
      color: #e7eef5;
    }
    .mf-global-error-reference code {
      color: #d9e7f2;
    }
  }
`;

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const reference = getSafeErrorReference(error);

  useEffect(() => {
    reportUnexpectedAppError("GlobalErrorBoundary", error);
  }, [error]);

  return (
    <html lang="vi">
      <head>
        <title>Không thể mở MyFinance</title>
        <meta name="color-scheme" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{GLOBAL_ERROR_STYLES}</style>
      </head>
      <body>
        <main
          className="mf-global-error-shell"
          role="alert"
          aria-live="assertive"
          aria-labelledby="global-error-title"
        >
          <section className="mf-global-error-card">
            <div className="mf-global-error-icon" aria-hidden="true">
              !
            </div>

            <h1 id="global-error-title">MyFinance gặp lỗi khởi động</h1>

            <p>
              Một lỗi ở lớp ứng dụng chung đã ngăn MyFinance hiển thị bình
              thường. Hãy thử khởi tạo lại ứng dụng.
            </p>

            <p className="mf-global-error-warning">
              Nếu lỗi xuất hiện ngay sau thao tác ghi dữ liệu, hãy kiểm tra lại
              trạng thái sau khi ứng dụng mở được trước khi thực hiện thao tác
              đó lần nữa.
            </p>

            <div className="mf-global-error-actions">
              <button
                type="button"
                className="mf-global-error-primary"
                onClick={() => reset()}
              >
                Thử khởi tạo lại
              </button>
              <button
                type="button"
                className="mf-global-error-secondary"
                onClick={() => window.location.reload()}
              >
                Tải lại ứng dụng
              </button>
            </div>

            {reference ? (
              <p className="mf-global-error-reference">
                Mã tham chiếu: <code>{reference}</code>
              </p>
            ) : null}
          </section>
        </main>
      </body>
    </html>
  );
}