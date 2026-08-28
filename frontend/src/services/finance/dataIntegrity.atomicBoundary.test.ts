import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const storage = readFileSync(path.resolve(__dirname, "financeStorage.ts"), "utf8").replace(/\r\n/g, "\n");
const schema = readFileSync(path.resolve(__dirname, "../../../../supabase/schema.sql"), "utf8").replace(/\r\n/g, "\n");
const investments = readFileSync(path.resolve(__dirname, "../../components/investments/InvestmentsPage.tsx"), "utf8").replace(/\r\n/g, "\n");
const pendingRepo = readFileSync(path.resolve(__dirname, "ai-agent/server/aiPendingActionRepository.server.ts"), "utf8").replace(/\r\n/g, "\n");
const writeExecutor = readFileSync(path.resolve(__dirname, "ai-agent/server/aiWriteActionExecutor.server.ts"), "utf8").replace(/\r\n/g, "\n");

describe("DATA-INTEGRITY-2 database authority", () => {
  it("validates every client-supplied finance wallet effect server-side", () => {
    expect(schema).toContain("FUNCTION public.assert_finance_transaction_effects");
    expect(schema.match(/PERFORM public\.assert_finance_transaction_effects\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(schema).toContain("Client wallet effects do not match transaction semantics");
    expect(schema).toContain("Category not found or type mismatch");
  });

  it("routes category and Forex-account deletion through atomic RPCs with no direct-delete fallback", () => {
    const categoryStart = storage.indexOf("export async function deleteCategory(");
    const categoryEnd = storage.indexOf("// ─── Budget CRUD", categoryStart);
    const categoryDelete = storage.slice(categoryStart, categoryEnd);
    expect(categoryDelete).toContain('supabase.rpc("delete_category_atomic"');
    expect(categoryDelete).not.toContain(".delete()");

    const forexStart = storage.indexOf("export async function deleteForexAccount(");
    const forexEnd = storage.indexOf("// ─── Forex Cash Transaction CRUD", forexStart);
    const forexDelete = storage.slice(forexStart, forexEnd);
    expect(forexDelete).toContain('supabase.rpc("delete_forex_account_atomic"');
    expect(forexDelete).not.toContain(".delete()");
  });

  it("centralizes Forex account and cash-ledger mutation ownership in financeStorage", () => {
    expect(storage).toContain("current_equity: account.currentEquity ?? null");
    expect(investments).toContain("await updateForexAccount(account)");
    expect(investments).toContain("await addForexAccount(account)");
    expect(investments).toContain("await updateForexCashTransaction(transaction)");
    expect(investments).toContain("await addForexCashTransaction(transaction)");
    expect(investments).toContain("await deleteForexCashTransaction(transaction.id)");
    expect(investments).not.toContain('.from("forex_accounts").insert(');
    expect(investments).not.toContain('.from("forex_accounts").update(');
    expect(investments).not.toContain('rpc("create_forex_cash_transaction"');
    expect(investments).not.toContain('rpc("update_forex_cash_transaction"');
    expect(investments).not.toContain('rpc("delete_forex_cash_transaction"');
  });
});

describe("DATA-INTEGRITY-2 AI write claim", () => {
  it("uses compare-and-set pending -> executing so concurrent confirmations cannot both execute", () => {
    expect(pendingRepo).toContain("export async function updatePendingActionIfStatus");
    expect(pendingRepo).toContain('.eq("status", input.expectedStatus)');
    expect(writeExecutor).toContain('expectedStatus: "pending"');
    expect(writeExecutor).toContain('status: "executing"');
    expect(writeExecutor).toContain('throw new Error("PENDING_ACTION_IN_PROGRESS")');
  });
});
