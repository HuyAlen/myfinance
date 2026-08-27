"use client";

import {
  useEffect,
  useLayoutEffect,
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
  computeQuickActionPanelPosition,
  exceedsDragThreshold,
  parseStoredFabPosition,
  shouldCloseMobileMenuOnOutsidePointerDown,
  type FabPosition,
} from "@/src/lib/ui/fabPosition";

const QUICK_ACTIONS = [
  {
    id: "transaction",
    label: "Thêm giao dịch",
    href: buildQuickActionCreateHref("/transactions"),
    icon: ReceiptText,
    cls: "bg-blue-600 shadow-blue-200/60 hover:bg-blue-700",
    mobileIconBg: "bg-blue-100",
    mobileIconColor: "text-blue-600",
  },
  {
    id: "wallet",
    label: "Tạo ví tiền",
    href: buildQuickActionCreateHref("/wallets"),
    icon: Wallet,
    cls: "bg-emerald-600 shadow-emerald-200/60 hover:bg-emerald-700",
    mobileIconBg: "bg-emerald-100",
    mobileIconColor: "text-emerald-600",
  },
  {
    // Distinct from "wallet" above ("Tạo ví tiền" — opens the create-wallet
    // form via ?action=create) — this one is a plain navigation to the
    // Wallets page itself, so it deliberately does NOT use
    // buildQuickActionCreateHref. Same icon as Sidebar's own "Ví Tiền" link
    // (Wallet, from lucide-react) for semantic consistency; indigo keeps it
    // visually distinct from both "Thêm giao dịch" (blue) and the hidden
    // "Tạo ví tiền" (emerald).
    id: "open-wallets",
    label: "Mở Ví Tiền",
    href: "/wallets",
    icon: Wallet,
    cls: "bg-indigo-600 shadow-indigo-200/60 hover:bg-indigo-700",
    mobileIconBg: "bg-indigo-100",
    mobileIconColor: "text-indigo-600",
  },
  {
    id: "goal",
    label: "Tạo mục tiêu",
    href: buildQuickActionCreateHref("/goals"),
    icon: Target,
    cls: "bg-violet-600 shadow-violet-200/60 hover:bg-violet-700",
    mobileIconBg: "bg-violet-100",
    mobileIconColor: "text-violet-600",
  },
  {
    id: "budget",
    label: "Tạo ngân sách",
    href: buildQuickActionCreateHref("/budgets"),
    icon: ChartPie,
    cls: "bg-cyan-600 shadow-cyan-200/60 hover:bg-cyan-700",
    mobileIconBg: "bg-cyan-100",
    mobileIconColor: "text-cyan-600",
  },
];

// TEMPORARY visibility control — hides items from the Quick Action launcher
// without deleting their definitions (href/icon/colors above stay intact,
// so their destination pages/routes/business logic are completely
// unaffected; re-enabling later is just flipping these back to `true`).
// Keyed by the stable `id` above, never by the display label, so a future
// copy/wording change can never silently re-show or re-hide an action.
const QUICK_ACTION_VISIBILITY: Record<string, boolean> = {
  transaction: true,
  "open-wallets": true,
  wallet: false,
  goal: false,
  budget: false,
};

const VISIBLE_QUICK_ACTIONS = QUICK_ACTIONS.filter(
  (action) => QUICK_ACTION_VISIBILITY[action.id],
);

// DASH-MOBILE-POLISH-2: the Quick Action remains easy to hit while giving
// Net Worth more visual priority on compact screens. Positioning math uses
// the same constant, so drag/clamp/panel placement stay aligned with the
// rendered 48px control.
const FAB_SIZE = 48;
const DRAG_THRESHOLD = 5;
const ACTION_LIST_GAP = 8; // matches the original flex gap-2 (0.5rem)
const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";

// Known/fixed dimensions for the mobile compact panel, not measured from
// the DOM — the panel's width is enforced via inline style below so this
// stays true (no risk of the alignment math disagreeing with an
// auto-sized box), and its height is a stable estimate (2 rows of the
// compact min-h-12 cells + row gap + panel padding) since content is kept
// on one line and can never grow the box taller in practice.
const MOBILE_PANEL_WIDTH = 272;
const MOBILE_PANEL_HEIGHT = 144;
const MOBILE_PANEL_GAP = 10;

