"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import StartupShellSkeleton from "./StartupShellSkeleton";
import AIFloatingButton from "@/src/components/ai-agent/AIFloatingButton";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useOnboarding } from "@/src/components/onboarding/OnboardingProvider";
import { AchievementToast } from "@/src/components/onboarding/AchievementToast";
import { DateFilterProvider } from "./DateFilterProvider";
import { FabSuppressionProvider } from "./FabVisibilityProvider";
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
const QuickActionFab = dynamic(
  () => import("@/src/components/layout/QuickActionFab"),
  { ssr: false, loading: () => null },
);

// TEMPORARY: hides the floating AI launcher (bottom-right button) without
// deleting it — AIFloatingButton's implementation, the AI drawer/history/
// pending-actions/backend, and the separate header "AI" advisor button
// (Header.tsx) are all untouched. Flip back to `true` to re-enable; kept as
// a plain gate here (not mounted at all when false) rather than a CSS
// display:none, per this being a rendering decision, not a style one.
const SHOW_AI_FLOATING_BUTTON = false;

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
  // Set by whichever page is currently mounted, whenever its own primary
  // create/edit modal (or a blocking confirm dialog) is open — see
  // FabVisibilityProvider. AppShell owns this boolean directly since it's
  // the one deciding whether to render the FABs; pages only get a setter.
  const [isGlobalFabSuppressed, setGlobalFabSuppressed] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  const { wizardDone, tourDone } = useOnboarding();

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
    // Shared skeleton — same component app/loading.tsx renders — so the
    // user never sees a different-looking loading state flash in between.
    // Route content itself still waits for `user` (RLS-scoped reads need
    // it), only the surrounding chrome renders early.
    return <StartupShellSkeleton />;
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
            <FabSuppressionProvider setSuppressed={setGlobalFabSuppressed}>
              {children}
            </FabSuppressionProvider>
          </main>
        </div>

        <BottomNav />

        {SHOW_AI_FLOATING_BUTTON && !aiAgentOpen && !isGlobalFabSuppressed && (
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
        {!aiAgentOpen && !isGlobalFabSuppressed && <QuickActionFab />}
        <AchievementToast />
      </div>
    </DateFilterProvider>
  );
}
