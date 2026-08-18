import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE QUICK ACTION UX FIX.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). QuickActionFab can't be safely mounted here
 * anyway (it transitively pulls in browser-only APIs), matching the
 * established pattern for this codebase's layout components. These tests
 * prove the mobile compact panel and the desktop stack are two genuinely
 * separate render paths gated by the app's existing `lg:` breakpoint (no
 * new breakpoint, no JS media-query hook), that they share the same
 * QUICK_ACTIONS registry/hrefs/selectAction (no duplicated action
 * definitions), and that the drag/click-suppression architecture from the
 * prior FAB tickets was left untouched.
 */
describe("QuickActionFab mobile compact action panel", () => {
  const source = readFileSync(
    path.resolve(__dirname, "QuickActionFab.tsx"),
    "utf8",
  );

  it("renders a mobile-only action panel gated by lg:hidden, separate from the desktop stack", () => {
    expect(source).toContain("function renderMobileActionPanel()");
    expect(source).toContain("lg:hidden");
  });

  it("the desktop action stack is hidden below lg and only shown at lg and up (no new breakpoint invented)", () => {
    expect(source).toContain("hidden flex-col items-end gap-2 lg:flex");
  });

  it("both render branches (default anchor and dragged position) mount the mobile panel", () => {
    const occurrences = source.split("renderMobileActionPanel()").length - 1;
    // One function definition + two call sites (position === null branch,
    // dragged/restored branch) = 3 total occurrences of the identifier.
    expect(occurrences).toBe(3);
  });

  it("the mobile panel anchors above BottomNav using the existing --mobile-bottom-nav-height + safe-area tokens, not a new hardcoded height", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("var(--mobile-bottom-nav-height)");
    expect(panelSource).toContain("env(safe-area-inset-bottom)");
    expect(panelSource).toContain("env(safe-area-inset-left)");
    expect(panelSource).toContain("env(safe-area-inset-right)");
  });

  it("the mobile panel and its backdrop reuse the FAB's existing z-100 tier, not an arbitrary new z-index", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).not.toMatch(/z-\[\d{4,}\]/); // no huge arbitrary z-index
    expect(panelSource.split("z-100").length - 1).toBe(2); // backdrop + panel
  });

  it("tapping the backdrop closes the menu", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("onClick={() => setIsQuickActionOpen(false)}");
  });

  it("mobile action rows call the SAME selectAction/QUICK_ACTIONS used by the desktop stack — no duplicated action registry", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("QUICK_ACTIONS.map((action) =>");
    expect(panelSource).toContain("onClick={() => selectAction(action.href)}");
  });

  it("mobile labels never wrap onto multiple lines", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("whitespace-nowrap");
  });

  it("mobile rows meet the minimum comfortable touch-target height (>= 48px, min-h-12)", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("min-h-12");
  });

  it("mobile rows use light tinted-icon styling, not the desktop's solid saturated color blocks", () => {
    const start = source.indexOf("function renderMobileActionPanel()");
    const end = source.indexOf("\n  }", start);
    const panelSource = source.slice(start, end);

    expect(panelSource).toContain("action.mobileIconBg");
    expect(panelSource).toContain("action.mobileIconColor");
    expect(panelSource).not.toContain("action.cls");
  });

  it("QUICK_ACTIONS entries carry mobile icon-tint fields without touching href/label/icon/cls", () => {
    expect(source).toContain('mobileIconBg: "bg-blue-100"');
    expect(source).toContain('mobileIconColor: "text-blue-600"');
    expect(source).toContain('mobileIconBg: "bg-emerald-100"');
    expect(source).toContain('mobileIconBg: "bg-violet-100"');
    expect(source).toContain('mobileIconBg: "bg-cyan-100"');
    // Still exactly 4 actions, still the same hrefs as before this ticket.
    expect(source).toContain('buildQuickActionCreateHref("/transactions")');
    expect(source).toContain('buildQuickActionCreateHref("/wallets")');
    expect(source).toContain('buildQuickActionCreateHref("/goals")');
    expect(source).toContain('buildQuickActionCreateHref("/budgets")');
  });

  it("dragging still closes an open menu before continuing (unchanged from prior tickets)", () => {
    const moveStart = source.indexOf("function handlePointerMove(");
    const moveEnd = source.indexOf("function handlePointerUp(");
    const moveSource = source.slice(moveStart, moveEnd);

    expect(moveSource).toContain("if (isQuickActionOpen) setIsQuickActionOpen(false);");
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
});
