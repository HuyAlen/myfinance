import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(frontendRoot, "..");

function readRepo(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8").replace(
    /\r\n/g,
    "\n",
  );
}

const migration = readRepo(
  "frontend/supabase/ai-pending-action-atomic-execution-1.sql",
);
const schema = readRepo("supabase/schema.sql");
const verification = readRepo("supabase/schema-verification.sql");
const executor = readRepo(
  "frontend/src/services/finance/ai-agent/server/aiWriteActionExecutor.server.ts",
);
const route = readRepo(
  "frontend/app/api/ai-finance/actions/[actionId]/confirm/route.ts",
);
const databaseTypes = readRepo("frontend/src/lib/database.types.ts");

describe("AI-PENDING-ACTION-ATOMIC-EXECUTION-1 — P1", () => {
  it("ships a forward migration and canonical RPC definition", () => {
    for (const source of [migration, schema]) {
      expect(source).toContain(
        "CREATE OR REPLACE FUNCTION public.execute_ai_pending_action_atomic",
      );
      expect(source).toContain("RETURNS jsonb");
      expect(source).toContain("SECURITY INVOKER");
      expect(source).toContain("SET search_path = public, pg_temp");
    }
  });

  it("serializes confirmation with a database row lock", () => {
    expect(migration).toMatch(
      /FROM public\.ai_pending_actions[\s\S]*WHERE id = p_action_id[\s\S]*user_id = v_actor_user_id[\s\S]*FOR UPDATE;/,
    );
  });

  it("uses stable household finance-owner identity while retaining actor identity", () => {
    expect(migration).toContain(
      "v_finance_owner_user_id := public.current_finance_write_owner_user_id();",
    );
    expect(migration).toContain("confirmed_by = v_actor_user_id");
    expect(migration).toContain("v_actor_user_id,");
    expect(migration).toContain("v_finance_owner_user_id,");
  });

  it("supports exactly the three currently executable AI write tools", () => {
    expect(migration).toContain("WHEN 'create_budget' THEN");
    expect(migration).toContain("WHEN 'update_budget' THEN");
    expect(migration).toContain("WHEN 'create_goal' THEN");
    expect(migration).toContain("Unsupported AI write tool");
  });

  it("rolls finance mutation failure back before persisting failed action receipt", () => {
    expect(migration).toContain(
      "PL/pgSQL exception blocks are subtransactions",
    );
    expect(migration).toContain("EXCEPTION");
    expect(migration).toContain("WHEN OTHERS THEN");
    expect(migration).toContain("status = 'failed'");
    expect(migration).toContain("'outcome', 'failed'");
  });

  it("commits mutation, completion receipt and AI audit in one outer transaction", () => {
    const completion = migration.indexOf("status = 'completed'", migration.indexOf("BEGIN\n    CASE"));
    const audit = migration.indexOf(
      "INSERT INTO public.ai_action_audit_logs",
      completion,
    );
    const returned = migration.indexOf("'outcome', 'completed'", audit);

    expect(completion).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(completion);
    expect(returned).toBeGreaterThan(audit);
  });

  it("makes committed retries idempotent and old ambiguous executing rows fail closed", () => {
    expect(migration).toContain("IF v_action.status = 'completed' THEN");
    expect(migration).toContain(
      "v_action.executed_at IS NULL AND v_action.result IS NULL",
    );
    expect(migration).toContain("'outcome', 'in_progress'");
  });

  it("removes direct Budget/Goal mutations from the Node executor", () => {
    expect(executor).toContain(
      '.rpc(\n    "execute_ai_pending_action_atomic"',
    );
    expect(executor).not.toContain('.from("budgets")');
    expect(executor).not.toContain('.from("goals")');
    expect(executor).not.toContain("randomUUID");
  });

  it("maps atomic outcomes to the existing pending-action API contract", () => {
    for (const error of [
      "PENDING_ACTION_NOT_FOUND",
      "PENDING_ACTION_EXPIRED",
      "PENDING_ACTION_CANCELLED",
      "PENDING_ACTION_FAILED",
      "PENDING_ACTION_FORBIDDEN",
      "PENDING_ACTION_IN_PROGRESS",
      "PENDING_ACTION_INVALID_RECEIPT",
    ]) {
      expect(executor).toContain(error);
    }

    expect(route).toContain('if (message === "PENDING_ACTION_FORBIDDEN") return 403;');
    expect(route).toContain(
      'if (message === "PENDING_ACTION_INVALID_RECEIPT") return 502;',
    );
  });

  it("registers the RPC in TypeScript types and read-only schema verification", () => {
    expect(databaseTypes).toContain("execute_ai_pending_action_atomic:");
    expect(databaseTypes).toContain("p_action_id: string");
    expect(verification).toContain("'execute_ai_pending_action_atomic'");
    expect(verification).toContain(
      "ai_pending_action_execution_is_security_invoker",
    );
    expect(verification).toContain("ai_pending_action_execution_has_row_lock");
    expect(verification).toContain(
      "ai_pending_action_execution_uses_household_write_owner",
    );
  });
});