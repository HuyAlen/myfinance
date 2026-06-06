"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useOnboarding } from "./OnboardingProvider";

// ─── Tour Step Definitions ────────────────────────────────────────────────────
type TourStep = {
  id: string;
  title: string;
  desc: string;
  targetSelector?: string; // CSS selector for the element to highlight
  position: "center" | "right" | "left" | "bottom";
  accentColor: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Chào mừng đến MyFinance!",
    desc: "Hãy để chúng tôi hướng dẫn bạn khám phá các tính năng chính. Chỉ mất 1 phút!",
    position: "center",
    accentColor: "blue",
  },
  {
    id: "sidebar",
    title: "Menu điều hướng",
    desc: "Thanh bên trái chứa tất cả tính năng: Giao Dịch, Ví Tiền, Ngân Sách, Mục Tiêu, Đầu Tư và AI Advisor.",
    targetSelector: "[data-tour='sidebar']",
    position: "right",
    accentColor: "blue",
  },
  {
    id: "dashboard",
    title: "Dashboard · Tổng quan",
    desc: "Trang chủ hiển thị Financial Health Score, Net Worth, dòng tiền và tất cả tóm tắt tài chính trong một màn hình.",
    targetSelector: "[data-tour='dashboard']",
    position: "bottom",
    accentColor: "blue",
  },
  {
    id: "transactions",
    title: "Giao Dịch",
    desc: "Ghi chép mỗi khoản thu và chi. Số dư ví tự động cập nhật. Dữ liệu ở đây là nền tảng cho tất cả phân tích AI.",
    position: "center",
    accentColor: "emerald",
  },
  {
    id: "budgets",
    title: "Ngân Sách",
    desc: "Đặt hạn mức chi tiêu theo danh mục mỗi tháng. Nhận cảnh báo tự động khi sắp vượt giới hạn.",
    position: "center",
    accentColor: "violet",
  },
  {
    id: "goals",
    title: "Mục Tiêu",
    desc: "Thiết lập mục tiêu tiết kiệm có kỳ hạn. AI tính số tiền cần tiết kiệm mỗi tháng và dự báo ngày đạt mục tiêu.",
    position: "center",
    accentColor: "rose",
  },
  {
    id: "ai",
    title: "AI Advisor · Tư vấn thông minh",
    desc: "Nhận phân tích và tư vấn tài chính cá nhân hoá từ AI dựa trên dữ liệu thực của bạn. Kiểm tra hàng tuần!",
    position: "center",
    accentColor: "fuchsia",
  },
  {
    id: "done",
    title: "Bạn đã sẵn sàng!",
    desc: "Tất cả tính năng đã được giới thiệu. Bắt đầu bằng cách tạo ví tiền đầu tiên và ghi lại giao dịch đầu tiên của bạn.",
    position: "center",
    accentColor: "emerald",
  },
];

const ACCENT_CLASSES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  blue:    { bg: "bg-blue-600",    text: "text-blue-700",    border: "border-blue-400",    dot: "bg-blue-500" },
  emerald: { bg: "bg-emerald-600", text: "text-emerald-700", border: "border-emerald-400", dot: "bg-emerald-500" },
  violet:  { bg: "bg-violet-600",  text: "text-violet-700",  border: "border-violet-400",  dot: "bg-violet-500" },
  rose:    { bg: "bg-rose-500",    text: "text-rose-700",    border: "border-rose-400",    dot: "bg-rose-500" },
  fuchsia: { bg: "bg-fuchsia-600", text: "text-fuchsia-700", border: "border-fuchsia-400", dot: "bg-fuchsia-500" },
};

// ─── ProductTour ──────────────────────────────────────────────────────────────
export default function ProductTour() {
  const { wizardDone, tourDone, completeTour } = useOnboarding();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  // Show tour only after wizard is done and tour not yet done
  useEffect(() => {
    if (wizardDone && !tourDone) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [wizardDone, tourDone]);

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const accent = ACCENT_CLASSES[current.accentColor] ?? ACCENT_CLASSES.blue;
  const isLast = step === TOUR_STEPS.length - 1;
  const isFirst = step === 0;

  function handleNext() {
    if (isLast) {
      completeTour();
      setVisible(false);
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  function handleSkip() {
    completeTour();
    setVisible(false);
  }

  // All steps use center overlay (full-page modal style for simplicity and reliability)
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[150] bg-slate-950/60 backdrop-blur-[2px]" />

      {/* Tour Card — centered */}
      <div className="fixed inset-0 z-[151] flex items-center justify-center p-4">
        <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-slate-900/40">
          {/* Skip */}
          <button
            onClick={handleSkip}
            className="absolute right-4 top-4 z-10 flex size-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
            aria-label="Bỏ qua tour"
          >
            <X size={15} />
          </button>

          {/* Accent top bar */}
          <div className={["h-1.5 w-full", accent.bg].join(" ")} />

          <div className="px-7 py-6 pt-5">
            {/* Step counter */}
            <p className={["mb-1 text-[11px] font-black uppercase tracking-widest", accent.text].join(" ")}>
              {step + 1} / {TOUR_STEPS.length}
            </p>

            <h3 className="text-xl font-black text-slate-900">{current.title}</h3>
            <p className="mt-2.5 text-sm leading-6 text-slate-600">{current.desc}</p>

            {/* Progress bar */}
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={["h-full rounded-full transition-all duration-500", accent.bg].join(" ")}
                style={{ width: ((step + 1) / TOUR_STEPS.length * 100) + "%" }}
              />
            </div>

            {/* Navigation */}
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-xs font-bold text-slate-400 transition-colors hover:text-slate-600"
              >
                Bỏ qua tour
              </button>

              <div className="flex items-center gap-2">
                {!isFirst && (
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
                  >
                    <ArrowLeft size={13} />
                    Quay lại
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className={[
                    "flex items-center gap-1.5 rounded-2xl px-5 py-2 text-sm font-bold text-white shadow-md transition-all hover:opacity-90 active:scale-95",
                    accent.bg,
                  ].join(" ")}
                >
                  {isLast ? "Hoàn thành!" : "Tiếp theo"}
                  {!isLast && <ArrowRight size={13} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
