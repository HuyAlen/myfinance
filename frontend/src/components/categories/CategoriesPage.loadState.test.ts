import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CATEGORIES-CORRECTNESS-1 — Load Readiness, Activity Semantics & Mutation Safety.
 *
 * Source-inspection, not component mounting — this project does not use React
 * Testing Library for these page contracts. Whitespace is normalized before
 * matching multi-line JSX/TS blocks so CRLF and formatting changes are harmless.
 */
describe("CategoriesPage correctness contract (CATEGORIES-CORRECTNESS-1)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "CategoriesPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  function sliceBetween(startNeedle: string, endNeedle: string) {
    const start = source.indexOf(startNeedle);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(endNeedle, start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("tracks first successful critical-snapshot readiness separately from loading/error", () => {
    expect(source).toContain("hasLoadedCategorySnapshot");
    expect(source).toContain("isLoadingCategories");
    expect(source).toContain("categoriesLoadError");
    expect(source).toContain("setHasLoadedCategorySnapshot(true)");
  });

  it("loads categories + transactions + budgets atomically, without making wallets critical", () => {
    const reloadData = sliceBetween(
      "const reloadData = useCallback(async () => {",
      "const reloadWallets = useCallback(async () => {",
    );

    expect(reloadData).toContain("await Promise.all([");
    expect(reloadData).toContain("getCategories()");
    expect(reloadData).toContain("getTransactions()");
    expect(reloadData).toContain("getBudgets()");
    expect(reloadData).not.toContain("getWallets()");

    expect(reloadData).toContain("setCategories(categoryData)");
    expect(reloadData).toContain("setTransactions(transactionData)");
    expect(reloadData).toContain("setBudgets(budgetData)");
    expect(reloadData).toContain("setCategoriesLoadError(null)");

    const catchSource = reloadData.slice(reloadData.indexOf("} catch (error) {"));
    expect(catchSource).not.toContain("setCategories([])");
    expect(catchSource).not.toContain("setTransactions([])");
    expect(catchSource).not.toContain("setBudgets([])");
    expect(catchSource).toContain("setIsLoadingCategories(false)");
  });

  it("refreshes wallets independently and subscribes to wallet realtime changes", () => {
    const walletReload = sliceBetween(
      "const reloadWallets = useCallback(async () => {",
      "useEffect(() => {",
    );

    expect(walletReload).toContain("getWallets()");
    expect(walletReload).toContain("setWallets(walletData)");
    expect(walletReload).not.toContain("setCategoriesLoadError(");
    expect(normalized).toContain(
      'useRealtimeTable(["wallets"], reloadWallets);',
    );
  });

  it("does not render fake-zero overview KPI values before the critical snapshot is ready", () => {
    expect(source).toContain("OverviewCardSkeleton");
    expect(normalized).toContain("{hasLoadedCategorySnapshot ? (");
    expect(normalized).toContain(
      'const stat = hasLoadedCategorySnapshot ? groupStats[group] : null;',
    );
    expect(source).toContain('"Đang tải dữ liệu..."');
  });

  it("uses readiness-aware loading / failure / legitimate-empty branches", () => {
    expect(normalized).toContain(
      "{!hasLoadedCategorySnapshot && isLoadingCategories && (",
    );
    expect(normalized).toContain(
      "{!hasLoadedCategorySnapshot && !isLoadingCategories && categoriesLoadError && (",
    );
    expect(normalized).toContain(
      "{hasLoadedCategorySnapshot && filteredCategories.length === 0 && (",
    );
    expect(source).toContain("Không tìm thấy danh mục");
  });

  it("preserves and labels last-known-good data when a refresh fails", () => {
    expect(normalized).toContain(
      "{hasLoadedCategorySnapshot && categoriesLoadError && (",
    );
    expect(source).toContain("Đang hiển thị dữ liệu gần nhất.");
    expect(source).toContain(
      "Không thể tải hoặc làm mới dữ liệu danh mục. Vui lòng thử lại.",
    );
  });

  it("treats configured recurring categories as active even before transaction/budget usage", () => {
    expect(normalized).toContain(
      "isActive: category.isRecurring === true || usage.count > 0 || budgetCount > 0",
    );
  });

  it("blocks dependency-sensitive mutations while the critical snapshot is unready or stale", () => {
    const submit = sliceBetween(
      "async function handleSubmit(event: React.FormEvent) {",
      "function handleDelete(category: Category) {",
    );
    expect(submit).toContain(
      "if (!hasLoadedCategorySnapshot || categoriesLoadError)",
    );

    const deleteSource = sliceBetween(
      "function handleDelete(category: Category) {",
      "return (",
    );
    expect(deleteSource).toContain(
      "if (!hasLoadedCategorySnapshot || categoriesLoadError)",
    );
    expect(deleteSource).toContain("transactionSummaryByCategory");
    expect(deleteSource).toContain("budgetCountByCategory");
  });

  it("uses an immediate ref guard plus disabled submit UI to prevent double-tap writes", () => {
    expect(source).toContain("const submitInFlightRef = useRef(false)");
    expect(source).toContain("if (submitInFlightRef.current) return");
    expect(source).toContain("submitInFlightRef.current = true");
    expect(source).toContain("submitInFlightRef.current = false");
    expect(source).toContain("setIsSubmitting(true)");
    expect(source).toContain("setIsSubmitting(false)");
    expect(normalized).toContain(
      'type="submit" disabled={isSubmitting}',
    );
    expect(source).toContain("Đang lưu...");
  });

  it("keeps the iPhone modal body scrollable under the keyboard and locks page scroll behind it", () => {
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain("document.body.style.overflow = previousOverflow");
    expect(source).toContain("h-dvh min-h-0");
    expect(source).toContain("overflow-y-auto overscroll-contain");
    expect(source).toContain("touch-pan-y");
    expect(source).toContain("[-webkit-overflow-scrolling:touch]");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(normalized).toContain('aria-busy={isSubmitting}');
  });
});
