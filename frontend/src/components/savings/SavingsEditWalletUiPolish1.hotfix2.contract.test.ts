import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const mobileTest = readFileSync(
  path.resolve(__dirname, "SavingsPage.mobileSingleViewport.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-EDIT-WALLET-UI-POLISH-1 hotfix v2", () => {
  it("keeps edit fields full-width while create mode can remain two-column", () => {
    const responsiveClass =
      'className={`col-span-2 min-w-0 ${isEditing ? "" : "sm:col-span-1"}`}';

    expect(page.match(new RegExp(
      responsiveClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g",
    ))?.length).toBeGreaterThanOrEqual(2);

    expect(mobileTest).toContain(responsiveClass);
    expect(mobileTest).not.toContain(
      'className="col-span-2 min-w-0 sm:col-span-1"',
    );
  });

  it("keeps the non-clipping wallet presentation intact", () => {
    expect(page).toContain("data-saving-wallet-balance");
    expect(page).toContain("{selectedInitialWallet.name}");
    expect(page).toContain("{formatCurrency(selectedInitialWallet.balance)}");
    expect(page).toContain("title={selectedInitialWallet?.name}");
  });
});
