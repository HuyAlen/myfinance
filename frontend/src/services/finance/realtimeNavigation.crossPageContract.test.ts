import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("REALTIME-NAV-INTEGRITY-1 cross-page contract", () => {
  it("Budgets listens to categories because planning-group semantics depend on them", () => {
    const source = read("components/budgets/BudgetsPage.tsx");
    expect(source).toContain(
      'useRealtimeTable(["budgets", "transactions", "categories"], reloadData)',
    );
  });

  it("Goals keeps all direct funding dependencies in its realtime contract", () => {
    const source = read("components/goals/GoalsPage.tsx");
    expect(source).toContain(
      'useRealtimeTable(["goals", "transactions", "savings"], reloadData)',
    );
  });

  it("Investments uses the shared realtime owner for Portfolio, Forex and wallet dependencies", () => {
    const source = read("components/investments/InvestmentsPage.tsx");
    expect(source).toContain(
      '["investments", "forex_accounts", "forex_cash_transactions", "wallets"]',
    );
    expect(source).not.toContain('supabase.channel("investments-domain-page")');
  });

  it("Wallet and Saving builders remain entity-focus links, not page-local filter contracts", () => {
    const source = read("lib/navigation/financeNavigation.ts");
    expect(source).toContain('return buildHref("/wallets", { walletId: context.walletId });');
    expect(source).toContain('return buildHref("/savings", { savingId: context.savingId });');
  });
});
