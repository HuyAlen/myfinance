import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEASONAL_AUTH_PREVIEWS, resolveSeasonalAuthTheme } from "./seasonal-auth";
import { SKIN_CHOICES, SKIN_SEASONS, seasonalSkinKey } from "./seasonalThemeSkins";
import { readAccountBirthDate, resolveAccountSeasonalTheme } from "./accountBirthdayTheme";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const profile = read("src/components/settings/SettingsPage.tsx");
const layout = read("app/layout.tsx");
const controller = read("src/components/layout/SeasonalWorkspaceThemeController.tsx");
const auth = read("src/components/auth/SeasonalAuthShell.tsx");
const picker = read("src/components/settings/SeasonalSkinPicker.tsx");
const theme = read("src/lib/accountBirthdayTheme.ts");
const workspaceCSS = read("app/seasonal-workspace.css");
const skinCSS = read("app/seasonal-skins.css");
const pageCSS = read("app/seasonal-page-atmosphere.css");

describe("MYFINANCE-ACCOUNT-BIRTHDAY-1 integration", () => {
  it("uses account-scoped Supabase metadata instead of browser theme data", () => {
    expect(profile).toContain('data-account-birth-date="true"');
    expect(profile).toContain('birth_date: profileBirthDate || null');
    expect(profile).toContain('supabase.auth.updateUser({');
    expect(profile).toContain('isValidBirthDateInput(profileBirthDate)');
    expect(profile).not.toContain('localStorage.setItem("birth_date"');
    expect(theme).not.toMatch(/localStorage|sessionStorage|supabase|fetch\(/);
    expect(readAccountBirthDate({ birth_date: "1990-07-12" })).toBe("1990-07-12");
  });

  it("keeps the profile birth-date draft null-safe and user-scoped", () => {
    expect(profile).toContain("profileBirthDateDraft !== null &&");
    expect(profile).toContain("profileBirthDateDraft.accountId === user?.id");
    expect(profile).toContain("profileBirthDateDraft.value");
  });

  it("places seasonal controller WITHIN AuthProvider to read the active account", () => {
    expect(layout.indexOf('<SeasonalWorkspaceThemeController />')).toBeGreaterThan(layout.indexOf('<AuthProvider>'));
    expect(layout.indexOf('<SeasonalWorkspaceThemeController />')).toBeLessThan(layout.indexOf('</AuthProvider>'));
    expect(controller).toContain('const { user } = useAuth()');
    expect(controller).toContain('readAccountBirthDate(user?.user_metadata)');
    expect(controller).toContain('resolveAccountSeasonalTheme(calendarTheme, now, requestedSeason, accountBirthDate)');
    expect(auth).toContain('readAccountBirthDate(user?.user_metadata)');
    expect(auth).toContain('resolveAccountSeasonalTheme(calendar, now, requested, accountBirthDate)');
  });

  it("adds Birthday as eighth theme with three independent skins", () => {
    expect(SEASONAL_AUTH_PREVIEWS).toContain("birthday");
    expect(SEASONAL_AUTH_PREVIEWS).toHaveLength(8);
    expect(SKIN_SEASONS.some(s => s.value === "birthday")).toBe(true);
    expect(SKIN_CHOICES.map(x => x.value)).toEqual(["classic","pastel","festival"]);
    expect(seasonalSkinKey("birthday")).toBe("myfinance-seasonal-skin-v1:birthday");
    expect(picker).toContain('accountBirthDate');
    expect(picker).toContain('resolveAccountSeasonalTheme(');
    for (const skin of ["pastel", "festival"]) {
      expect(skinCSS).toContain(`data-finance-workspace-season="birthday"][data-finance-season-skin="${skin}"]`);
    }
  });

  it("shows birthday for one day, honors explicit preview and returns automatically", () => {
    const now = new Date(2026, 9, 25);
    expect(resolveSeasonalAuthTheme(now)).toBe("halloween");
    expect(resolveAccountSeasonalTheme("halloween", now, null, "1990-10-25")).toBe("birthday");
    expect(resolveAccountSeasonalTheme("halloween", new Date(2026, 9, 26), null, "1990-10-25")).toBe("halloween");
    expect(resolveAccountSeasonalTheme("halloween", now, "halloween", "1990-10-25")).toBe("halloween");
  });

  it("adds bounded illustration and animation without touching finance semantics", () => {
    for (const area of ["sidebar", "topbar", "page"]) {
      const p=`public/seasonal-workspace/birthday-${area}.svg`;
      const svg=read(p);
      expect(svg).toContain('data-season-scene="birthday"');
      expect(statSync(resolve(process.cwd(), p)).size).toBeLessThan(22000);
      expect(workspaceCSS).toContain(`/seasonal-workspace/birthday-${area}.svg`);
    }
    for (const p of [
      "public/seasonal-workspace/page-atmosphere/birthday-hero.svg",
      "public/seasonal-workspace/motion/birthday-a.svg",
      "public/seasonal-workspace/motion/birthday-b.svg",
      "public/seasonal-workspace/flyby/birthday-confetti.svg",
      "public/seasonal-auth/birthday-scene.svg",
    ]) {
      const svg=read(p);
      expect(svg.startsWith("<svg"),p).toBe(true);
      expect(svg).toContain("</svg>");
      expect(svg).not.toMatch(/<script|<image|<foreignObject|(?:xlink:)?href=|url\((?:https?:|\/\/)/i);
    }
    expect(pageCSS).toContain('data-finance-workspace-season="birthday"');
    expect(skinCSS).not.toMatch(/--finance-primary:\s*|pointer-events:\s*auto|position:\s*fixed/);
    expect(workspaceCSS).toContain('birthday-a.svg');
  });
});
