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

// REAL-IPHONE-DASHBOARD-SCROLL-1: visualViewport can emit many resize/scroll
// events while iOS browser chrome collapses during a finger scroll. Writing the
// shell height for every one of those events forces layout while the inner main
// scroller is in motion and can make momentum scrolling feel like it catches.
// Coalesce viewport-height writes after resize settles, and reserve the smaller
// visual viewport for a likely software keyboard rather than browser chrome.
const APP_HEIGHT_SETTLE_MS = 180;
const IOS_KEYBOARD_VIEWPORT_DELTA_PX = 120;

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

  // Keep the shell aligned with the real iPhone viewport without mutating
  // layout on every browser-toolbar scroll event. A debounced resize sync still
  // follows orientation changes and the software keyboard, but normal finger
  // scrolling is left entirely to the native momentum scroller.
  //
  // Important: do not put the legacy `-webkit-overflow-scrolling: touch` on
  // finance-main. On iOS it creates a stacking context that can trap page-owned
  // fixed dialogs underneath the sibling sticky Header / BottomNav, making the
  // top of full-screen forms visually clipped and untappable. Modern iOS Safari
  // already provides momentum scrolling for overflow scrollers natively.
  useEffect(() => {
    let settleTimerId: number | null = null;
    let animationFrameId: number | null = null;

    const writeAppHeight = () => {
      animationFrameId = null;

      const visualViewport = window.visualViewport;
      const activeElement = document.activeElement;
      const isKeyboardTarget =
        activeElement instanceof HTMLElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          activeElement.tagName === "SELECT" ||
          activeElement.isContentEditable);
      const keyboardLikelyOpen =
        visualViewport !== null &&
        isKeyboardTarget &&
        window.innerHeight - visualViewport.height >=
          IOS_KEYBOARD_VIEWPORT_DELTA_PX;
      const height =
        keyboardLikelyOpen && visualViewport
          ? visualViewport.height
          : window.innerHeight || document.documentElement.clientHeight;

      document.documentElement.style.setProperty(
        "--app-height",
        `${Math.round(height)}px`,
      );
    };

    const requestAppHeightWrite = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(writeAppHeight);
    };

    const scheduleAppHeightSync = () => {
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }
      settleTimerId = window.setTimeout(
        requestAppHeightWrite,
        APP_HEIGHT_SETTLE_MS,
      );
    };

    requestAppHeightWrite();

    window.visualViewport?.addEventListener("resize", scheduleAppHeightSync);
    window.addEventListener("resize", scheduleAppHeightSync);
    window.addEventListener("orientationchange", scheduleAppHeightSync);

    return () => {
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleAppHeightSync,
      );
      window.removeEventListener("resize", scheduleAppHeightSync);
      window.removeEventListener("orientationchange", scheduleAppHeightSync);
      if (settleTimerId !== null) {
        window.clearTimeout(settleTimerId);
      }
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // FINANCE-CONTENT-SCROLL-OWNER-2:
  // Authenticated pages have exactly one vertical scroll owner: finance-main.
  // Lock the document while AppShell is mounted so the scrollbar begins below
  // the topbar instead of running through the browser/document viewport.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.add("finance-app-shell-active");
    body.classList.add("finance-app-shell-active");

    return () => {
      root.classList.remove("finance-app-shell-active");
      body.classList.remove("finance-app-shell-active");
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
      <div className="finance-shell h-(--app-height) overflow-hidden bg-[var(--finance-page)] text-[var(--finance-text)] [--mobile-bottom-nav-height:4.75rem]">
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

          <main className="finance-main min-h-0 flex-1 overflow-x-clip overflow-y-auto px-3 py-4 pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-6">
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
