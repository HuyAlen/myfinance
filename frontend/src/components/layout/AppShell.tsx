"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import AIFloatingButton from "@/src/components/ai-agent/AIFloatingButton";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useOnboarding } from "@/src/components/onboarding/OnboardingProvider";
import { AchievementToast } from "@/src/components/onboarding/AchievementToast";
import { DateFilterProvider } from "./DateFilterProvider";

// Below-the-fold / on-demand UI: not needed for first paint, so they're
// code-split out of the initial route bundle instead of being parsed and
// mounted on every page load.
const AIAgentDrawer = dynamic(
  () => import("@/src/components/ai-agent/AIAgentDrawer"),
  { ssr: false, loading: () => null },
);
const WelcomeWizard = dynamic(
  () => import("@/src/components/onboarding/WelcomeWizard"),
  { ssr: false, loading: () => null },
);
const ProductTour = dynamic(
  () => import("@/src/components/onboarding/ProductTour"),
  { ssr: false, loading: () => null },
);
const OnboardingChecklist = dynamic(
  () => import("@/src/components/onboarding/OnboardingChecklist"),
  { ssr: false, loading: () => null },
);
const QuickActionFab = dynamic(
  () => import("@/src/components/onboarding/QuickActionFab"),
  { ssr: false, loading: () => null },
);

type AppShellProps = {
  children: React.ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  // Latches true the first time the user opens the AI drawer, so it can be
  // fetched/mounted on demand instead of on every page load. Once opened,
  // it stays mounted even while closed (open={false} just hides it), so an
  // in-progress chat/stream isn't torn down when the panel is dismissed —
  // same lifecycle as before, just deferred until actually needed.
  const [hasOpenedAI, setHasOpenedAI] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  const { wizardDone, tourDone, isFullyOnboarded } = useOnboarding();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Keep real viewport height in sync for iPhone Safari/Chrome.
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

  // Close sidebar on Escape key.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Lock body scroll while mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  if (loading || !user) {
    return (
      <div className="flex min-h-(--app-height) items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <DateFilterProvider>
      <div className="h-(--app-height) overflow-hidden bg-slate-50 text-slate-950 [--mobile-bottom-nav-height:4.75rem]">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          className={[
            "fixed inset-0 z-30 lg:hidden",
            "bg-slate-950/40 backdrop-blur-sm",
            "transition-opacity duration-300 ease-in-out",
            sidebarOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          ].join(" ")}
        />

        <div className="flex h-full min-w-0 flex-col lg:pl-72">
          <Header
            onMenuOpen={() => setSidebarOpen(true)}
            sidebarOpen={sidebarOpen}
          />

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-6">
            {children}
          </main>
        </div>

        <BottomNav />

        {!aiAgentOpen && (
          <AIFloatingButton
            onClick={() => {
              setHasOpenedAI(true);
              setAiAgentOpen(true);
            }}
          />
        )}

        {hasOpenedAI && (
          <AIAgentDrawer
            open={aiAgentOpen}
            onClose={() => setAiAgentOpen(false)}
          />
        )}

        {!wizardDone && <WelcomeWizard />}
        {wizardDone && !tourDone && <ProductTour />}
        {wizardDone && !isFullyOnboarded && (
          <>
            <OnboardingChecklist />
            <QuickActionFab />
          </>
        )}
        <AchievementToast />
      </div>
    </DateFilterProvider>
  );
}
