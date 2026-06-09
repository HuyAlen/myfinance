"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { useAuth } from "@/src/components/auth/AuthProvider";
import WelcomeWizard from "@/src/components/onboarding/WelcomeWizard";
import ProductTour from "@/src/components/onboarding/ProductTour";
import OnboardingChecklist from "@/src/components/onboarding/OnboardingChecklist";
import QuickActionFab from "@/src/components/onboarding/QuickActionFab";
import { AchievementToast } from "@/src/components/onboarding/AchievementToast";

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Keep real viewport height in sync for iPhone Safari/Chrome.
  // 100vh/100dvh can be unstable when the address bar appears/disappears,
  // so modal bottom sheets should use --app-height instead.
  useEffect(() => {
    const updateAppHeight = () => {
      const height =
        window.visualViewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight;

      document.documentElement.style.setProperty("--app-height", `${height}px`);
    };

    updateAppHeight();

    window.visualViewport?.addEventListener("resize", updateAppHeight);
    window.visualViewport?.addEventListener("scroll", updateAppHeight);
    window.addEventListener("resize", updateAppHeight);
    window.addEventListener("orientationchange", updateAppHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateAppHeight);
      window.visualViewport?.removeEventListener("scroll", updateAppHeight);
      window.removeEventListener("resize", updateAppHeight);
      window.removeEventListener("orientationchange", updateAppHeight);
    };
  }, []);

  // Close sidebar on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // Show loading spinner while resolving session
  if (loading || !user) {
    return (
      <div className="flex min-h-[var(--app-height)] items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[var(--app-height)] overflow-x-hidden bg-slate-50 text-slate-950">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/*
        Overlay backdrop — always mounted so it can fade in/out smoothly.
        On desktop (lg+) it is permanently invisible and non-interactive.
      */}
      <div
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
        className={[
          "fixed inset-0 z-30 lg:hidden",
          "bg-slate-950/40 backdrop-blur-sm",
          "transition-opacity duration-300 ease-in-out",
          sidebarOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      <div className="min-h-[var(--app-height)] lg:pl-72">
        <Header
          onMenuOpen={() => setSidebarOpen(true)}
          sidebarOpen={sidebarOpen}
        />

        <main className="px-3 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-6">
          {children}
        </main>
      </div>

      <BottomNav />

      {/* ── Onboarding Layer ─────────────────────────────────────────────── */}
      <WelcomeWizard />
      <ProductTour />
      <OnboardingChecklist />
      <QuickActionFab />
      <AchievementToast />
    </div>
  );
}
