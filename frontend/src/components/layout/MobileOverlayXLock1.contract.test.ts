import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

const overlayOwners = [
  "src/components/ui/AppModal.tsx",
  "src/components/ui/ConfirmDialog.tsx",
  "src/components/transactions/TransactionsPage.tsx",
  "src/components/transactions/TransactionCsvImportModal.tsx",
  "src/components/transactions/TransactionRulesManager.tsx",
  "src/components/wallets/WalletsPage.tsx",
  "src/components/goals/GoalsPage.tsx",
  "src/components/budgets/BudgetsPage.tsx",
  "src/components/debts/DebtsPage.tsx",
  "src/components/categories/CategoriesPage.tsx",
  "src/components/investments/InvestmentsPage.tsx",
  "src/components/recurring/RecurringMoneyPage.tsx",
  "src/components/activity/ActivityPage.tsx",
  "src/components/dashboard/DashboardPage.tsx",
].map((relativePath) => ({ relativePath, source: read(relativePath) }));

function fixedOverlayClassNames(source: string) {
  return [...source.matchAll(/className="([^"]*fixed inset-0[^"]*)"/g)].map(
    (match) => match[1],
  );
}

function verticalScrollerClassNames(source: string) {
  return [...source.matchAll(/className="([^"]*overflow-y-auto[^"]*)"/g)].map(
    (match) => match[1],
  );
}

describe("MOBILE-OVERLAY-X-LOCK-1", () => {
  it("locks horizontal overflow on every full-screen popup/sheet overlay owner", () => {
    for (const { relativePath, source } of overlayOwners) {
      const overlays = fixedOverlayClassNames(source);
      expect(overlays.length, `${relativePath} should own an overlay`).toBeGreaterThan(0);
      for (const className of overlays) {
        expect(
          className,
          `${relativePath} fixed overlay must clip horizontal overflow`,
        ).toContain("overflow-x-hidden");
      }
    }
  });

  it("locks x overflow on modal vertical scrollers while preserving y scrolling", () => {
    for (const { relativePath, source } of overlayOwners) {
      for (const className of verticalScrollerClassNames(source)) {
        expect(
          className,
          `${relativePath} vertical scroller must not become an x scroller on iOS`,
        ).toContain("overflow-x-hidden");
      }
    }
  });

  it("hardens the transaction editor form that reproduced the iPhone sideways drag", () => {
    const transactions = read("src/components/transactions/TransactionsPage.tsx");
    const formStart = transactions.indexOf('id="transaction-form"');
    const formEnd = transactions.indexOf("{/* Modal footer", formStart);
    const formRegion = transactions.slice(formStart, formEnd > formStart ? formEnd : undefined);

    expect(formStart).toBeGreaterThan(-1);
    expect(formRegion).toContain("overflow-x-hidden");
    expect(formRegion).toContain("overflow-y-auto");
  });

  it("keeps intentional inner horizontal controls available", () => {
    const transactions = read("src/components/transactions/TransactionsPage.tsx");
    const csv = read("src/components/transactions/TransactionCsvImportModal.tsx");

    // Quick amount chips and wide CSV preview may scroll inside their own
    // bounded region; only the popup shell/body is forbidden from drifting.
    expect(transactions).toContain("overflow-x-auto");
    expect(csv).toContain("overflow-x-auto");
  });
});
