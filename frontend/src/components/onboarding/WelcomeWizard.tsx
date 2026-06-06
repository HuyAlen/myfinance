"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  ChartPie,
  CheckCircle2,
  PiggyBank,
  ReceiptText,
  Rocket,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { useOnboarding } from "./OnboardingProvider";
import { initFinanceDemoData } from "@/src/services/finance/financeStorage";

// ─── Wizard Steps Data ────────────────────────────────────────────────────────
type WizardStep = {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  icon: React.ComponentType<{
    size?: number;
    strokeWidth?: number;
    className?: string;
  }>;
  iconBg: string;
  actions?: { label: string; href: string; primary?: boolean }[];
  tip?: string;
  isDemoStep?: boolean;
};

const STEPS: WizardStep[] = [
  {
    id: "welcome",
    title: "Chào mừng đến với MyFinance!",
    subtitle: "Your Personal CFO",
    desc: "Ứng dụng quản lý tài chính thông minh giúp bạn theo dõi thu chi, quản lý ngân sách, đặt mục tiêu và nhận tư vấn AI cá nhân hoá.",
    icon: PiggyBank,
    iconBg: "bg-gradient-to-br from-blue-600 to-cyan-500",
    tip: "Chỉ cần 5 phút thiết lập là bạn có thể bắt đầu theo dõi tài chính ngay hôm nay.",
  },
  {
    id: "demo",
    title: "Khởi động nhanh với dữ liệu mẫu",
    subtitle: "Bước 1 / 5",
    desc: "Bạn muốn khám phá ứng dụng ngay với dữ liệu mẫu, hay bắt đầu với dữ liệu thực của mình?",
    icon: Rocket,
    iconBg: "bg-gradient-to-br from-emerald-500 to-teal-500",
    isDemoStep: true,
    tip: "Dữ liệu mẫu giúp bạn hiểu cách hoạt động của app mà không cần nhập thủ công.",
  },
  {
    id: "wallet",
    title: "Tạo ví tiền đầu tiên",
    subtitle: "Bước 2 / 5",
    desc: "Ví tiền là nền tảng của MyFinance. Tạo các tài khoản ngân hàng, ví điện tử hoặc tiền mặt để theo dõi số dư tự động theo giao dịch.",
    icon: Wallet,
    iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",
    actions: [{ label: "Tạo ví ngay", href: "/wallets", primary: true }],
    tip: "Tạo ví cho từng tài khoản thực tế: MB Bank, Tiền mặt, MoMo...",
  },
  {
    id: "transaction",
    title: "Ghi lại giao dịch đầu tiên",
    subtitle: "Bước 3 / 5",
    desc: "Ghi chép mỗi khoản thu nhập và chi tiêu. Số dư ví tự động cập nhật và AI phân tích xu hướng dựa trên dữ liệu này.",
    icon: ReceiptText,
    iconBg: "bg-gradient-to-br from-cyan-500 to-blue-500",
    actions: [
      { label: "Thêm giao dịch", href: "/transactions", primary: true },
    ],
    tip: "Ghi ngay sau khi giao dịch để không bỏ sót khoản nào.",
  },
  {
    id: "budget",
    title: "Thiết lập ngân sách",
    subtitle: "Bước 4 / 5",
    desc: "Đặt hạn mức chi tiêu theo danh mục mỗi tháng. App cảnh báo tự động khi bạn gần đạt giới hạn, giúp kiểm soát tài chính hiệu quả.",
    icon: ChartPie,
    iconBg: "bg-gradient-to-br from-violet-500 to-purple-600",
    actions: [{ label: "Tạo ngân sách", href: "/budgets", primary: true }],
    tip: "Bắt đầu với 3 danh mục chi lớn nhất: Ăn uống, Đi lại, Giải trí.",
  },
  {
    id: "goal",
    title: "Đặt mục tiêu tài chính",
    subtitle: "Bước 5 / 5",
    desc: "Thiết lập mục tiêu tiết kiệm có deadline. AI tự động tính số tiền cần tiết kiệm mỗi tháng và dự báo ngày đạt được mục tiêu.",
    icon: Target,
    iconBg: "bg-gradient-to-br from-rose-500 to-pink-600",
    actions: [{ label: "Tạo mục tiêu", href: "/goals", primary: true }],
    tip: "Mục tiêu đầu tiên nên là Quỹ khẩn cấp: 3 tháng chi tiêu sinh hoạt.",
  },
  {
    id: "explore",
    title: "Khám phá Dashboard!",
    subtitle: "Hoàn thành thiết lập",
    desc: "Bạn đã sẵn sàng! Trang tổng quan cho thấy toàn bộ tình hình tài chính trong một màn hình. Kiểm tra Health Score và AI Insights mỗi ngày.",
    icon: BarChart3,
    iconBg: "bg-gradient-to-br from-emerald-500 to-cyan-500",
    actions: [
      { label: "Xem Dashboard", href: "/", primary: true },
      { label: "AI Insights", href: "/ai-insights" },
    ],
    tip: "Kiểm tra Dashboard mỗi sáng chỉ 1 phút để nắm bắt tình hình tài chính.",
  },
];

