import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.resolve(__dirname, "WalletsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

function handleSubmitSource() {
  const start = source.indexOf(
    "async function handleSubmit(event: React.FormEvent) {",
  );
  const end = source.indexOf("\n  async function handleDelete(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("WALLET-IDENTITY-UPDATE-INTEGRITY-1 Wallet form contract", () => {
  it("keeps the edit form open when updateWallet returns an integrity error", () => {
    const fn = handleSubmitSource();
    const updateCall = fn.indexOf("? await updateWallet(wallet)");
    const errorGate = fn.indexOf("if (error) {", updateCall);
    const reload = fn.indexOf("await runReload();", errorGate);
    const close = fn.indexOf("setIsFormOpen(false);", reload);

    expect(updateCall).toBeGreaterThan(-1);
    expect(errorGate).toBeGreaterThan(updateCall);
    expect(reload).toBeGreaterThan(errorGate);
    expect(close).toBeGreaterThan(reload);

    const errorBranch = fn.slice(errorGate, reload);
    expect(errorBranch).toContain("setSaveError(error);");
    expect(errorBranch).toContain("return;");
    expect(errorBranch).not.toContain("setIsFormOpen(false);");
  });

  it("closes and clears the form only after a successful update and reload", () => {
    const fn = handleSubmitSource();
    const updateCall = fn.indexOf("? await updateWallet(wallet)");
    const reload = fn.indexOf("await runReload();", updateCall);
    const close = fn.indexOf("setIsFormOpen(false);", reload);
    const clear = fn.indexOf("setForm(emptyForm);", close);

    expect(updateCall).toBeGreaterThan(-1);
    expect(reload).toBeGreaterThan(updateCall);
    expect(close).toBeGreaterThan(reload);
    expect(clear).toBeGreaterThan(close);
  });
});
