import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-EDIT-WALLET-UI-POLISH-1", () => {
  it("lets type and linked-wallet fields use full width in edit mode", () => {
    expect(source.match(
      /<label className=\{`col-span-2 min-w-0 \$\{isEditing \? "" : "sm:col-span-1"\}`\}>/g,
    )?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not concatenate wallet name and balance inside the native select", () => {
    expect(source).toContain("{wallet.name}");
    expect(source).not.toContain(
      "{wallet.name} · {formatCurrency(wallet.balance)}",
    );
    expect(source).toContain("title={selectedInitialWallet?.name}");
  });

  it("shows selected wallet balance in a dedicated non-clipping helper row", () => {
    expect(source).toContain("data-saving-wallet-balance");
    expect(source).toContain("{selectedInitialWallet.name}");
    expect(source).toContain(
      "{formatCurrency(selectedInitialWallet.balance)}",
    );
    expect(source).toContain("shrink-0 font-black tabular-nums");
  });

  it("keeps the wallet control responsive and focused", () => {
    expect(source).toContain(
      "w-full min-w-0 truncate rounded-xl border border-slate-200",
    );
    expect(source).toContain("pr-10");
    expect(source).toContain("focus:border-blue-300");
    expect(source).toContain("focus:ring-4 focus:ring-blue-100");
  });
});
