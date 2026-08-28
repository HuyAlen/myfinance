import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("GOAL-SAVINGS-SSOT-1 storage compatibility migration", () => {
  const source = readFileSync(path.resolve(__dirname, "financeStorage.ts"), "utf8");

  it("namespaces new Saving and legacy Category links inside the existing text[] column", () => {
    expect(source).toContain('const GOAL_SAVING_LINK_PREFIX = "saving:"');
    expect(source).toContain('const GOAL_CATEGORY_LINK_PREFIX = "category:"');
    expect(source).toContain("saving_category_ids: encodeGoalFundingLinks(goal)");
  });

  it("decodes namespaced links while deliberately preserving unprefixed legacy IDs for canonical resolution", () => {
    expect(source).toContain("function decodeGoalFundingLinks(row: GoalDbRow)");
    expect(source).toContain("rawLink.startsWith(GOAL_SAVING_LINK_PREFIX)");
    expect(source).toContain("rawLink.startsWith(GOAL_CATEGORY_LINK_PREFIX)");
    expect(source).toContain("savingCategoryIds.push(rawLink)");
  });

  it("exposes one hardened getSavings reader for Goal/Header/AI consumers", () => {
    expect(source).toContain("export async function getSavings(): Promise<SavingAccount[]>");
    expect(source).toContain('.from("savings")');
    expect(source).toContain('[financeStorage] getSavings:');
  });

  it("exposes a minimal cumulative Goal-funding transaction reader so period filters cannot change Goal progress", () => {
    expect(source).toContain(
      "export async function getGoalFundingTransactions(): Promise<Transaction[]>",
    );
    expect(source).toContain(
      '.select("id,type,amount,categoryId,walletId,note,date")',
    );
    expect(source).toContain('[financeStorage] getGoalFundingTransactions:');
  });
});
