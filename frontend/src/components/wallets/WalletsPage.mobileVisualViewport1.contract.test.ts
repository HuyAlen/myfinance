import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function viewportOverlayRegion(marker: string) {
  const markerText = `data-wallets-mobile-viewport="${marker}"`;
  const start = source.indexOf(markerText);
  expect(start, `missing wallet viewport marker: ${marker}`).toBeGreaterThan(-1);
  return source.slice(start, start + 900);
}

describe("WALLETS-MOBILE-VISUAL-VIEWPORT-1", () => {
  it("tracks the real iPhone visual viewport only while a Wallet overlay is open", () => {
    expect(source).toContain("const isWalletOverlayOpen =");
    expect(source).toContain("window.visualViewport");
    expect(source).toContain('"--wallets-visual-viewport-height"');
    expect(source).toContain('"--wallets-visual-viewport-offset-top"');
    expect(source).toContain('viewport?.addEventListener("resize", syncWalletsVisualViewport)');
    expect(source).toContain('viewport?.addEventListener("scroll", syncWalletsVisualViewport)');
    expect(source).toContain('window.addEventListener("orientationchange", syncWalletsVisualViewport)');
    expect(source).toContain('root.style.removeProperty("--wallets-visual-viewport-height")');
    expect(source).toContain('root.style.removeProperty("--wallets-visual-viewport-offset-top")');
    expect(source).toContain("}, [isWalletOverlayOpen]);");
  });

  it("binds transfer, reconciliation, wallet form, and delete overlays to the visual viewport", () => {
    for (const marker of ["transfer", "reconcile", "form", "delete"]) {
      const region = viewportOverlayRegion(marker);
      expect(region).toContain(
        'top: "var(--wallets-visual-viewport-offset-top, 0px)"',
      );
      expect(region).toContain(
        'height: "var(--wallets-visual-viewport-height, 100dvh)"',
      );
    }

    expect(source.match(/data-wallets-mobile-viewport=/g)).toHaveLength(4);
  });

  it("sizes the three action modals from the visual-viewport parent instead of h-dvh", () => {
    expect(source).not.toContain(
      'className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl',
    );
    expect(
      source.match(
        /className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-\[calc\(100dvh-2rem\)\]/g,
      ),
    ).toHaveLength(3);
  });

  it("keeps only modal content scrollable while action footers stay safe-area aware", () => {
    expect(
      source.match(
        /min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain/g,
      )?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(
      source.match(/shrink-0 border-t border-slate-100 bg-white/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(source.match(/env\(safe-area-inset-bottom\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("uses the same overlay-open state for visual viewport tracking and global FAB suppression", () => {
    expect(source).toContain(
      "isFormOpen || isTransferOpen || !!reconcileTarget || !!deleteTarget",
    );
    expect(source).toContain(
      "useSuppressGlobalFabsWhileOpen(isWalletOverlayOpen);",
    );
  });
});
