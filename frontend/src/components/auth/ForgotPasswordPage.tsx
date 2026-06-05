"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, PiggyBank } from "lucide-react";
import { resetPassword } from "@/src/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const { error } = await resetPassword(email);

    if (error) {
      setError(
        "Không thể gửi email. Vui lòng kiểm tra địa chỉ email và thử lại.",
      );
      setSubmitting(false);
    } else {
      setSuccess(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-sky-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-xl shadow-blue-200">
            <PiggyBank size={32} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              MyFinance
            </h1>
            <p className="text-sm text-slate-500">Personal Wealth OS</p>
          </div>
        </div>

        {success ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-900">Đã gửi email!</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Chúng tôi đã gửi link đặt lại mật khẩu tới{" "}
              <span className="font-bold text-slate-700">{email}</span>. Vui
              lòng kiểm tra hộp thư (kể cả thư mục spam).
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
            >
              <ArrowLeft size={16} />
              Về trang đăng nhập
            </Link>
          </div>
        ) : (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Quên mật khẩu</h2>
            <p className="mt-1 text-sm text-slate-500">
              Nhập email của bạn để nhận link đặt lại mật khẩu.
            </p>

            {error && (
              <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-600 ring-1 ring-rose-100">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="ban@email.com"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}
              </button>
            </form>

            <Link
              href="/login"
              className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft size={14} />
              Quay lại đăng nhập
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
