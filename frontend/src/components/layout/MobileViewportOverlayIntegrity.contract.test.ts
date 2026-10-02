import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(/\r\n/g, "\n");

const appShell = read("src/components/layout/AppShell.tsx");
const header = read("src/components/layout/Header.tsx");
const bottomNav = read("src/components/layout/BottomNav.tsx");
const transactions = read("src/components/transactions/TransactionsPage.tsx");
const appModal = read("src/components/ui/AppModal.tsx");
const confirmDialog = read("src/components/ui/ConfirmDialog.tsx");
const dashboard = read("src/components/dashboard/DashboardPage.tsx");

const pageOverlaySources = [
  "src/components/wallets/WalletsPage.tsx",
  "src/components/goals/GoalsPage.tsx",
  "src/components/transactions/TransactionsPage.tsx",
  "src/components/transactions/TransactionCsvImportModal.tsx",
  "src/components/budgets/BudgetsPage.tsx",
  "src/components/activity/ActivityPage.tsx",
  "src/components/debts/DebtsPage.tsx",
  "src/components/dashboard/DashboardPage.tsx",
  "src/components/categories/CategoriesPage.tsx",
  "src/components/investments/InvestmentsPage.tsx",
].map(read);

const recurring = read("src/components/recurring/RecurringMoneyPage.tsx");

describe("cross-page viewport overlay integrity", () => {
  it("keeps finance-main as a plain shared content scroller without iOS stacking hacks", () => {
    expect(appShell).toContain(
      "finance-main min-h-0 flex-1 overflow-x-clip overflow-y-auto",
    );
    expect(appShell).not.toContain("[-webkit-overflow-scrolling:touch]");
  });

  it("covers every page family that owns a full-screen fixed overlay", () => {
    for (const source of pageOverlaySources) {
      expect(source).toContain("fixed inset-0");
    }

    expect(recurring).toContain('data-recurring-mobile-viewport="true"');
    expect(recurring).toContain("fixed inset-x-0 z-100");
    expect(recurring).toContain("--recurring-visual-viewport-height");
    expect(recurring).toContain("--recurring-visual-viewport-offset-top");
  });

  it("keeps the Transactions editor above the shared header and bottom navigation", () => {
    expect(header).toContain("sticky top-0 z-30");
    expect(bottomNav).toContain("fixed inset-x-0 bottom-0 z-50");
    expect(transactions).toMatch(/fixed\s+inset-0[^"]*\bz-100\b/);
  });

  it("standardizes reusable and Dashboard dialogs above global mobile chrome", () => {
    expect(appModal).toMatch(/fixed\s+inset-0[^"]*\bz-100\b/);
    expect(confirmDialog).toMatch(/fixed\s+inset-0[^"]*\bz-100\b/);
    expect(dashboard).toMatch(/fixed\s+inset-0[^"]*\bz-100\b/);
  });

  it("keeps the transaction type segment fully tappable on mobile", () => {
    const start = transactions.indexOf("{/* Type selector — premium segmented control */}");
    const end = transactions.indexOf("{/* Amount — hero input */}", start);
    const region = transactions.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(region).toContain("grid grid-cols-3");
    expect(region).toContain("min-h-11");
  });
});
