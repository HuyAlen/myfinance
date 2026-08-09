"use client";

import { useEffect, useRef, useState } from "react";
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
import { markInstant } from "@/src/lib/performance/performanceMarks";
import { reportPerformanceMetric } from "@/src/lib/performance/performanceReporter";

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

  // Fires once on AppShell's very first render (whether that's the loading
  // skeleton below or the fully-resolved shell), independent of auth state —
  // measures how long the user sees *some* app chrome, as distinct from
  // auth_ready (session resolved) and dashboard_critical_ready (finance
  // numbers painted).
  const hasReportedShellVisibleRef = useRef(false);
  useEffect(() => {
    if (hasReportedShellVisibleRef.current) return;
    hasReportedShellVisibleRef.current = true;
    const frame = requestAnimationFrame(() => {
      reportPerformanceMetric("app_shell_visible", performance.now(), {
        status: "success",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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
    // Shell-shaped skeleton instead of a blank/spinner screen: the real
    // Sidebar/Header/BottomNav dimensions are approximated so there's no
    // layout jump once auth resolves and the real shell + route mount in.
    // Route content itself still waits for `user` (RLS-scoped reads need
    // it), only the surrounding chrome renders early.
    return (
      <div className="h-(--app-height) overflow-hidden bg-slate-50 [--mobile-bottom-nav-height:4.75rem]">
        <div className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-100 bg-white px-3 py-5 lg:block">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-slate-200" />
            <div className="space-y-1.5">
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
              <div className="h-2.5 w-20 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-2xl bg-slate-100"
              />
            ))}
          </div>
        </div>

        <div className="flex h-full min-w-0 flex-col lg:pl-72">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-4 sm:px-6 lg:px-8">
            <div className="space-y-1.5">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-44 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="size-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
          </div>

          <main className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-3xl bg-white shadow-sm ring-1 ring-slate-100"
                />
              ))}
            </div>
            <div className="mt-4 h-48 animate-pulse rounded-3xl bg-white shadow-sm ring-1 ring-slate-100" />
          </main>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-1 pb-1 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="mx-auto size-9 animate-pulse rounded-2xl bg-slate-100"
              />
            ))}
          </div>
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
              if (!hasOpenedAI) markInstant("ai:click");
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
