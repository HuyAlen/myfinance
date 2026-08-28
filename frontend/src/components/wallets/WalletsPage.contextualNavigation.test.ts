import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("WalletsPage contextual entity focus", () => {
  const source = readFileSync(path.resolve(__dirname, "WalletsPage.tsx"), "utf8");

  it("parses walletId through the canonical navigation helper", () => {
    expect(source).toContain('parseFocusId(searchParams, "walletId")');
  });

  it("waits for the authoritative spendable-wallet snapshot before focusing", () => {
    expect(source).toContain(
      "if (!spendableWallets.some((wallet) => wallet.id === focusWalletId)) return;",
    );
    expect(source).toContain('document.getElementById(`wallet-card-${focusWalletId}`)');
  });

  it("assigns stable ids and briefly highlights the requested card", () => {
    expect(source).toContain('id={`wallet-card-${wallet.id}`}');
    expect(source).toContain("highlightedWalletId === wallet.id");
    expect(source).toContain('scrollIntoView({ behavior: "smooth", block: "center" })');
  });
});
