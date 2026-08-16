import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FINANCE-DATA-1B — Consumer Failure-State Correctness.
 *
 * Source-inspection, not component mounting — no React Testing Library in
 * this project (see AGENTS.md). Whitespace is normalized before matching
 * multi-line JSX conditionals since this repo's files are CRLF.
 */
describe("CategoriesPage distinguishes load failure from legitimate empty (FINANCE-DATA-1B)", () => {
  const source = readFileSync(
    path.resolve(__dirname, "CategoriesPage.tsx"),
    "utf8",
  );
  const normalized = source.replace(/\s+/g, " ");

  it("declares isLoadingCategories and categoriesLoadError state", () => {
    expect(source).toContain("isLoadingCategories");
    expect(source).toContain("categoriesLoadError");
  });

  it("reloadData clears the error on success and sets a message on failure, without touching category state", () => {
    const start = source.indexOf("const reloadData = useCallback(async () => {");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("}, []);", start);
    expect(end).toBeGreaterThan(start);
    const fnSource = source.slice(start, end);

    expect(fnSource).toContain("setCategoriesLoadError(null)");
    const catchIdx = fnSource.indexOf("} catch (error) {");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchSource = fnSource.slice(catchIdx);
    expect(catchSource).toContain("setCategoriesLoadError(");
    expect(catchSource).not.toContain("setCategories([])");
    expect(catchSource).toContain("setIsLoadingCategories(false)");
  });

  it("splits the 'Không tìm thấy danh mục' empty-state block into loading / error / legitimate-empty conditionals", () => {
    expect(normalized).toContain(
      "{filteredCategories.length === 0 && isLoadingCategories && (",
    );
    expect(normalized).toContain(
      "{filteredCategories.length === 0 && !isLoadingCategories && categoriesLoadError && (",
    );
    expect(normalized).toContain(
      "{filteredCategories.length === 0 && !isLoadingCategories && !categoriesLoadError && (",
    );
  });

  it("the legitimate-empty branch still shows the original copy and clear-filter CTA", () => {
    expect(source).toContain("Không tìm thấy danh mục");
  });
});
