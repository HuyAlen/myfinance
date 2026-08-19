import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MOBILE QUICK ACTION TWO-ITEM POLISH.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching this file's established
 * convention.
 *
 * Root cause being fixed: with exactly 2 visible actions
 * ("Thêm giao dịch", "Mở Ví Tiền"), the panel previously used
 * `grid-cols-2` at the full 272px grid width, splitting the two labels
 * into ~120px-wide cells — too narrow for either Vietnamese label, forcing
 * `truncate` to ellipsize both ("Thêm ...", "Mở Ví ..."). This patch
 * switches the exactly-2 case to a vertical two-row stack sized to the
 * actual content, and removes `truncate` in favor of `whitespace-nowrap`.
 */
describe("QuickActionFab mobile two-action polish (full labels, compact panel)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "QuickActionFab.tsx"),
    "utf8",
  );

  function extractPanelSource() {
    const start = source.indexOf("function renderMobileActionPanel(");
    const end = source.indexOf("\n  }", start);
    return source.slice(start, end);
  }

  it("no action label uses truncate — full labels are the point of this patch", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).not.toContain("truncate");
    expect(panelSource).not.toContain("text-ellipsis");
    expect(panelSource).not.toContain("overflow-hidden");
  });

  it("labels use whitespace-nowrap, kept on one line", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("whitespace-nowrap");
  });

  it('both full labels ("Thêm giao dịch", "Mở Ví Tiền") are still defined verbatim — this is a presentation-only patch', () => {
    expect(source).toContain('label: "Thêm giao dịch",');
    expect(source).toContain('label: "Mở Ví Tiền",');
  });

  it("exactly 2 visible actions render as a vertical two-row stack (flex-col), not a 2-column grid", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("IS_TWO_ACTION_MOBILE_LAYOUT");
    expect(panelSource).toContain('"flex flex-col gap-1.5"');
  });

  it("the two-action panel has its own compact, dedicated width/height — within the ticket's suggested 200-220px / ~112-128px ranges", () => {
    expect(source).toContain("const MOBILE_TWO_ACTION_WIDTH = 208;");
    expect(source).toContain("const MOBILE_TWO_ACTION_HEIGHT = 120;");
  });

  it("the two-action width/height are NOT aliased to the full 4-item grid constants (272/144) or the old one-row assumption", () => {
    expect(source).not.toContain(
      "const MOBILE_TWO_ACTION_WIDTH = MOBILE_PANEL_WIDTH;",
    );
    expect(source).not.toContain(
      "const MOBILE_TWO_ACTION_HEIGHT = MOBILE_SINGLE_ACTION_HEIGHT;",
    );
  });

  it("the rendered panel's inline width style uses the same EFFECTIVE_MOBILE_PANEL_WIDTH constant the position math receives — no drift between the box and the placement calculation", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("width: EFFECTIVE_MOBILE_PANEL_WIDTH");

    const layoutEffectStart = source.indexOf(
      "computeQuickActionPanelPosition({",
    );
    const layoutEffectEnd = source.indexOf("});", layoutEffectStart);
    const callSource = source.slice(layoutEffectStart, layoutEffectEnd);
    expect(callSource).toContain("panelWidth: EFFECTIVE_MOBILE_PANEL_WIDTH");
    expect(callSource).toContain("panelHeight: EFFECTIVE_MOBILE_PANEL_HEIGHT");
  });

  it("row cells are compact (min-h-12, not the old min-h-14) and the panel padding is tighter (p-2, not p-3) — less wasted space", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("min-h-12");
    expect(panelSource).not.toContain("min-h-14");
    expect(panelSource).toContain("rounded-2xl border border-slate-200 bg-white p-2");
  });

  it("icon boxes stay within the 32-36px compact range (size-9 = 36px), glyph unchanged at 17px — icons were not enlarged", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).toContain("size-9");
    expect(panelSource).toContain("<Icon size={17}");
  });

  it("the FAB-to-panel gap constant is unchanged (already within the ticket's 8-10px target)", () => {
    expect(source).toContain("const MOBILE_PANEL_GAP = 10;");
  });

  it("no backdrop, modal, or bottom-sheet treatment was reintroduced", () => {
    const panelSource = extractPanelSource();
    expect(panelSource).not.toContain("inset-0");
    expect(panelSource).not.toContain("bg-slate-900");
    expect(panelSource).not.toContain("backdrop");
  });

  it("hidden actions (Tạo ví tiền / Tạo mục tiêu / Tạo ngân sách) remain hidden — visibility map untouched", () => {
    const start = source.indexOf(
      "const QUICK_ACTION_VISIBILITY: Record<string, boolean> = {",
    );
    const end = source.indexOf("};", start);
    const mapSource = source.slice(start, end);

    expect(mapSource).toContain("transaction: true");
    expect(mapSource).toContain('"open-wallets": true');
    expect(mapSource).toContain("wallet: false");
    expect(mapSource).toContain("goal: false");
    expect(mapSource).toContain("budget: false");
  });

  it("the desktop action stack is untouched by this mobile-only patch", () => {
    expect(source).toContain("hidden flex-col items-end gap-2 lg:flex");
    expect(source).toContain("return VISIBLE_QUICK_ACTIONS.map((action) =>");
  });

  it("drag architecture (Pointer Events, rAF, translate3d, threshold, localStorage, click suppression) is completely untouched", () => {
    expect(source).toContain("function handlePointerDown(");
    expect(source).toContain("function handlePointerMove(");
    expect(source).toContain("function handlePointerUp(");
    expect(source).toContain("function handlePointerCancel(");
    expect(source).toContain("requestAnimationFrame(() => {");
    expect(source).toContain(
      "wrapperRef.current.style.transform = `translate3d(${latest.x}px, ${latest.y}px, 0)`;",
    );
    expect(source).toContain("const DRAG_THRESHOLD = 5;");
    expect(source).toContain(
      'const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";',
    );
    expect(source).toContain("const suppressNextClickRef = useRef(false);");
  });

  it("smart FAB-relative positioning (above/below, left/right) is untouched — only the input dimensions changed, not the algorithm", () => {
    expect(source).toContain("computeQuickActionPanelPosition(");
    expect(source).not.toContain("function computeQuickActionPanelPosition(");
  });
});