// Compact dimensions used while fewer than the full 4 actions are visible
// (see QUICK_ACTION_VISIBILITY) — avoids rendering the 2x2 grid with empty
// cells, or (for exactly 2) a horizontally-squeezed 2-column row that's too
// narrow for either label to render without truncating. Same "known/fixed,
// matched by an explicit inline width style" approach as
// MOBILE_PANEL_WIDTH/HEIGHT above.
//
// - Exactly 1 visible action: a single compact card.
// - Exactly 2: a vertical two-row mini-menu (NOT a 2-column grid) — each
//   row gets the panel's full content width, so a label like "Thêm giao
//   dịch" renders on one line instead of being squeezed into a ~120px-wide
//   grid cell and ellipsized. Reads as a small floating group attached to
//   the FAB rather than a wide, mostly-empty card.
// - 3 or 4 (not currently reachable, but kept correct): the original full
//   2x2 grid dimensions.
const MOBILE_SINGLE_ACTION_WIDTH = 224;
const MOBILE_SINGLE_ACTION_HEIGHT = 64;
const MOBILE_TWO_ACTION_WIDTH = 208;
const MOBILE_TWO_ACTION_HEIGHT = 120;
const IS_SINGLE_MOBILE_ACTION = VISIBLE_QUICK_ACTIONS.length <= 1;
const IS_TWO_ACTION_MOBILE_LAYOUT = VISIBLE_QUICK_ACTIONS.length === 2;
const EFFECTIVE_MOBILE_PANEL_WIDTH = IS_SINGLE_MOBILE_ACTION
  ? MOBILE_SINGLE_ACTION_WIDTH
  : IS_TWO_ACTION_MOBILE_LAYOUT
    ? MOBILE_TWO_ACTION_WIDTH
    : MOBILE_PANEL_WIDTH;
const EFFECTIVE_MOBILE_PANEL_HEIGHT = IS_SINGLE_MOBILE_ACTION
  ? MOBILE_SINGLE_ACTION_HEIGHT
  : IS_TWO_ACTION_MOBILE_LAYOUT
    ? MOBILE_TWO_ACTION_HEIGHT
    : MOBILE_PANEL_HEIGHT;

