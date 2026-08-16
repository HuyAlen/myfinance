import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md).
 *
 * `selectedWalletBalance` falls back to 0 whenever the wallet lookup
 * misses — including when the miss is really "wallet data never loaded",
 * not "this wallet genuinely has 0 balance". Proves the fix: a
 * walletsLoadError flag distinguishes the two, so the balance UI shows a
 * neutral message (and suppresses the derived "insufficient balance"
 * warning) instead of asserting 0 as an authoritative balance.
 */
describe("SavingsPage distinguishes an unknown wallet balance from a real zero (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "SavingsPage.tsx"),
    "utf8",
  );

  it("declares walletsLoadError state", () => {
    expect(source).toContain("walletsLoadError");
  });

  it("both wallet-load paths (mount load and edit-time refresh) clear the error on success and set it on failure", () => {
    const mountStart = source.indexOf(
      "async function loadWalletsForSavingsEngine() {",
    );
    const refreshStart = source.indexOf(
      "async function refreshSelectedWalletBalance() {",
    );
    expect(mountStart).toBeGreaterThan(-1);
    expect(refreshStart).toBeGreaterThan(-1);

    const mountEnd = source.indexOf(
      "void loadWalletsForSavingsEngine();",
      mountStart,
    );
    const refreshEnd = source.indexOf(
      "void refreshSelectedWalletBalance();",
      refreshStart,
    );
    const mountSource = source.slice(mountStart, mountEnd);
    const refreshSource = source.slice(refreshStart, refreshEnd);

    for (const fnSource of [mountSource, refreshSource]) {
      expect(fnSource).toContain("setWalletsLoadError(null)");
      expect(fnSource).toContain("setWalletsLoadError(");
    }
  });

  it("computes hasUnknownWalletBalance from a missing wallet + a load error, and uses it to gate the too-high-deposit warning", () => {
    const start = source.indexOf(
      "const hasUnknownWalletBalance = !selectedInitialWallet && !!walletsLoadError;",
    );
    expect(start).toBeGreaterThan(-1);
    expect(source).toContain("!hasUnknownWalletBalance &&");
  });

  it("the current-balance display shows a neutral message instead of a formatted 0 when the balance is unknown", () => {
    const normalized = source.replace(/\s+/g, " ");
    expect(normalized).toContain(
      'hasUnknownWalletBalance ? "Không thể tải số dư" : formatCurrency(selectedWalletBalance)',
    );
  });
});
