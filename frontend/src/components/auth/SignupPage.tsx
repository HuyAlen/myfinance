"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Eye, EyeOff, PiggyBank } from "lucide-react";
import { signUp } from "@/src/lib/auth";
import { useAuth } from "@/src/components/auth/AuthProvider";

export default function SignupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }

    setSubmitting(true);

    const { error } = await signUp(email, password);

    if (error) {
      setError(error.message);
      setSubmitting(false);
    } else {
      setSuccess(true);
    }
  }

  if (loading) return null;

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

        {/* Success state */}
        {success ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-900">
              Đăng ký thành công!
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Chúng tôi đã gửi email xác nhận tới{" "}
              <span className="font-bold text-slate-700">{email}</span>. Vui
              lòng kiểm tra hộp thư và xác nhận tài khoản trước khi đăng nhập.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100"
            >
              Về trang đăng nhập
            </Link>
          </div>
        ) : (
          /* Card */
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-900">Tạo tài khoản</h2>
            <p className="mt-1 text-sm text-slate-500">
              Miễn phí, không cần thẻ tín dụng.
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

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Ít nhất 6 ký tự"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Xác nhận mật khẩu
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Nhập lại mật khẩu"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Đã có tài khoản?{" "}
              <Link
                href="/login"
                className="font-bold text-blue-600 hover:underline"
              >
                Đăng nhập
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
