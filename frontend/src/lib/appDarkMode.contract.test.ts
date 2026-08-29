import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(__dirname, "../..");
const read = (relativePath: string) =>
  readFileSync(path.join(frontendRoot, relativePath), "utf8");

const css = read("app/globals.css");
const layout = read("app/layout.tsx");
const provider = read("src/components/theme/ThemeProvider.tsx");
const header = read("src/components/layout/Header.tsx");
const settings = read("src/components/settings/SettingsPage.tsx");
const dashboard = read("src/components/dashboard/DashboardPage.tsx");
const transactions = read("src/components/transactions/TransactionsPage.tsx");
const goals = read("src/components/goals/GoalsPage.tsx");
const categories = read("src/components/categories/CategoriesPage.tsx");
const savings = read("src/components/savings/SavingsPage.tsx");
const investments = read("src/components/investments/InvestmentsPage.tsx");

describe("APP-DARK-MODE-1 cross-page theme contract", () => {
  it("boots the saved/system theme before body paint to prevent a light flash", () => {
    expect(layout).toContain("THEME_BOOTSTRAP_SCRIPT");
    expect(layout).toContain("myfinance-theme-preference");
    expect(layout).toContain("prefers-color-scheme: dark");
    expect(layout).toContain("suppressHydrationWarning");
    expect(layout).toContain("<ThemeProvider>");
    expect(layout).toContain('meta name="color-scheme" content="light dark"');
  });

  it("uses the Next.js Script bootstrap contract instead of a raw React script tag", () => {
    expect(layout).toContain('import Script from "next/script";');
    expect(layout).toContain('id="myfinance-theme-bootstrap"');
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).toContain(
      'dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}',
    );
    expect(layout).not.toMatch(/<script\b/);
  });

  it("keeps one provider as the runtime authority and follows OS changes in system mode", () => {
    expect(provider).toContain("THEME_STORAGE_KEY");
    expect(provider).toContain('root.dataset.theme = resolvedTheme');
    expect(provider).toContain('root.style.colorScheme = resolvedTheme');
    expect(provider).toContain('media.addEventListener("change", onSystemThemeChange)');
    expect(provider).toContain('themeRef.current !== "system"');
    expect(provider).toContain('meta[name="theme-color"]');
  });

  it("exposes a compact topbar quick toggle without duplicating theme authority", () => {
    expect(header).toContain('import { useTheme } from "@/src/components/theme/ThemeProvider";');
    expect(header).toContain('const { resolvedTheme, setTheme } = useTheme();');
    expect(header).toContain('data-theme-toggle="quick"');
    expect(header).toContain('setTheme(resolvedTheme === "dark" ? "light" : "dark")');
    expect(header).toContain('Chuyển sang giao diện sáng');
    expect(header).toContain('Chuyển sang giao diện tối');
    expect(header).toContain('<Sun size={17} aria-hidden="true" />');
    expect(header).toContain('<Moon size={17} aria-hidden="true" />');
    expect(header).toContain('h-11 w-11 shrink-0');
    expect(header).not.toContain('THEME_STORAGE_KEY');
  });

  it("defines a dark financial token system instead of a black inversion", () => {
    expect(css).toContain("APP-DARK-MODE-1: cross-page dark financial theme");
    expect(css).toContain('--finance-page: #0f1720');
    expect(css).toContain('--finance-surface: #17212b');
    expect(css).toContain('--finance-surface-soft: #1d2a35');
    expect(css).toContain('--finance-border: #314556');
    expect(css).toContain('--finance-text: #e7eef5');
    expect(css).toContain('--finance-primary-text: #7db4ff');
  });

  it("bridges shared neutral surfaces, custom finance colors and semantic status tints", () => {
    expect(css).toContain(':root[data-theme="dark"] body .bg-white');
    expect(css).toContain(':root[data-theme="dark"] body .text-slate-900');
    expect(css).toContain('[class~="text-[#36536B]"]');
    expect(css).toContain('[class~="bg-[#F3F7FB]"]');
    expect(css).toContain('body .bg-emerald-50');
    expect(css).toContain('body .bg-rose-50');
    expect(css).toContain('body .bg-amber-50');
  });

  it("polishes dark cards, semantic gradients and legacy finance ink without changing page logic", () => {
    expect(css).toContain("APP-DARK-MODE-1.3: dark surface consistency");
    expect(css).toContain('--finance-surface-elevated: #1b2834');
    expect(css).toContain('[class~="bg-white/75"]');
    expect(css).toContain('[class~="text-[#2F80ED]"]');
    expect(css).toContain('[class~="text-[#4F6B85]"]');
    expect(css).toContain('[class~="text-[#24384B]"]');
    expect(css).toContain('[class~="text-[#8CA0B3]"]');
    expect(css).toContain('[class~="border-[#D9E7F4]"]');
    expect(css).toContain('[class~="bg-emerald-50/70"]');
    expect(css).toContain('[class~="bg-slate-50/80"]');
    expect(css).toContain('[class~="border-emerald-200/70"]');
    expect(css).toContain('[class~="bg-rose-50/95"]');
    expect(css).toContain('[class~="from-emerald-50"]');
    expect(css).toContain('[class~="from-rose-50"]');
    expect(css).toContain('[class~="from-amber-50"]');
    expect(css).toContain('[class~="from-indigo-50"]');
    expect(css).toContain('[class~="to-white"]');
    expect(css).toContain('[class~="from-slate-50"]');
    expect(css).toContain('[class~="via-[#F8FBFF]"]');
    expect(css).toContain('[class~="focus-within:bg-white"]:focus-within');
    expect(css).toContain('[data-theme-toggle="quick"]');
  });

  it("keeps white-card translation independent of optional AppShell wrapper hooks", () => {
    expect(css).toContain("APP-DARK-MODE-1.3.1: white-surface scope integrity");
    expect(css).toContain(':root[data-theme="dark"] body .bg-white');
    expect(css).toContain(':root[data-theme="dark"] body [class~="bg-white/75"]');
    expect(css).toContain(':root[data-theme="dark"] body [class~="bg-white/95"]');
    expect(css).toContain('background-color: var(--finance-surface) !important;');
    expect(css).not.toContain(':root[data-theme="dark"] .finance-main [class~="bg-white/75"]');
    expect(css).toContain('[class~="h-1.5"][class~="rounded-full"][class~="bg-white"]');
    expect(css).toContain('--tw-gradient-to: rgba(27, 40, 52, 0.98) !important;');
  });

  it("owns Dashboard executive surfaces through semantic runtime hooks", () => {
    expect(css).toContain("APP-DARK-MODE-1.3.2: Dashboard native dark surfaces & runtime integrity");
    expect(css).toContain('[data-dashboard-surface="hero-mini"]');
    expect(css).toContain('[data-dashboard-surface="networth-history"]');
    expect(css).toContain('[data-dashboard-surface="networth-snapshot"]');
    expect(css).toContain('[data-dashboard-ink="hero-title"]');
    expect(css).toContain('[data-dashboard-action="reports"]');
    expect(dashboard).toContain('data-dashboard-surface="hero-shell"');
    expect(dashboard).toContain('data-dashboard-surface="hero-mini"');
    expect(dashboard).toContain('data-dashboard-surface="networth-history"');
    expect(dashboard).toContain('data-dashboard-surface="networth-snapshot"');
  });

  it("eliminates residual cross-page Light surfaces through page-owned runtime hooks", () => {
    expect(css).toContain("APP-DARK-MODE-1.3.3: cross-page native dark surfaces & residual light elimination");
    expect(css).toContain('[data-dark-surface="transaction-feed-summary"]');
    expect(css).toContain('[data-dark-surface="transaction-day-header"]');
    expect(css).toContain('[data-dark-surface="goal-card-metrics"]');
    expect(css).toContain('[data-dark-surface="goal-forecast"]');
    expect(css).toContain('[data-dark-surface="category-stats"]');
    expect(css).toContain('[data-dark-surface="savings-filter-tabs"]');
    expect(css).toContain('[data-dark-surface="savings-forecast-item"]');
    expect(css).toContain('[data-dark-surface="savings-account-meta"]');
    expect(css).toContain('[data-dark-surface="investment-capital-summary"]');

    expect(transactions).toContain('data-dark-surface="transaction-feed-summary"');
    expect(transactions).toContain('data-dark-surface="transaction-day-header"');
    expect(goals).toContain('data-dark-surface="goal-card-metrics"');
    expect(goals).toContain('data-dark-surface="goal-forecast"');
    expect(goals).toContain('data-dark-surface="goal-progress-track"');
    expect(categories).toContain('data-dark-surface="category-stats"');
    expect(savings).toContain('data-dark-surface="savings-filter-tabs"');
    expect(savings).toContain('data-dark-surface="savings-forecast-item"');
    expect(savings.match(/data-dark-surface="savings-account-meta"/g)?.length).toBe(2);
    expect(investments).toContain('data-dark-surface="investment-capital-summary"');
  });

  it("covers native forms, charts, skeletons and iPhone shell surfaces", () => {
    expect(css).toContain('input:not([type="checkbox"])');
    expect(css).toContain('.recharts-default-tooltip');
    expect(css).toContain('animation-name: skeleton-pulse-dark');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain(':root[data-theme="dark"] .finance-bottom-nav');
  });

  it("exposes Light, Dark and Device choices in Settings and validates legacy saved values", () => {
    expect(settings).toContain('useTheme()');
    expect(settings).toContain('isThemePreference(saved.theme)');
    expect(settings).toContain('{ val: "light", label: "Sáng" }');
    expect(settings).toContain('{ val: "dark", label: "Tối" }');
    expect(settings).toContain('{ val: "system", label: "Thiết bị" }');
    expect(settings).not.toContain('const [theme, setTheme] = useState("light")');
  });
});
