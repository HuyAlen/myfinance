import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");

function readFrontend(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const transactionsPage = readFrontend(
  "src/components/transactions/TransactionsPage.tsx",
);
const transactionsSupport = readFrontend(
  "src/components/transactions/transactionPageSupport.ts",
);
const savingsPage = readFrontend("src/components/savings/SavingsPage.tsx");
const savingsSupport = readFrontend(
  "src/components/savings/savingsPageSupport.tsx",
);

describe("CLIENT-PAGE-DECOMPOSITION-1 — P2", () => {
  it("moves transaction page-local pure support out of the client page", () => {
    expect(transactionsPage).toContain(
      'from "./transactionPageSupport";',
    );
    expect(transactionsSupport).toContain(
      "export function compareTransactionNewestFirst",
    );
    expect(transactionsSupport).toContain(
      "export function getVisiblePageNumbers",
    );
    expect(transactionsSupport).toContain(
      "export function createEmptyForm",
    );

    expect(transactionsPage.split("\n").length).toBeLessThan(4700);
  });

  it("moves savings page-local model/format support out of the client page", () => {
    expect(savingsPage).toContain(
      'from "./savingsPageSupport";',
    );
    expect(savingsSupport).toContain(
      "export const mapSavingRowToSaving",
    );
    expect(savingsSupport).toContain(
      "export const getSavingFormConfig",
    );
    expect(savingsSupport).toContain(
      "export const getTransactionIcon",
    );

    expect(savingsPage.split("\n").length).toBeLessThan(2900);
  });

  it("keeps extracted support free of React state/effect orchestration and finance mutations", () => {
    for (const support of [transactionsSupport, savingsSupport]) {
      expect(support).not.toContain('"use client"');
      expect(support).not.toMatch(/\buse(State|Effect|Memo|Callback|Ref)\b/);
      expect(support).not.toContain("financeStorage");
      expect(support).not.toContain("supabase.");
      expect(support).not.toContain("useRealtimeTable");
    }
  });

  it("keeps transaction reads, realtime coordination, and mutations in TransactionsPage", () => {
    expect(transactionsPage).toContain("getTransactionsInRange(");
    expect(transactionsPage).toContain("getCategories(");
    expect(transactionsPage).toContain("getWallets(");
    expect(transactionsPage).toContain("addTransaction(");
    expect(transactionsPage).toContain("updateTransaction(");
    expect(transactionsPage).toContain("deleteTransaction(");
    expect(transactionsPage).toContain("useRealtimeTable(");
  });

  it("keeps Savings Engine, Supabase reads, realtime coordination, and mutations in SavingsPage", () => {
    expect(savingsPage).toContain("createSavingAccount({");
    expect(savingsPage).toContain("createSavingMovement({");
    expect(savingsPage).toContain("deleteSavingAccount(");
    expect(savingsPage).toContain('.from("savings")');
    expect(savingsPage).toContain('.from("saving_transactions")');
    expect(savingsPage).toContain("useRealtimeTable(");
  });

  it("keeps page components as the only client orchestration entrypoints", () => {
    expect(transactionsPage).toMatch(/^"use client";/);
    expect(savingsPage).toMatch(/^"use client";/);
    expect(transactionsPage).toContain(
      "export default function TransactionsPage()",
    );
    expect(savingsPage).toContain(
      "export default function SavingsPage(",
    );
  });
});