import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const schema = readFileSync(path.join(repoRoot, "supabase/schema.sql"), "utf8");
const verification = readFileSync(
  path.join(repoRoot, "supabase/schema-verification.sql"),
  "utf8",
);
const restoreMigration = readFileSync(
  path.join(
    repoRoot,
    "frontend/supabase/settings-recovery-integrity-1-backup-restore-guard.sql",
  ),
  "utf8",
);
const cloneMigration = readFileSync(
  path.join(
    repoRoot,
    "frontend/supabase/cross-domain-integrity-1-budget-clone-atomic.sql",
  ),
  "utf8",
);

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractRpcBlock(
  sql: string,
  functionName: string,
  grantIdentity: string,
) {
  const startNeedle = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const grantPrefix = `GRANT EXECUTE ON FUNCTION public.${grantIdentity}`;
  const start = sql.indexOf(startNeedle);
  if (start < 0) throw new Error(`Missing ${functionName} definition`);
  const grantStart = sql.indexOf(grantPrefix, start);
  if (grantStart < 0) throw new Error(`Missing ${functionName} authenticated grant`);
  const grantEnd = sql.indexOf(";", grantStart);
  if (grantEnd < 0) throw new Error(`Unterminated ${functionName} grant`);
  return normalize(sql.slice(start, grantEnd + 1));
}

function definitionCount(sql: string, functionName: string) {
  return (
    sql.match(
      new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${functionName}\\b`,
        "gi",
      ),
    ) ?? []
  ).length;
}

const canonicalRestore = extractRpcBlock(
  schema,
  "restore_finance_backup",
  "restore_finance_backup(jsonb)",
);
const migrationRestore = extractRpcBlock(
  restoreMigration,
  "restore_finance_backup",
  "restore_finance_backup(jsonb)",
);
const canonicalClone = extractRpcBlock(
  schema,
  "clone_previous_month_budgets_atomic",
  "clone_previous_month_budgets_atomic(text)",
);
const migrationClone = extractRpcBlock(
  cloneMigration,
  "clone_previous_month_budgets_atomic",
  "clone_previous_month_budgets_atomic(text)",
);
const normalizedVerification = normalize(verification);

describe("DB-SSOT-2 canonical recovery and cross-domain RPC parity", () => {
  it("keeps the hardened restore definition exactly aligned with the deployed migration", () => {
    expect(canonicalRestore).toBe(migrationRestore);
    expect(definitionCount(schema, "restore_finance_backup")).toBe(1);
  });

  it("keeps the atomic previous-month budget clone exactly aligned with the deployed migration", () => {
    expect(canonicalClone).toBe(migrationClone);
    expect(definitionCount(schema, "clone_previous_month_budgets_atomic")).toBe(1);
  });

  it("preserves restore serialization, post-verify rollback and verified receipt semantics", () => {
    expect(canonicalRestore).toContain("security definer");
    expect(canonicalRestore).toContain("lock table");
    for (const table of [
      "public.saving_transactions",
      "public.forex_cash_transactions",
      "public.transactions",
      "public.budgets",
      "public.categories",
      "public.savings",
      "public.forex_accounts",
      "public.wallets",
      "public.debts",
      "public.goals",
      "public.investments",
      "public.net_worth_snapshots",
    ]) {
      expect(canonicalRestore).toContain(table);
    }
    expect(canonicalRestore).toContain("using errcode = 'mfb05'");
    expect(canonicalRestore).toContain("'verified', true");
    expect(canonicalRestore).toContain("'source_counts', v_source_counts");
    expect(canonicalRestore).toContain("'counts', v_actual_counts");
  });

  it("preserves atomic budget clone locking and verified receipt semantics", () => {
    expect(canonicalClone).toContain("security invoker");
    expect(canonicalClone).toContain(
      "lock table public.budgets in share row exclusive mode",
    );
    expect(canonicalClone).toContain("'verified', true");
    expect(canonicalClone).toContain("not exists");
  });

  it("keeps both RPCs authenticated-only in the clean-install schema", () => {
    for (const [rpc, identity] of [
      ["restore_finance_backup", "restore_finance_backup(jsonb)"],
      [
        "clone_previous_month_budgets_atomic",
        "clone_previous_month_budgets_atomic(text)",
      ],
    ] as const) {
      const block = extractRpcBlock(schema, rpc, identity);
      expect(block).toContain(`revoke all on function public.${identity} from public, anon`);
      expect(block).toContain(`grant execute on function public.${identity} to authenticated`);
    }
  });

  it("extends read-only schema verification to both DB-SSOT-2 RPCs and their integrity guards", () => {
    expect(normalizedVerification).toContain("('restore_finance_backup')");
    expect(normalizedVerification).toContain(
      "('clone_previous_month_budgets_atomic')",
    );
    expect(normalizedVerification).toContain(
      "'export_finance_backup','restore_finance_backup','clone_previous_month_budgets_atomic'",
    );
    expect(normalizedVerification).toContain(
      "db-ssot-2 critical recovery/cross-domain rpc invariants",
    );
    expect(normalizedVerification).toContain("'mfb05'");
    expect(normalizedVerification).toContain(
      "lock table public.budgets in share row exclusive mode",
    );
  });
});
