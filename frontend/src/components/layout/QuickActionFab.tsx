"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChartPie,
  ReceiptText,
  Target,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { buildQuickActionCreateHref } from "@/src/lib/navigation/quickActionIntent";
import {
  clampFabPosition,
  computeDraggedPosition,
  exceedsDragThreshold,
  parseStoredFabPosition,
  type FabPosition,
} from "@/src/lib/ui/fabPosition";

const QUICK_ACTIONS = [
  {
    label: "Thêm giao dịch",
    href: buildQuickActionCreateHref("/transactions"),
    icon: ReceiptText,
    cls: "bg-blue-600 shadow-blue-200/60 hover:bg-blue-700",
    mobileIconBg: "bg-blue-100",
    mobileIconColor: "text-blue-600",
  },
  {
    label: "Tạo ví tiền",
    href: buildQuickActionCreateHref("/wallets"),
    icon: Wallet,
    cls: "bg-emerald-600 shadow-emerald-200/60 hover:bg-emerald-700",
    mobileIconBg: "bg-emerald-100",
    mobileIconColor: "text-emerald-600",
  },
  {
    label: "Tạo mục tiêu",
    href: buildQuickActionCreateHref("/goals"),
    icon: Target,
    cls: "bg-violet-600 shadow-violet-200/60 hover:bg-violet-700",
    mobileIconBg: "bg-violet-100",
    mobileIconColor: "text-violet-600",
  },
  {
    label: "Tạo ngân sách",
    href: buildQuickActionCreateHref("/budgets"),
    icon: ChartPie,
    cls: "bg-cyan-600 shadow-cyan-200/60 hover:bg-cyan-700",
    mobileIconBg: "bg-cyan-100",
    mobileIconColor: "text-cyan-600",
  },
];

// Same button size as AIFloatingButton's own size-14 (56px), and the same
// bottom-nav/safe-area clamping heuristic that button already established
// for this app (a fixed generous buffer instead of reading env() safe-area
// values in JS) — both floating buttons should respect the same "never
// settle under the bottom nav / browser chrome" contract rather than
// inventing a second one.
const FAB_SIZE = 56;
const DRAG_THRESHOLD = 5;
const ACTION_LIST_GAP = 8; // matches the original flex gap-2 (0.5rem)
const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";

function getViewportBounds() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    fabSize: FAB_SIZE,
    marginX: 12,
    marginTop: 76,
    marginBottom: window.innerWidth >= 1024 ? 16 : 104,
  };
}

function readStoredPosition(): FabPosition | null {
  if (typeof window === "undefined") return null;

  try {
    const parsed = parseStoredFabPosition(
      window.localStorage.getItem(POSITION_STORAGE_KEY),
    );
    return parsed ? clampFabPosition(parsed, getViewportBounds()) : null;
  } catch {
    return null;
  }
}

function saveStoredPosition(position: FabPosition) {
  try {
    window.localStorage.setItem(
      POSITION_STORAGE_KEY,
      JSON.stringify(position),
    );
  } catch {
    // Ignore localStorage errors (private browsing / storage quota).
  }
}

type DragState = {
  dragging: boolean;
  moved: boolean;
  startPointer: FabPosition;
  startElement: FabPosition;
  /** Latest clamped position computed during an active drag — read by the
   * queued rAF callback, NOT by React render. Only ever committed to React
   * state (via setPosition) at drag start (the one threshold-crossing
   * transition) and drag end. */
  latestPosition: FabPosition | null;
};

/**
 * QuickActionFab — the app's one persistent, canonical "Làm gì" (action)
 * entry point: a floating button that expands into shortcuts for the most
 * common create-flows. Lives in layout/ (not onboarding/, where it used to
 * be) because it's a permanent navigation-adjacent control, not an
 * onboarding nudge — it must never disappear once a user finishes their
 * onboarding checklist. It intentionally has NO dependency on
 * OnboardingProvider/useOnboarding: closing this menu must not affect AI,
 * and finishing onboarding must not affect this.
 *
 * Draggable: `position === null` means nothing has ever been dragged this
 * session/device and nothing valid is in storage, so it renders with the
 * ORIGINAL bottom-right CSS anchoring, byte-for-byte unchanged — the exact
 * default appearance existing users already know.
 *
 * Drag rendering deliberately does NOT put React state in the pointermove
 * hot path (a prior version did, combined with a `transition-all` class
 * that erroneously eased every left/top change — the actual cause of the
 * reported jank, since `left`/`top` were being animated toward a
 * half-second-stale target on every frame). Instead: pointerdown captures
 * the button's real on-screen rect; the FIRST move past DRAG_THRESHOLD
 * commits ONE state update that switches rendering into a transform-based
 * positioning wrapper (seeded exactly where the button already visually
 * is — no jump); every subsequent move only writes into a ref and queues
 * at most one rAF, which imperatively sets the wrapper's
 * `transform: translate3d(...)` directly on the DOM node — no re-render,
 * no transition, 1:1 with the pointer. `position` state is resynced to the
 * final value once at pointerup/pointercancel, which is also the only time
 * localStorage is written.
 */
