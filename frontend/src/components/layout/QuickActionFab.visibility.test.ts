import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TEMP HIDE SELECTED QUICK ACTIONS & AI FLOATING BUTTON.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), and QuickActionFab can't be safely
 * mounted. These tests prove the hide is a presentation-only visibility
 * filter keyed by a stable id (never by display text), that none of the
 * four action definitions were deleted, and that both the desktop and
 * mobile render paths consume the SAME filtered list — no duplicated
 * registry, no risk of one path forgetting to apply the filter.
 */
describe("QuickActionFab temporary action visibility", () => {
  const source = readFileSync(
    path.resolve(__dirname, "QuickActionFab.tsx"),
    "utf8",
  );

  it("defines a stable id for every action, independent of its display label", () => {
    expect(source).toContain('id: "transaction",');
    expect(source).toContain('id: "wallet",');
    expect(source).toContain('id: "goal",');
    expect(source).toContain('id: "budget",');
  });

  it("none of the four action definitions (label/href/icon/colors) were deleted", () => {
    expect(source).toContain('label: "Thêm giao dịch",');
    expect(source).toContain('label: "Tạo ví tiền",');
    expect(source).toContain('label: "Tạo mục tiêu",');
    expect(source).toContain('label: "Tạo ngân sách",');
    expect(source).toContain('buildQuickActionCreateHref("/transactions")');
    expect(source).toContain('buildQuickActionCreateHref("/wallets")');
    expect(source).toContain('buildQuickActionCreateHref("/goals")');
    expect(source).toContain('buildQuickActionCreateHref("/budgets")');
  });

  function extractVisibilityMapSource() {
    const start = source.indexOf(
      "const QUICK_ACTION_VISIBILITY: Record<string, boolean> = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("};", start);
    return source.slice(start, end);
  }

  it("only 'transaction' is enabled — wallet/goal/budget are hidden via the visibility map, not deleted", () => {
    const mapSource = extractVisibilityMapSource();
    expect(mapSource).toContain("transaction: true");
    expect(mapSource).toContain("wallet: false");
    expect(mapSource).toContain("goal: false");
    expect(mapSource).toContain("budget: false");
  });

  it("the visibility map keys off the stable id, not the fragile display label", () => {
    const mapSource = extractVisibilityMapSource();
    expect(mapSource).not.toContain("Thêm giao dịch");
    expect(mapSource).not.toContain("Tạo ví tiền");
  });

  it("VISIBLE_QUICK_ACTIONS is derived by filtering on QUICK_ACTION_VISIBILITY[action.id], not a second hand-written list", () => {
    expect(source).toContain(
      "const VISIBLE_QUICK_ACTIONS = QUICK_ACTIONS.filter(",
    );
    expect(source).toContain("QUICK_ACTION_VISIBILITY[action.id]");
  });

  it("both the desktop stack and the mobile panel render VISIBLE_QUICK_ACTIONS — no separately duplicated filtered list", () => {
    expect(source).toContain("return VISIBLE_QUICK_ACTIONS.map((action) =>");
    expect(source).toContain("{VISIBLE_QUICK_ACTIONS.map((action) => {");

    // Every occurrence of "QUICK_ACTIONS.map(" in the file is part of
    // "VISIBLE_QUICK_ACTIONS.map(" — i.e. the raw, unfiltered QUICK_ACTIONS
    // array is only ever consumed by the .filter() that builds
    // VISIBLE_QUICK_ACTIONS, never mapped over directly for rendering.
    const totalMapOccurrences = source.split("QUICK_ACTIONS.map(").length - 1;
    const visibleMapOccurrences =
      source.split("VISIBLE_QUICK_ACTIONS.map(").length - 1;
    expect(visibleMapOccurrences).toBe(2); // desktop stack + mobile panel
    expect(totalMapOccurrences).toBe(visibleMapOccurrences);
  });

  it("the mobile panel drops the 2x2 grid for a single compact row once only one action is visible — never an empty-celled grid", () => {
    expect(source).toContain(
      "const IS_SINGLE_MOBILE_ACTION = VISIBLE_QUICK_ACTIONS.length <= 1;",
    );
    expect(source).toContain("grid grid-cols-2 gap-2");
    expect(source).toContain("IS_SINGLE_MOBILE_ACTION");
  });

  it("the single-action layout still uses a known/fixed width matched to the positioning math (consistent with the grid case)", () => {
    expect(source).toContain("const MOBILE_SINGLE_ACTION_WIDTH = ");
    expect(source).toContain("const MOBILE_SINGLE_ACTION_HEIGHT = ");
    expect(source).toContain("width: EFFECTIVE_MOBILE_PANEL_WIDTH");
  });

  it("drag architecture, localStorage persistence, and smart FAB-relative menu positioning remain untouched by this visibility-only patch", () => {
    expect(source).toContain("requestAnimationFrame(() => {");
    expect(source).toContain("computeDraggedPosition(");
    expect(source).toContain("computeQuickActionPanelPosition(");
    expect(source).toContain(
      'const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";',
    );
    expect(source).toContain("if (suppressNextClickRef.current) {");
  });
});

describe("AppShell temporarily hides the floating AI launcher only", () => {
  const source = readFileSync(
    path.resolve(__dirname, "AppShell.tsx"),
    "utf8",
  );

  it("gates AIFloatingButton behind a named, easily-reversible flag rather than deleting or CSS-hiding it", () => {
    expect(source).toContain("const SHOW_AI_FLOATING_BUTTON = false;");
    expect(source).toContain(
      "{SHOW_AI_FLOATING_BUTTON && !aiAgentOpen && !isGlobalFabSuppressed && (",
    );
  });

  it("does not touch the existing suppression conditions (!aiAgentOpen / !isGlobalFabSuppressed) — only adds to them", () => {
    // Only one gated AIFloatingButton render site, and it's the same
    // suppression logic as before, just with the new flag ANDed in front.
    expect(source.split("<AIFloatingButton").length - 1).toBe(1);
  });

  it("the QuickActionFab render site is untouched by this ticket — the Quick Action FAB itself must remain visible", () => {
    expect(source).toContain(
      "{!aiAgentOpen && !isGlobalFabSuppressed && <QuickActionFab />}",
    );
  });

  it("the AI drawer/history/pending-actions mount (AIAgentDrawer) and its hasOpenedAI gating are untouched — implementation stays intact, only the floating launcher is hidden", () => {
    expect(source).toContain("{hasOpenedAI && (");
    expect(source).toContain("<AIAgentDrawer");
    expect(source).toContain("open={aiAgentOpen}");
  });

  it("AIFloatingButton is still imported (not deleted) even though temporarily ungated to render", () => {
    expect(source).toContain(
      'import AIFloatingButton from "@/src/components/ai-agent/AIFloatingButton";',
    );
  });
});