// ─── Progress Dots ────────────────────────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            "rounded-full transition-all duration-300",
            i === current
              ? "w-5 h-2 bg-blue-600"
              : i < current
                ? "size-2 bg-blue-300"
                : "size-2 bg-slate-200",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// ─── WelcomeWizard ────────────────────────────────────────────────────────────
export default function WelcomeWizard() {
  const { wizardDone, completeWizard, completeChecklistItem } = useOnboarding();
  const [step, setStep] = useState(0);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoLoaded, setDemoLoaded] = useState(false);

  if (wizardDone) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  async function loadDemoData() {
    setDemoLoading(true);
    try {
      await initFinanceDemoData();
      setDemoLoaded(true);
      completeChecklistItem("wallet");
      completeChecklistItem("transaction");
    } finally {
      setDemoLoading(false);
    }
  }

  function handleNext() {
    if (isLast) {
      completeWizard();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function handleSkip() {
    completeWizard();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-900/40">
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
          aria-label="Bỏ qua onboarding"
        >
          <X size={15} />
        </button>

        {/* Icon Hero */}
        <div
          className={[
            "flex items-center justify-center py-10",
            current.iconBg,
          ].join(" ")}
        >
          <div className="flex size-24 items-center justify-center rounded-[2rem] bg-white/20 shadow-xl shadow-black/10">
            <Icon size={44} strokeWidth={1.75} className="text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="px-7 py-6">
          {current.subtitle && (
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">
              {current.subtitle}
            </p>
          )}
          <h2 className="mt-1 text-2xl font-black leading-snug text-slate-900">
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {current.desc}
          </p>

          {/* Demo step special UI */}
          {current.isDemoStep && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={loadDemoData}
                disabled={demoLoading || demoLoaded}
                className={[
                  "flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all",
                  demoLoaded
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-blue-200 bg-blue-50 hover:border-blue-400 hover:shadow-md",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  {demoLoaded ? (
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  ) : (
                    <Rocket size={18} className="text-blue-600" />
                  )}
                  <p
                    className={[
                      "text-sm font-black",
                      demoLoaded ? "text-emerald-700" : "text-blue-700",
                    ].join(" ")}
                  >
                    {demoLoaded
                      ? "Đã tải dữ liệu mẫu!"
                      : demoLoading
                        ? "Đang tải..."
                        : "Dùng dữ liệu mẫu"}
                  </p>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Khám phá ngay với wallets, transactions và goals mẫu được tạo
                  sẵn.
                </p>
              </button>

              <button
                onClick={handleNext}
                className="flex flex-col items-start gap-2 rounded-2xl border-2 border-slate-200 p-4 text-left transition-all hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-center gap-2">
                  <PiggyBank size={18} className="text-slate-600" />
                  <p className="text-sm font-black text-slate-700">
                    Bắt đầu từ đầu
                  </p>
                </div>
                <p className="text-xs leading-5 text-slate-500">
                  Tự nhập dữ liệu thực của bạn từng bước một.
                </p>
              </button>
            </div>
          )}

          {/* Action links */}
          {current.actions && (
            <div className="mt-4 flex flex-wrap gap-2">
              {current.actions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={a.primary ? completeWizard : undefined}
                  className={[
                    "flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95",
                    a.primary
                      ? "bg-blue-600 text-white shadow-md shadow-blue-200/60 hover:bg-blue-700"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {a.label}
                  {a.primary && <ArrowRight size={13} />}
                </Link>
              ))}
            </div>
          )}

          {/* Tip */}
          {current.tip && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-amber-600">
                Mẹo
              </p>
              <p className="mt-0.5 text-xs leading-5 text-amber-800">
                {current.tip}
              </p>
            </div>
          )}
        </div>

        {/* Footer: progress + navigation */}
        <div className="flex items-center justify-between border-t border-slate-100 px-7 py-4">
          <ProgressDots total={STEPS.length} current={step} />

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
              >
                <ArrowLeft size={14} />
                Quay lại
              </button>
            )}
            {!current.isDemoStep && (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 rounded-2xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-blue-200/60 transition-all hover:bg-blue-700 active:scale-95"
              >
                {isLast ? "Bắt đầu!" : "Tiếp theo"}
                {!isLast && <ArrowRight size={14} />}
              </button>
            )}
            {current.isDemoStep && demoLoaded && (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 rounded-2xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-200/60 transition-all hover:bg-emerald-700 active:scale-95"
              >
                Tiếp theo
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