export default function QuickActionFab() {
  const router = useRouter();
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [position, setPosition] = useState<FabPosition | null>(() =>
    readStoredPosition(),
  );
  const [isDragging, setIsDragging] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<DragState>({
    dragging: false,
    moved: false,
    startPointer: { x: 0, y: 0 },
    startElement: { x: 0, y: 0 },
    latestPosition: null,
  });
  // A completed drag suppresses the click event that (on most browsers)
  // still fires right after pointerup on the same element — see
  // handleClick's own doc comment for why this is the mechanism, not
  // e.preventDefault() or skipping onClick entirely.
  const suppressNextClickRef = useRef(false);

  // Keep a dragged/restored position inside the viewport across resizes and
  // orientation changes. A no-op while still on the original CSS-anchored
  // default spot (nothing to reclamp — Tailwind's own breakpoint/env()
  // handling already keeps that responsive).
  useEffect(() => {
    function handleResize() {
      setPosition((current) => {
        if (!current) return current;
        const next = clampFabPosition(current, getViewportBounds());
        saveStoredPosition(next);
        return next;
      });
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  // Never leave a queued frame running after unmount (route change, or
  // FabVisibilityProvider suppressing this component mid-drag).
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function selectAction(href: string) {
    // Close synchronously, before kicking off navigation, so the expanded
    // menu never stays visible mid-transition (including a same-page
    // re-tap, which doesn't unmount this component at all).
    setIsQuickActionOpen(false);
    router.push(href);
  }

  function finishDrag(suppressClick: boolean) {
    const drag = dragRef.current;
    drag.dragging = false;
    setIsDragging(false);

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (drag.moved && drag.latestPosition) {
      const finalPosition = clampFabPosition(
        drag.latestPosition,
        getViewportBounds(),
      );
      if (suppressClick) suppressNextClickRef.current = true;
      setPosition(finalPosition);
      saveStoredPosition(finalPosition);
    }

    drag.moved = false;
    drag.latestPosition = null;
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      moved: false,
      startPointer: { x: event.clientX, y: event.clientY },
      startElement: { x: rect.left, y: rect.top },
      latestPosition: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag.dragging) return;

    const currentPointer = { x: event.clientX, y: event.clientY };

    if (!drag.moved) {
      const deltaX = currentPointer.x - drag.startPointer.x;
      const deltaY = currentPointer.y - drag.startPointer.y;
      if (!exceedsDragThreshold(deltaX, deltaY, DRAG_THRESHOLD)) return;

      // Threshold just crossed — the ONE state update for this whole drag
      // gesture (besides the final commit at drag-end). Close the menu (it
      // must never participate in drag layout) and seed the transform
      // wrapper at the position the pointer delta already implies, so
      // switching rendering modes causes no visual jump.
      drag.moved = true;
      if (isQuickActionOpen) setIsQuickActionOpen(false);

      const initial = clampFabPosition(
        computeDraggedPosition(
          drag.startElement,
          drag.startPointer,
          currentPointer,
        ),
        getViewportBounds(),
      );
      drag.latestPosition = initial;
      setIsDragging(true);
      setPosition(initial);
      return;
    }

    const next = clampFabPosition(
      computeDraggedPosition(
        drag.startElement,
        drag.startPointer,
        currentPointer,
      ),
      getViewportBounds(),
    );
    drag.latestPosition = next;

    // Coalesce a whole burst of pointermove events into at most one visual
    // update per animation frame, applied directly to the DOM node — no
    // React re-render, no CSS transition, so the wrapper's position is
    // always exactly the latest clamped pointer-derived value.
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const latest = dragRef.current.latestPosition;
        if (latest && wrapperRef.current) {
          wrapperRef.current.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;
        }
      });
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current.dragging) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture errors.
    }
    finishDrag(true);
  }

  function handlePointerCancel() {
    // No click follows a cancelled gesture, but still resync React state
    // to whatever was last visually applied so a later unrelated re-render
    // can never snap the button back to a stale pre-drag position.
    finishDrag(false);
  }

  // The single source of truth for "toggle the menu" — reachable both by a
  // genuine plain click (mouse/touch, when handlePointerUp did not detect a
  // drag) AND by pure keyboard activation (Enter/Space on the focused
  // button dispatches a click without any preceding pointer events at all),
  // so dragging can never regress keyboard accessibility. A completed drag
  // sets suppressNextClickRef so the click that still fires right after
  // pointerup on most browsers doesn't also toggle the menu the user never
  // intended to touch.
  function handleClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    setIsQuickActionOpen((v) => !v);
  }

  const fabButtonClassName = [
    // transition-transform (never transition-all/transition-colors etc.) —
    // scoped ONLY to this button's OWN transform (its hover/active scale
    // and the open/close rotate), which lives on a different element than
    // the drag-position transform below, so the two can never fight over
    // the same animated property.
    "flex size-14 touch-none select-none items-center justify-center rounded-[1.25rem] shadow-xl transition-transform duration-150 active:scale-95 cursor-grab active:cursor-grabbing",
    isQuickActionOpen
      ? "bg-slate-700 shadow-slate-300/50 hover:bg-slate-800 rotate-45"
      : "bg-blue-600 shadow-blue-300/60 hover:bg-blue-700 hover:scale-105",
  ].join(" ");

  function renderFabButton() {
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        aria-label={
          isQuickActionOpen ? "Đóng thao tác nhanh" : "Mở thao tác nhanh"
        }
        className={fabButtonClassName}
      >
        {isQuickActionOpen ? (
          <X size={22} className="text-white" />
        ) : (
          <Zap size={22} className="text-white" />
        )}
      </button>
    );
  }

  function renderActionButtons() {
    return QUICK_ACTIONS.map((action) => {
      const Icon = action.icon;
      return (
        <button
          key={action.href}
          type="button"
          onClick={() => selectAction(action.href)}
          className={[
            "flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95",
            action.cls,
          ].join(" ")}
        >
          <Icon size={15} />
          {action.label}
        </button>
      );
    });
  }

  // Mobile-only compact action sheet — deliberately independent of the FAB's
  // own `position`/drag location (see the ticket's "menu position = mobile-
  // safe canonical overlay" requirement): it always anchors above BottomNav
  // via the same `--mobile-bottom-nav-height` + safe-area token the FAB's
  // own default anchor already uses, rather than chasing wherever the user
  // dragged the button. Reuses the exact same QUICK_ACTIONS entries/hrefs
  // and `selectAction` as the desktop stack — only the presentation differs
  // (light tinted-icon rows instead of solid color blocks, per the ticket's
  // "too visually heavy at this size on mobile" finding). `lg:hidden` keeps
  // this out of the desktop layout entirely, matching how BottomNav/Sidebar
  // already split mobile vs. desktop with pure Tailwind breakpoints instead
  // of a JS media-query hook.
  function renderMobileActionPanel() {
    return (
      <>
        <div
          className="fixed inset-0 z-100 bg-slate-900/10 lg:hidden"
          aria-hidden="true"
          onClick={() => setIsQuickActionOpen(false)}
        />
        <div
          className="fixed z-100 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl lg:hidden"
          style={{
            bottom:
              "calc(var(--mobile-bottom-nav-height) + env(safe-area-inset-bottom) + 0.75rem)",
            left: "max(1rem, calc(env(safe-area-inset-left) + 0.75rem))",
            right: "max(1rem, calc(env(safe-area-inset-right) + 0.75rem))",
          }}
        >
          <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Thao tác nhanh
          </p>
          <div className="flex flex-col gap-1">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.href}
                  type="button"
                  onClick={() => selectAction(action.href)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-slate-700 active:bg-slate-100"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${action.mobileIconBg}`}
                  >
                    <Icon size={19} className={action.mobileIconColor} />
                  </span>
                  <span className="whitespace-nowrap">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  if (position === null) {
    // Original, untouched default: bottom-right anchored via CSS, action
    // list grows upward above the button through normal flex-column flow.
    // Desktop (lg+) only — mobile renders the compact bottom sheet instead.
    return (
      <>
        {isQuickActionOpen && renderMobileActionPanel()}
        <div className="fixed bottom-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] right-4 z-100 flex flex-col items-end gap-2 lg:bottom-6">
          {isQuickActionOpen && (
            <div className="hidden flex-col items-end gap-2 lg:flex">
              {renderActionButtons()}
            </div>
          )}
          {renderFabButton()}
        </div>
      </>
    );
  }

  // Dragged (or restored) position: an outer wrapper carries the ONLY
  // position-affecting transform (translate3d, never transitioned, so it
  // is always 1:1 with the pointer during a drag and instant on
  // mount/resize/commit). The button inside keeps its own unrelated
  // hover/active/rotate transform entirely separate — the two transforms
  // live on different elements and can never conflict or fight over
  // easing. The action list, when open, is a second fixed panel anchored
  // via a static (non-drag-driven) transform relative to the button's
  // current position — never part of the drag hot path, since it's
  // always closed before a real drag begins.
  const wrapperStyle: CSSProperties = {
    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    willChange: isDragging ? "transform" : undefined,
  };

  return (
    <>
      {isQuickActionOpen && renderMobileActionPanel()}
      {isQuickActionOpen && (
        <div
          className="fixed z-100 hidden flex-col items-end gap-2 lg:flex"
          style={{
            left: position.x + FAB_SIZE,
            top: position.y - ACTION_LIST_GAP,
            transform: "translate(-100%, -100%)",
          }}
        >
          {renderActionButtons()}
        </div>
      )}
      <div ref={wrapperRef} className="fixed left-0 top-0 z-100" style={wrapperStyle}>
        {renderFabButton()}
      </div>
    </>
  );
}
