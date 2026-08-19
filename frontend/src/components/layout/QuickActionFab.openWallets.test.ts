import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADD "MỞ VÍ TIỀN" QUICK ACTION.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md), matching this file's established
 * convention (QuickActionFab.visibility.test.ts / .mobileMenu.test.ts).
 *
 * Proves: a genuinely distinct action id from "wallet" (the hidden
 * create-wallet action); a plain-navigation href to the canonical
 * `/wallets` route (NOT buildQuickActionCreateHref, so it can never open
 * the create-wallet modal); correct visibility; the hidden actions stay
 * hidden; and the mobile panel's two-visible-action dimensions were
 * updated (not left stale from the single-action patch), since
 * grid-cols-2 with exactly 2 children renders one row, not the full
 * two-row 2x2 grid MOBILE_PANEL_HEIGHT was sized for.
 */
describe('QuickActionFab "Mở Ví Tiền" navigation action', () => {
  const source = readFileSync(
    path.resolve(__dirname, "QuickActionFab.tsx"),
    "utf8",
  );

  function extractOpenWalletsActionSource() {
    const start = source.indexOf('id: "open-wallets",');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("},", start);
    return source.slice(start, end);
  }

  it('defines "open-wallets" as a stable id distinct from "wallet" (the hidden create-wallet action)', () => {
    const actionSource = extractOpenWalletsActionSource();
    expect(actionSource).toContain('id: "open-wallets",');
    expect(actionSource).not.toContain('id: "wallet",');
  });

  it('label is exactly "Mở Ví Tiền"', () => {
    const actionSource = extractOpenWalletsActionSource();
    expect(actionSource).toContain('label: "Mở Ví Tiền",');
  });

  it("href is a PLAIN navigation to the canonical /wallets route — not buildQuickActionCreateHref, so it can never open the create-wallet form", () => {
    const actionSource = extractOpenWalletsActionSource();
    expect(actionSource).toContain('href: "/wallets",');
    expect(actionSource).not.toContain("buildQuickActionCreateHref");
  });

  it("reuses the existing Wallet icon (same one Sidebar's own Ví Tiền link uses) — no new icon dependency", () => {
    const actionSource = extractOpenWalletsActionSource();
    expect(actionSource).toContain("icon: Wallet,");
  });

  it('is visible in QUICK_ACTION_VISIBILITY, alongside "transaction"', () => {
    const start = source.indexOf(
      "const QUICK_ACTION_VISIBILITY: Record<string, boolean> = {",
    );
    const end = source.indexOf("};", start);
    const mapSource = source.slice(start, end);

    expect(mapSource).toContain('"open-wallets": true');
    expect(mapSource).toContain("transaction: true");
    expect(mapSource).toContain("wallet: false");
    expect(mapSource).toContain("goal: false");
    expect(mapSource).toContain("budget: false");
  });

  it("does not create any transaction/wallet/pending-action call — this is navigation only, no mutation", () => {
    const actionSource = extractOpenWalletsActionSource();
    expect(actionSource).not.toContain("addTransaction");
    expect(actionSource).not.toContain("addWallet");
    expect(actionSource).not.toContain("PendingAction");
  });

  it('desktop and mobile both render "Mở Ví Tiền" via the SAME VISIBLE_QUICK_ACTIONS list — no separate registry for the new action', () => {
    expect(source).toContain("return VISIBLE_QUICK_ACTIONS.map((action) =>");
    expect(source).toContain("{VISIBLE_QUICK_ACTIONS.map((action) => {");
  });

  it("with exactly 2 visible actions, the mobile panel uses the grid layout (grid-cols-2 renders 2 items as one row, not the old single-action flex card)", () => {
    expect(source).toContain(
      "const IS_TWO_ACTION_MOBILE_LAYOUT = VISIBLE_QUICK_ACTIONS.length === 2;",
    );
  });

  it("the two-action mobile panel width matches the full grid width (two side-by-side cells), not the narrower single-action width", () => {
    expect(source).toContain(
      "const MOBILE_TWO_ACTION_WIDTH = MOBILE_PANEL_WIDTH;",
    );
  });

  it("the two-action mobile panel height is ONE row's height, not the stale two-row 2x2 grid height (MOBILE_PANEL_HEIGHT) — no leftover empty vertical space", () => {
    expect(source).toContain(
      "const MOBILE_TWO_ACTION_HEIGHT = MOBILE_SINGLE_ACTION_HEIGHT;",
    );
  });

  it("EFFECTIVE_MOBILE_PANEL_WIDTH/HEIGHT resolve through all three cases (1, 2, and the fallback 3/4) in that priority order", () => {
    const start = source.indexOf(
      "const EFFECTIVE_MOBILE_PANEL_WIDTH = IS_SINGLE_MOBILE_ACTION",
    );
    const end = source.indexOf(
      ": MOBILE_PANEL_HEIGHT;",
      source.indexOf(
        "const EFFECTIVE_MOBILE_PANEL_HEIGHT = IS_SINGLE_MOBILE_ACTION",
        start,
      ),
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const effectiveSource = source.slice(start, end);

    expect(effectiveSource).toContain("IS_SINGLE_MOBILE_ACTION");
    expect(effectiveSource).toContain("IS_TWO_ACTION_MOBILE_LAYOUT");
    expect(effectiveSource).toContain("MOBILE_SINGLE_ACTION_WIDTH");
    expect(effectiveSource).toContain("MOBILE_TWO_ACTION_WIDTH");
  });

  it("the panel sizing math (computeQuickActionPanelPosition call) consumes the same EFFECTIVE_ constants the render uses — no drift between position math and the actual box", () => {
    const layoutEffectStart = source.indexOf(
      "computeQuickActionPanelPosition({",
    );
    const layoutEffectEnd = source.indexOf("});", layoutEffectStart);
    const callSource = source.slice(layoutEffectStart, layoutEffectEnd);

    expect(callSource).toContain("panelWidth: EFFECTIVE_MOBILE_PANEL_WIDTH");
    expect(callSource).toContain("panelHeight: EFFECTIVE_MOBILE_PANEL_HEIGHT");
  });

  it("hidden actions (wallet/goal/budget) remain fully defined, just filtered out — not deleted", () => {
    expect(source).toContain('label: "Tạo ví tiền",');
    expect(source).toContain('label: "Tạo mục tiêu",');
    expect(source).toContain('label: "Tạo ngân sách",');
  });

  it("drag/rAF/translate3d/localStorage/click-vs-drag architecture is untouched by this ticket", () => {
    expect(source).toContain("requestAnimationFrame(() => {");
    expect(source).toContain("translate3d(${latest.x}px, ${latest.y}px, 0)");
    expect(source).toContain("computeDraggedPosition(");
    expect(source).toContain(
      'const POSITION_STORAGE_KEY = "myfinance:quick-action-fab-position";',
    );
    expect(source).toContain("if (suppressNextClickRef.current) {");
  });
});

describe("AppShell — AI Floating Button stays hidden (untouched by this ticket)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "AppShell.tsx"),
    "utf8",
  );

  it("SHOW_AI_FLOATING_BUTTON is still false", () => {
    expect(source).toContain("const SHOW_AI_FLOATING_BUTTON = false;");
  });
});
