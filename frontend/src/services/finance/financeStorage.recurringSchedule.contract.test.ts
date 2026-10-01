import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(__dirname, "financeStorage.ts"), "utf8");

function extract(name: string, nextName: string) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(`export async function ${nextName}`, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("RECURRING-MONEY-MANAGER-1 storage boundary", () => {
  it("updates only recurring metadata on category schedules", () => {
    const block = extract("updateCategoryRecurringSchedule", "deleteCategory");
    expect(block).toContain('.from("categories")');
    expect(block).toContain("is_recurring:");
    expect(block).toContain("default_amount:");
    expect(block).toContain("default_wallet_id:");
    expect(block).toContain("next_run_date:");
    expect(block).not.toContain('.from("transactions")');
  });

  it("updates only recurring metadata on legacy transactions and never replays wallet effects", () => {
    const block = extract("updateTransactionRecurringSchedule", "deleteTransaction");
    expect(block).toContain('.from("transactions")');
    expect(block).toContain("isRecurring:");
    expect(block).toContain("nextRunDate:");
    expect(block).not.toContain("update_finance_transaction");
    expect(block).not.toContain("getTransactionEffects");
    expect(block).not.toContain('.from("wallets")');
  });
  it("serializes paused category metadata instead of erasing it", () => {
    const start = source.indexOf("function toCategoryRow");
    const end = source.indexOf("type GoalDbRow", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toContain("is_recurring: category.isRecurring ?? false");
    expect(block).toContain("recurrence: category.recurrence ?? null");
    expect(block).toContain("default_amount: category.defaultAmount ?? null");
    expect(block).toContain("default_wallet_id: category.defaultWalletId ?? null");
    expect(block).toContain("next_run_date: category.nextRunDate ?? null");
    expect(block).not.toContain("category.isRecurring ? (category.recurrence");
  });

});