function getViewportBounds() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    fabSize: FAB_SIZE,
    marginX: 12,
    marginTop: window.innerWidth < 1024 ? 216 : 76,
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
  const [panelPosition, setPanelPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const fabButtonRef = useRef<HTMLButtonElement>(null);
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

  // Mobile's compact panel is a lightweight, non-modal popover — no
  // full-screen backdrop element dimming the page — so "tap outside closes
  // it" is done via a single document-level pointerdown listener instead of
  // an invisible full-viewport click-catcher. Registered only while the
  // menu is open. shouldCloseMobileMenuOnOutsidePointerDown keeps this
  // desktop-inert (desktop's stack never had outside-click-to-close and
  // must not gain it here) and never fires for a tap on the panel itself or
  // on the FAB button (which already has its own open/close toggle).
  useEffect(() => {
    if (!isQuickActionOpen) return;

    function handleOutsidePointerDown(event: Event) {
      const target = event.target as Node | null;
      const insidePanel = Boolean(mobilePanelRef.current?.contains(target));
      const insideFab = Boolean(fabButtonRef.current?.contains(target));
      if (
        shouldCloseMobileMenuOnOutsidePointerDown(
          window.innerWidth,
          insidePanel,
          insideFab,
        )
      ) {
        setIsQuickActionOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isQuickActionOpen]);

  // Follows the FAB's CURRENT on-screen rect — default anchor, restored, or
  // freshly dragged — rather than a fixed canonical spot above BottomNav.
  // useLayoutEffect (not useEffect) so the measurement + recompute happens
  // before the browser paints the commit that opened the menu, avoiding a
  // visible flash at a stale/absent position. Re-runs on `position` (the
  // FAB's own dragged coordinate) so a drag that ends while closed is
  // immediately reflected the next time the menu opens — never stale
  // coordinates from a previous drag. Only does this work while the menu
  // is actually open and only on mobile widths (desktop's stack doesn't use
  // this at all) — never runs on every pointermove/frame, only on open and
  // on resize/orientation change while open, per the "no measurement
  // loops" requirement.
  useLayoutEffect(() => {
    if (!isQuickActionOpen) return;
    if (window.innerWidth >= 1024) return;

    function reposition() {
      const fabRect = fabButtonRef.current?.getBoundingClientRect();
      if (!fabRect) return;
      const bounds = getViewportBounds();
      setPanelPosition(
        computeQuickActionPanelPosition({
          fabRect: {
            left: fabRect.left,
            top: fabRect.top,
            width: fabRect.width,
            height: fabRect.height,
          },
          panelWidth: EFFECTIVE_MOBILE_PANEL_WIDTH,
          panelHeight: EFFECTIVE_MOBILE_PANEL_HEIGHT,
          viewportWidth: bounds.viewportWidth,
          viewportHeight: bounds.viewportHeight,
          margin: bounds.marginX,
          gap: MOBILE_PANEL_GAP,
          safeTop: bounds.marginTop,
          safeBottom: bounds.marginBottom,
        }),
      );
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("orientationchange", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("orientationchange", reposition);
    };
  }, [isQuickActionOpen, position]);

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
    "flex size-12 touch-none select-none items-center justify-center rounded-2xl shadow-[0_6px_18px_rgba(37,99,235,0.22)] transition-transform duration-150 active:scale-95 cursor-grab active:cursor-grabbing",
    isQuickActionOpen
      ? "bg-[#4B6B88] hover:bg-[#3E5D78] rotate-45"
      : "bg-[#1677FF] hover:bg-[#0F6EEB] hover:scale-105",
  ].join(" ");

  function renderFabButton() {
    return (
      <button
        ref={fabButtonRef}
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
          <X size={20} className="text-white" />
        ) : (
          <Zap size={20} className="text-white" />
        )}
      </button>
    );
  }

  function renderActionButtons() {
    return VISIBLE_QUICK_ACTIONS.map((action) => {
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

  // Mobile-only compact action panel — a lightweight floating utility menu,
  // NOT a modal/bottom sheet: no full-screen backdrop (see the outside-tap
  // effect above for how it still closes on an outside tap), a bounded
  // height via a vertical mini-menu instead of a tall 1-column stack or a
  // squeezed 2-column grid, and positioned relative to the FAB's OWN
  // current rect (see the useLayoutEffect above) rather than a fixed
  // canonical spot — wherever the user drags the FAB, the panel opens
  // right beside it, clamped to stay fully inside the viewport and clear
  // of BottomNav/safe-area. Renders VISIBLE_QUICK_ACTIONS (not the raw
  // QUICK_ACTIONS list), and when that's fewer than 4 (see
  // QUICK_ACTION_VISIBILITY) uses the matching
  // EFFECTIVE_MOBILE_PANEL_WIDTH/HEIGHT for exactly 1 or 2 visible actions
  // instead of leaving empty cells or a horizontally-squeezed row that
  // truncates labels. Labels are `whitespace-nowrap` (never `truncate`) —
  // the 1- and 2-action panel widths are sized to fit each label on one
  // line; there is no ellipsis fallback. Reuses the exact same action
  // entries/hrefs and `selectAction` as the desktop stack — only the
  // presentation differs (light tinted-icon cells instead of solid color
  // blocks). `lg:hidden` keeps this out of the desktop layout entirely,
  // matching how BottomNav/Sidebar already split mobile vs. desktop with
  // pure Tailwind breakpoints instead of a JS media-query hook.
  function renderMobileActionPanel(panelPos: { left: number; top: number }) {
    return (
      <div
        ref={mobilePanelRef}
        className={[
          "fixed z-100 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden",
          IS_SINGLE_MOBILE_ACTION
            ? "flex"
            : IS_TWO_ACTION_MOBILE_LAYOUT
              ? "flex flex-col gap-1.5"
              : "grid grid-cols-2 gap-2",
        ].join(" ")}
        style={{
          left: panelPos.left,
          top: panelPos.top,
          width: EFFECTIVE_MOBILE_PANEL_WIDTH,
        }}
      >
        {VISIBLE_QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.href}
              type="button"
              onClick={() => selectAction(action.href)}
              className="flex min-h-12 items-center gap-2 rounded-2xl px-2.5 py-1.5 active:bg-slate-100"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${action.mobileIconBg}`}
              >
                <Icon size={17} className={action.mobileIconColor} />
              </span>
              <span className="whitespace-nowrap text-[13px] font-semibold text-slate-700">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (position === null) {
    // Original, untouched default: bottom-right anchored via CSS, action
    // list grows upward above the button through normal flex-column flow.
    // Desktop (lg+) only — mobile renders the FAB-relative compact panel
    // instead (see renderMobileActionPanel).
    return (
      <>
        {isQuickActionOpen &&
          panelPosition &&
          renderMobileActionPanel(panelPosition)}
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
      {isQuickActionOpen &&
        panelPosition &&
        renderMobileActionPanel(panelPosition)}
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
