import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../../../supabase/finance-seed-1-atomic-demo-seed.sql",
);
const canonicalSchemaPath = path.resolve(
  __dirname,
  "../../../../supabase/schema.sql",
);
const storagePath = path.resolve(__dirname, "financeStorage.ts");
const databaseTypesPath = path.resolve(__dirname, "../../lib/database.types.ts");

const migration = readFileSync(migrationPath, "utf8");
const storage = readFileSync(storagePath, "utf8");
const databaseTypes = readFileSync(databaseTypesPath, "utf8");

function normalize(input: string) {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function initSeedBody() {
  const start = storage.indexOf("export async function initFinanceDemoData()");
  const end = storage.indexOf("export async function resetFinanceDemoData", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return storage.slice(start, end);
}

const nonCategoryFinanceDomains = [
  "wallets",
  "transactions",
  "debts",
  "goals",
  "budgets",
  "investments",
  "savings",
  "saving_transactions",
  "forex_accounts",
  "forex_cash_transactions",
] as const;

describe("FINANCE-SEED-1 fail-closed atomic demo seed", () => {
  it("ships one authenticated SECURITY INVOKER seed RPC", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.seed_finance_demo_data(p_seed jsonb)",
    );
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.seed_finance_demo_data(jsonb) FROM PUBLIC, anon",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.seed_finance_demo_data(jsonb) TO authenticated",
    );
  });

  it("removes the browser emptiness preflight and all independent seed writes", () => {
    const body = initSeedBody();

    expect(body).toContain('supabase.rpc("seed_finance_demo_data"');
    expect(body).toContain("p_seed: seedSnapshot");
    expect(body).not.toContain('.from("wallets")');
    expect(body).not.toContain(".upsert(");
    expect(body).not.toContain("Promise.all(");
    expect(body).not.toContain('.select("id")');
  });

  it("serializes competing seed calls and freezes the authoritative check-and-seed window", () => {
    const normalized = normalize(migration);
    const advisory = normalized.indexOf("pg_advisory_xact_lock");
    const tableLock = normalized.indexOf("lock table");
    const firstExists = normalized.indexOf(
      "exists (select 1 from public.wallets where user_id = v_user_id)",
    );
    const restore = normalized.indexOf(
      "perform public.restore_finance_backup(p_seed)",
    );

    expect(advisory).toBeGreaterThanOrEqual(0);
    expect(tableLock).toBeGreaterThan(advisory);
    expect(firstExists).toBeGreaterThan(tableLock);
    expect(restore).toBeGreaterThan(firstExists);
  });

  it("fails closed on finance data while tolerating only untouched signup categories", () => {
    const normalized = normalize(migration);

    for (const domain of nonCategoryFinanceDomains) {
      expect(normalized).toContain(
        `exists (select 1 from public.${domain} where user_id = v_user_id)`,
      );
    }

    expect(normalized).toContain(
      "select count(*) into v_category_count from public.categories where user_id = v_user_id",
    );
    expect(normalized).toContain("if v_category_count <> 15 then return false");
    expect(normalized).toContain(
      "c.financial_group is not null or c.is_recurring is distinct from false",
    );
    expect(normalized).toContain(
      "distinct (c.name, c.type::text, c.planning_group)",
    );
    expect(normalized).toContain(
      "if v_default_category_shape_count <> 15 then return false",
    );

    for (const defaultName of [
      "Lương",
      "Thưởng",
      "Freelance",
      "Đầu tư",
      "Thu nhập khác",
      "Ăn uống",
      "Nhà ở",
      "Di chuyển",
      "Mua sắm",
      "Sức khỏe",
      "Giáo dục",
      "Giải trí",
      "Hóa đơn & phí",
      "Tiết kiệm",
      "Khác",
    ]) {
      expect(migration).toContain(`'${defaultName}'`);
    }

    const existingDataGuard = normalized.indexOf(
      "exists (select 1 from public.wallets where user_id = v_user_id)",
    );
    const categoryGuard = normalized.indexOf(
      "select count(*) into v_category_count",
    );
    const restore = normalized.indexOf(
      "perform public.restore_finance_backup(p_seed)",
    );

    expect(existingDataGuard).toBeGreaterThanOrEqual(0);
    expect(categoryGuard).toBeGreaterThan(existingDataGuard);
    expect(restore).toBeGreaterThan(categoryGuard);
  });

  it("delegates all mutations to FINANCE-DATA-2's already-atomic restore boundary", () => {
    const normalized = normalize(migration);

    expect(normalized).toContain(
      "perform public.restore_finance_backup(p_seed)",
    );
    expect(normalized).not.toContain("insert into public.");
    expect(normalized).not.toContain("delete from public.");
    expect(normalized).not.toContain("update public.");
  });

  it("reuses one demo snapshot serializer for auto-seed and explicit reset", () => {
    expect(storage).toContain("function buildDemoFinanceBackup(");

    const initBody = initSeedBody();
    expect(initBody).toContain("buildDemoFinanceBackup(userId)");

    const resetStart = storage.indexOf(
      "export async function resetFinanceDemoData",
    );
    const resetEnd = storage.indexOf(
      "export async function clearAllUserData",
      resetStart,
    );
    const resetBody = storage.slice(resetStart, resetEnd);
    expect(resetBody).toContain("buildDemoFinanceBackup(userId)");
    expect(resetBody).not.toContain(
      "sanitizeDemoFinanceData(buildDemoFinanceData(userId))",
    );
  });

  it("records the RPC in generated database types and canonical schema", () => {
    expect(databaseTypes).toContain(
      "seed_finance_demo_data: { Args: { p_seed: Json }; Returns: boolean }",
    );

    expect(existsSync(canonicalSchemaPath)).toBe(true);
    const schema = readFileSync(canonicalSchemaPath, "utf8");
    expect(schema).toContain(
      "CREATE OR REPLACE FUNCTION public.seed_finance_demo_data(p_seed jsonb)",
    );
    expect(normalize(schema)).toContain(
      "revoke all on function public.seed_finance_demo_data(jsonb) from public, anon",
    );
  });
});
