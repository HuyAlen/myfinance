import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const categoryPagePath = path.resolve(
  __dirname,
  "../../components/categories/CategoriesPage.tsx",
);
const storagePath = path.resolve(__dirname, "financeStorage.ts");
const databaseTypesPath = path.resolve(__dirname, "../../lib/database.types.ts");
const migrationPath = path.resolve(
  __dirname,
  "../../../supabase/category-integrity-1-budget-category-fk.sql",
);
const canonicalSchemaPath = path.resolve(
  __dirname,
  "../../../../supabase/schema.sql",
);

function read(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("CATEGORY-INTEGRITY-1 budget/category integrity contract", () => {
  it("ships a fail-closed owner-safe forward migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = normalize(read(migrationPath));

    expect(migration).toContain(
      "lock table public.categories in share row exclusive mode",
    );
    expect(migration).toContain(
      "lock table public.budgets in share row exclusive mode",
    );
    expect(migration).toContain(
      'left join public.categories c on c.user_id = b.user_id and c.id = b."categoryid"',
    );
    expect(migration).toContain(
      "constraint categories_user_id_id_key unique (user_id, id)",
    );
    expect(migration).toContain(
      'constraint budgets_category_owner_fk foreign key (user_id, "categoryid") references public.categories(user_id, id) on delete restrict on update restrict not valid',
    );
    expect(migration).toContain(
      "validate constraint budgets_category_owner_fk",
    );
    expect(migration).not.toContain("delete from public.budgets");
    expect(migration).not.toContain("update public.budgets set");
  });

  it("keeps the canonical schema synchronized with the same relationship", () => {
    const schema = normalize(read(canonicalSchemaPath));
    expect(schema).toContain(
      "constraint categories_user_id_id_key unique (user_id, id)",
    );
    expect(schema).toContain(
      'constraint budgets_category_owner_fk foreign key (user_id, "categoryid") references public.categories(user_id, id) on delete restrict on update restrict',
    );
    expect(schema).not.toContain(
      'constraint budgets_category_owner_fk foreign key (user_id, "categoryid") references public.categories(user_id, id) on delete cascade',
    );
  });

  it("loads budget dependencies and blocks deletion in the Categories UI", () => {
    const page = read(categoryPagePath);
    expect(page).toContain("getBudgets,");
    expect(page).toContain("const [budgets, setBudgets] = useState<Budget[]>([]);");
    expect(page).toContain(
      'useRealtimeTable(["categories", "transactions", "budgets"], reloadData);',
    );
    expect(page).toContain("const budgetCountByCategory = useMemo(() => {");
    expect(page).toContain("const budgetCount = budgetCountByCategory.get(category.id) ?? 0;");
    expect(page).toContain("isActive: usage.count > 0 || budgetCount > 0");
    expect(page).toContain("if (budgetCount > 0) {");
    expect(page).toContain("ngân sách liên kết");
  });

  it("maps DB FK rejection instead of leaking a raw PostgreSQL error", () => {
    const storage = read(storagePath);
    expect(storage).toContain('if (error.code === "23503")');
    expect(storage).toContain("mapCategoryIntegrityError(error)");
    expect(storage).toContain("mapBudgetCategoryIntegrityError(error)");
    expect(storage).toContain(
      "Danh mục của ngân sách không tồn tại hoặc không thuộc tài khoản hiện tại.",
    );
  });

  it("seeds FK prerequisites before dependent budgets", () => {
    const storage = read(storagePath);
    const demoStart = storage.indexOf("export async function initFinanceDemoData()");
    const demoEnd = storage.indexOf(
      "export async function resetFinanceDemoData",
      demoStart,
    );
    expect(demoStart).toBeGreaterThanOrEqual(0);
    expect(demoEnd).toBeGreaterThan(demoStart);

    const body = storage.slice(demoStart, demoEnd);
    const walletSeed = body.indexOf('supabase.from("wallets").upsert(');
    const categorySeed = body.indexOf('.from("categories")');
    const budgetSeed = body.indexOf('supabase.from("budgets").upsert(');

    expect(walletSeed).toBeGreaterThanOrEqual(0);
    expect(categorySeed).toBeGreaterThan(walletSeed);
    expect(budgetSeed).toBeGreaterThan(categorySeed);
    expect(body).toContain("if (walletSeed.error)");
    expect(body).toContain("if (categorySeed.error)");
  });

  it("records the composite relationship in database types", () => {
    const databaseTypes = read(databaseTypesPath);
    expect(databaseTypes).toContain(
      'foreignKeyName: "budgets_category_owner_fk"',
    );
    expect(databaseTypes).toContain('columns: ["user_id", "categoryId"]');
    expect(databaseTypes).toContain(
      'referencedColumns: ["user_id", "id"]',
    );
  });
});
