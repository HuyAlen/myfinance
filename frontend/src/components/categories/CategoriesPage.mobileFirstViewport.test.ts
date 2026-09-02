import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CATEGORIES-MOBILE-POLISH-1 — Compact Category Hierarchy & First-Viewport List Priority.
 * Updated by CATEGORY-GROUP-SORT-1 so the default sort is the category group.
 */
describe("CategoriesPage mobile first-viewport contract (CATEGORIES-MOBILE-POLISH-1)", () => {
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

  it("reduces top-level mobile spacing so the list reaches the first viewport sooner", () => {
    expect(source).toContain(
      'className="space-y-3 overflow-x-hidden pb-24 sm:space-y-5 md:pb-0"',
    );
  });

  it("keeps the mobile header compact while preserving the full desktop hierarchy", () => {
    expect(source).toContain(
      'className="hidden text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 sm:block"',
    );
    expect(source).toContain(
      'className="mt-1 hidden text-sm text-slate-500 sm:block"',
    );
    expect(source).toContain('className="hidden sm:inline">Thêm danh mục</span>');
    expect(source).toContain('aria-label="Thêm danh mục"');
  });

  it("turns the five overview KPIs into a horizontal snap rail on phones", () => {
    expect(source).toContain("flex snap-x gap-2 overflow-x-auto");
    expect(source).toContain("min-w-[112px] snap-start");
    expect(source).toContain("sm:grid sm:grid-cols-2");
    expect(source).toContain("xl:grid-cols-5");
  });

  it("keeps mobile KPI and planning-group labels on one full line without ellipsis", () => {
    expect(source).toContain(
      'whitespace-nowrap text-[9px] font-black uppercase tracking-wide opacity-70 sm:text-[10px]',
    );
    const groups = sliceBetween(
      '<div className="grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">',
      '<section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-5">',
    );
    expect(groups).toContain("mt-2 whitespace-nowrap text-[11px] font-black");
    expect(groups).not.toContain("mt-2 truncate text-[11px] font-black");
  });

  it("compresses the three planning groups into one mobile row", () => {
    const groups = sliceBetween(
      '<div className="grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">',
      '<section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:rounded-4xl sm:p-5">',
    );

    expect(groups).toContain('className="sm:hidden">{meta.shortLabel}</span>');
    expect(groups).toContain("hidden line-clamp-2");
    expect(groups).toContain("hidden w-full items-center");
    expect(groups).toContain("sm:flex");
  });

  it("keeps search visible but moves secondary filters into a mobile drawer", () => {
    expect(source).toContain("const [isFilterOpen, setIsFilterOpen] = useState(false)");
    expect(source).toContain("<SlidersHorizontal size={16} />");
    expect(source).toContain('aria-label="Mở bộ lọc danh mục"');
    expect(normalized).toContain(
      '{isFilterOpen && ( <div className="fixed inset-0 z-90 flex items-end bg-slate-900/35 sm:hidden"',
    );
    expect(source).toContain('aria-label="Bộ lọc danh mục"');
    expect(source).toContain("mt-4 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4");
  });

  it("shows how many non-default filters are active without counting search", () => {
    expect(normalized).toContain(
      'const activeFilterCount = [ typeFilter !== "all", groupFilter !== "all", activityFilter !== "all", sortBy !== "group", ].filter(Boolean).length;',
    );
    expect(source).toContain("{activeFilterCount}");
  });

  it("uses compact category cards and removes the repeated group description", () => {
    const card = sliceBetween(
      "{filteredCategories.map((category) => {",
      "{/* FINANCE-DATA-1B",
    );

    expect(card).toContain("rounded-3xl border border-slate-200 bg-white p-3");
    expect(card).toContain("whitespace-nowrap text-[clamp(12px,3.6vw,14px)]");
    expect(card).toContain("mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4");
    expect(card).not.toContain("{meta.description}");
  });

  it("moves mobile edit/delete controls into an overflow menu while retaining desktop quick actions", () => {
    const card = sliceBetween(
      "{filteredCategories.map((category) => {",
      "{/* FINANCE-DATA-1B",
    );

    expect(card).toContain('<details className="relative shrink-0 sm:hidden">');
    expect(card).toContain("<MoreHorizontal size={16} />");
    expect(card).toContain("Thao tác cho ${category.name}");
    expect(card).toContain("hidden shrink-0 gap-1.5 opacity-100 sm:flex");
  });

  it("preserves iPhone modal scrolling and adds keyboard-safe controls/footer ergonomics", () => {
    expect(source).toContain("overflow-y-auto overscroll-contain");
    expect(source).toContain(
      "scroll-pb-[calc(6rem+env(safe-area-inset-bottom))]",
    );
    expect(source).toContain("text-base outline-none");
    expect(source).toContain("sm:text-sm");
    expect(source).toContain("sticky bottom-0 z-10");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("locks background scrolling for both the form modal and filter drawer", () => {
    expect(source).toContain("if (!isFormOpen && !isFilterOpen) return");
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain("[isFilterOpen, isFormOpen]");
  });
});
