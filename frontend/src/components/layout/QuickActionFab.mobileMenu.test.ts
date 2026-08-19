import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE QUICK ACTION FOLLOW-FAB POSITION.
 *
 * The actual placement math (above/below, left/right, viewport clamping,
 * BottomNav/safe-area boundaries) is genuinely unit-tested as a pure
 * function — `computeQuickActionPanelPosition` in fabPosition.test.ts — not
 * re-derived here by string matching. What remains here is genuinely only
 * testable by source inspection (no React Testing Library in this project,
 * see AGENTS.md, and QuickActionFab can't be safely mounted): that the
 * component actually WIRES that pure helper into a real FAB-rect
 * measurement instead of a fixed canonical anchor, that the 2x2 compact
 * grid / no-backdrop presentation from the prior ticket survived, and that
 * the desktop stack and drag architecture remain untouched.
 */
describe("QuickActionFab mobile panel follows the draggable FAB", () => {
  const source = readFileSync(
    path.resolve(__dirname, "QuickActionFab.tsx"),
    "utf8",
  );

  function extractPanelSource() {
    const start = source.indexOf("function renderMobileActionPanel(");
    const end = source.indexOf("\n  }", start);
    return source.slice(start, end);
  }

  function extractRepositionEffectSource() {
    const start = source.indexOf(
      "// Follows the FAB's CURRENT on-screen rect",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [isQuickActionOpen, position]);", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("still renders a mobile-only panel gated by lg:hidden, separate from the desktop stack", () => {
    expect(source).toContain("function renderMobileActionPanel(");
    expect(extractPanelSource()).toContain("lg:hidden");
  });

  it("uses a compact grid (3/4 actions) or a compact vertical stack (exactly 2) — never the old tall items-end stack from before the compact panel existed", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("grid-cols-2");
    expect(panelSource).not.toContain("items-end");
  });

  it("still has NO full-screen dark backdrop element — remains a lightweight popover, not a modal", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).not.toContain("inset-0");
    expect(panelSource).not.toContain("bg-slate-900");
    expect(panelSource).not.toMatch(/bg-black/);
  });

  it("the panel's position is now driven by computed left/top (from the FAB rect), not a fixed bottom/left/right CSS anchor", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("left: panelPos.left");
    expect(panelSource).toContain("top: panelPos.top");
    expect(panelSource).not.toContain("bottom:");
    expect(panelSource).not.toContain("var(--mobile-bottom-nav-height)");
  });

  it("the panel has a known, explicit width matching the constant used in the positioning math (so alignment math and rendered box agree)", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("width: EFFECTIVE_MOBILE_PANEL_WIDTH");
    expect(source).toContain("const MOBILE_PANEL_WIDTH = ");
  });

  it("the panel reuses the FAB's existing z-100 tier, not an arbitrary new z-index", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).not.toMatch(/z-\[\d{4,}\]/);
    expect(panelSource).toContain("z-100");
  });

  it("both render branches (default anchor and dragged position) mount the mobile panel, only once panelPosition is known", () => {
    const occurrences = source.split("renderMobileActionPanel(").length - 1;
    expect(occurrences).toBe(3); // 1 definition + 2 call sites
    expect(source.split("panelPosition &&").length - 1).toBe(2);
  });

  it("action cells call the SAME selectAction/VISIBLE_QUICK_ACTIONS used by the desktop stack — no duplicated action registry", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("VISIBLE_QUICK_ACTIONS.map((action) =>");
    expect(panelSource).toContain("onClick={() => selectAction(action.href)}");
  });

  it("all four actions are still defined with their original hrefs, unchanged by this positioning-only patch", () => {
    expect(source).toContain('buildQuickActionCreateHref("/transactions")');
    expect(source).toContain('buildQuickActionCreateHref("/wallets")');
    expect(source).toContain('buildQuickActionCreateHref("/goals")');
    expect(source).toContain('buildQuickActionCreateHref("/budgets")');
  });

  it("action labels render fully on one line (whitespace-nowrap) — never truncated with an ellipsis, never 3-line wrap", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("whitespace-nowrap");
    expect(panelSource).not.toContain("truncate");
  });

  it("mobile cells still use light tinted-icon styling, not the desktop's solid saturated color blocks", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("action.mobileIconBg");
    expect(panelSource).toContain("action.mobileIconColor");
    expect(panelSource).not.toContain("action.cls");
  });

  it("the desktop action stack is still hidden below lg and only shown at lg and up (no new breakpoint invented)", () => {
    expect(source).toContain("hidden flex-col items-end gap-2 lg:flex");
  });

  it("outside-tap-to-close is still wired via a document-level pointerdown listener using the shared pure decision helper, not a full-viewport click-catcher div", () => {
    expect(source).toContain('from "@/src/lib/ui/fabPosition"');
    expect(source).toContain("shouldCloseMobileMenuOnOutsidePointerDown");
    expect(source).toContain(
      'document.addEventListener("pointerdown", handleOutsidePointerDown)',
    );
  });

  it("the reposition effect measures the FAB's actual current rect via getBoundingClientRect, not an assumed default location", () => {
    const effectSource = extractRepositionEffectSource();
    expect(effectSource).toContain("fabButtonRef.current?.getBoundingClientRect()");
    expect(effectSource).toContain("computeQuickActionPanelPosition(");
  });

  it("the reposition effect is mobile-only (skips on desktop widths) and only runs while the menu is open", () => {
    const effectSource = extractRepositionEffectSource();
    expect(effectSource).toContain("if (!isQuickActionOpen) return;");
    expect(effectSource).toContain("if (window.innerWidth >= 1024) return;");
  });

  it("the reposition effect re-runs when the FAB's own dragged position changes, so a completed drag is reflected on the next open (no stale coordinates)", () => {
    expect(source).toContain("}, [isQuickActionOpen, position]);");
  });

  it("the reposition effect updates on resize/orientation change while open, and cleans up its listeners", () => {
    const effectSource = extractRepositionEffectSource();
    expect(effectSource).toContain('window.addEventListener("resize", reposition)');
    expect(effectSource).toContain(
      'window.addEventListener("orientationchange", reposition)',
    );
    expect(effectSource).toContain('window.removeEventListener("resize"');
  });

  it("positioning uses useLayoutEffect (not useEffect) to avoid a visible flash at a stale position when the menu opens", () => {
    const start = source.indexOf(
      "// Follows the FAB's CURRENT on-screen rect",
    );
    const nextEffectCall = source.indexOf("useLayoutEffect(() => {", start);
    const nextPlainEffectCall = source.indexOf("useEffect(() => {", start);
    expect(nextEffectCall).toBeGreaterThan(start);
    // Whichever effect hook call comes first after this comment must be
    // useLayoutEffect, not a plain useEffect.
    expect(
      nextPlainEffectCall === -1 || nextEffectCall < nextPlainEffectCall,
    ).toBe(true);
  });

  it("dragging still closes an open menu before continuing (unchanged from prior tickets)", () => {
    const moveStart = source.indexOf("function handlePointerMove(");
    const moveEnd = source.indexOf("function handlePointerUp(");
    const moveSource = source.slice(moveStart, moveEnd);

    expect(moveSource).toContain(
      "if (isQuickActionOpen) setIsQuickActionOpen(false);",
    );
  });

  it("the click-vs-drag suppression mechanism (suppressNextClickRef) is untouched by this ticket", () => {
    expect(source).toContain("const suppressNextClickRef = useRef(false);");
    expect(source).toContain("function handleClick() {");
    expect(source).toContain("if (suppressNextClickRef.current) {");
  });

  it("the drag position math/refs/rAF architecture from the prior smoothness ticket is untouched", () => {
    expect(source).toContain("requestAnimationFrame(() => {");
    expect(source).toContain("translate3d(${latest.x}px, ${latest.y}px, 0)");
    expect(source).toContain("computeDraggedPosition(");
  });

  it("the FAB's own icon/rotate toggle is untouched — no new detached button, no canonical relocation", () => {
    expect(source).toContain(
      '"bg-slate-700 shadow-slate-300/50 hover:bg-slate-800 rotate-45"',
    );
    expect(source).toContain("<X size={22}");
    expect(source).toContain("<Zap size={22}");
  });

  it("localStorage persistence, viewport clamping, and drag threshold constants are untouched", () => {
    expect(source).toContain(
      'const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";',
    );
    expect(source).toContain("const DRAG_THRESHOLD = 5;");
    expect(source).toContain("clampFabPosition(");
  });
});
