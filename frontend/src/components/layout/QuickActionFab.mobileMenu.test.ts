import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE QUICK ACTION COMPACT FIX.
 *
 * The deterministic "should an outside tap close the mobile menu" decision
 * is a real, directly-unit-tested pure function
 * (`shouldCloseMobileMenuOnOutsidePointerDown` in fabPosition.test.ts) — not
 * re-tested here by string matching. What remains here is genuinely only
 * testable by source inspection (no React Testing Library in this project,
 * see AGENTS.md, and QuickActionFab can't be safely mounted): the actual
 * JSX structure (2x2 grid, no dark backdrop element, bounded compact
 * sizing, BottomNav/safe-area anchoring, shared action registry, desktop
 * stack untouched, drag architecture untouched).
 */
describe("QuickActionFab mobile compact 2x2 action panel", () => {
  const source = readFileSync(
    path.resolve(__dirname, "QuickActionFab.tsx"),
    "utf8",
  );

  function extractPanelSource() {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    return source.slice(start, end);
  }

  it("renders a mobile-only panel gated by lg:hidden, separate from the desktop stack", () => {
    expect(source).toContain("function renderMobileActionPanel()");
    expect(extractPanelSource()).toContain("lg:hidden");
  });

  it("uses a compact 2x2 grid, not a tall 1-column vertical stack", () => {
    expect(extractPanelSource()).toContain("grid-cols-2");
    expect(extractPanelSource()).not.toContain("flex-col");
  });

  it("has NO full-screen dark backdrop element — this is a lightweight popover, not a modal", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).not.toContain("inset-0");
    expect(panelSource).not.toContain("bg-slate-900");
    expect(panelSource).not.toMatch(/bg-black/);
  });

  it("has no large header consuming vertical space (removed per the compact-height requirement)", () => {
    expect(extractPanelSource()).not.toContain("Thao tác nhanh");
  });

  it("uses bounded, compact cell sizing (min-h-14 rows, not the old min-h-12 1-column rows) — keeps total panel height well under ~200px", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("min-h-14");
    expect(panelSource).not.toContain("min-h-12");
  });

  it("anchors above BottomNav using the existing --mobile-bottom-nav-height + safe-area tokens, not a new hardcoded height", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("var(--mobile-bottom-nav-height)");
    expect(panelSource).toContain("env(safe-area-inset-bottom)");
    expect(panelSource).toContain("env(safe-area-inset-left)");
    expect(panelSource).toContain("env(safe-area-inset-right)");
  });

  it("the panel reuses the FAB's existing z-100 tier, not an arbitrary new z-index", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).not.toMatch(/z-\[\d{4,}\]/);
    expect(panelSource).toContain("z-100");
  });

  it("both render branches (default anchor and dragged position) mount the mobile panel", () => {
    const occurrences = source.split("renderMobileActionPanel()").length - 1;
    expect(occurrences).toBe(3); // 1 definition + 2 call sites
  });

  it("action cells call the SAME selectAction/QUICK_ACTIONS used by the desktop stack — no duplicated action registry", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("QUICK_ACTIONS.map((action) =>");
    expect(panelSource).toContain("onClick={() => selectAction(action.href)}");
  });

  it("all four actions are still defined with their original hrefs, unchanged by this presentation-only patch", () => {
    expect(source).toContain('buildQuickActionCreateHref("/transactions")');
    expect(source).toContain('buildQuickActionCreateHref("/wallets")');
    expect(source).toContain('buildQuickActionCreateHref("/goals")');
    expect(source).toContain('buildQuickActionCreateHref("/budgets")');
  });

  it("action labels are truncated to a single line — can never 3-line wrap", () => {
    expect(extractPanelSource()).toContain("truncate");
  });

  it("mobile cells use light tinted-icon styling, not the desktop's solid saturated color blocks", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("action.mobileIconBg");
    expect(panelSource).toContain("action.mobileIconColor");
    expect(panelSource).not.toContain("action.cls");
  });

  it("the desktop action stack is hidden below lg and only shown at lg and up (no new breakpoint invented)", () => {
    expect(source).toContain("hidden flex-col items-end gap-2 lg:flex");
  });

  it("outside-tap-to-close is wired via a document-level pointerdown listener using the shared pure decision helper, not a full-viewport click-catcher div", () => {
    expect(source).toContain(
      'from "@/src/lib/ui/fabPosition"',
    );
    expect(source).toContain("shouldCloseMobileMenuOnOutsidePointerDown");
    expect(source).toContain(
      'document.addEventListener("pointerdown", handleOutsidePointerDown)',
    );
  });

  function extractOutsideTapEffectSource() {
    const start = source.indexOf(
      "// Mobile's compact panel is a lightweight, non-modal popover",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, [isQuickActionOpen]);", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("the outside-tap listener excludes taps on the panel itself and on the FAB button before deciding to close", () => {
    const effectSource = extractOutsideTapEffectSource();

    expect(effectSource).toContain(
      "mobilePanelRef.current?.contains(target)",
    );
    expect(effectSource).toContain("fabButtonRef.current?.contains(target)");
  });

  it("the outside-tap listener is only registered while the menu is open, and cleaned up", () => {
    const effectSource = extractOutsideTapEffectSource();

    expect(effectSource).toContain("if (!isQuickActionOpen) return;");
    expect(effectSource).toContain("document.removeEventListener(");
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
});
