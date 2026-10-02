import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  path.resolve(__dirname, "SavingsPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const mobileTest = readFileSync(
  path.resolve(__dirname, "SavingsPage.mobileCompactHierarchy.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const polishTest = readFileSync(
  path.resolve(__dirname, "SavingsPage.polish3.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("SAVINGS-INTERNAL-TRANSFER-1 hotfix v2", () => {
  it("keeps legacy savings-card contracts aligned with the new four-action layout", () => {
    expect(mobileTest).toContain(
      'expect(accounts).toContain("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4");',
    );
    expect(polishTest).toContain(
      'expect(accounts).toContain("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4");',
    );
    expect(mobileTest).not.toContain(
      'expect(accounts).toContain("mt-3 grid grid-cols-3 gap-2");',
    );
    expect(polishTest).not.toContain(
      'expect(accounts).toContain("mt-3 grid grid-cols-3 gap-2");',
    );
  });

  it("preserves all four direct money actions", () => {
    expect(page).toContain('openMoneyMovementModal(item, "deposit")');
    expect(page).toContain('openMoneyMovementModal(item, "withdraw")');
    expect(page).toContain("openInternalTransfer(item)");
    expect(page).toContain("openHistoryModal(item)");
    expect(page).toContain("mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4");
  });
});
