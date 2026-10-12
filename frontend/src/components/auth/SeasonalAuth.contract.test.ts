import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEASONAL_AUTH_PREVIEWS } from "@/src/lib/seasonal-auth";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = read("src/components/auth/SeasonalAuthShell.tsx");
const styles = read("src/components/auth/SeasonalAuthShell.module.css");
const login = read("src/components/auth/LoginPage.tsx");
const signup = read("src/components/auth/SignupPage.tsx");
const forgot = read("src/components/auth/ForgotPasswordPage.tsx");

function webpSize(data: Buffer): { width: number; height: number } {
  expect(data.toString("ascii", 0, 4)).toBe("RIFF");
  expect(data.toString("ascii", 8, 12)).toBe("WEBP");
  return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
}

describe("MYFINANCE-SEASONAL-AUTH-CINEMATIC-LIGHT-1 — auth behavior preserved", () => {
  it("keeps the same SeasonalAuthShell integration across all auth pages", () => {
    for (const page of [login, signup, forgot]) {
      expect(page).toContain('import { SeasonalAuthShell } from "@/src/components/auth/SeasonalAuthShell"');
      expect(page).toContain("<SeasonalAuthShell>");
      expect(page).toContain("</SeasonalAuthShell>");
    }
  });

  it("preserves sign-in, sign-up, reset, form submit, and route behavior", () => {
    expect(login).toContain("await signIn(email, password)");
    expect(login).toContain('router.replace("/")');
    expect(signup).toContain("await signUp(email, password)");
    expect(forgot).toContain("await resetPassword(email)");
    for (const page of [login, signup, forgot]) {
      expect(page).toContain("<form onSubmit={handleSubmit}");
    }
  });

  it("keeps the SSR-safe resolver and explicit ?season=off switch", () => {
    expect(shell).toContain('useState<SeasonalAuthTheme>("off")');
    expect(shell).toContain("window.setTimeout(refresh, 0)");
    expect(shell).toContain("resolveSeasonalAuthTheme(new Date(), requested)");
    expect(shell).toContain('new URLSearchParams(window.location.search).get("season")');
    // Inspect code references rather than matching words in explanatory comments.
    // The shell documents that Supabase flows are unchanged; that is not an import.
    expect(shell).not.toMatch(/from\s+["'][^"']*(?:lucide-react|supabase)[^"']*["']/i);
    expect(shell).not.toMatch(/\bpalette\.Icon\b|\blocalStorage\s*[.(]/);
  });
});

describe("MYFINANCE-SEASONAL-AUTH-CINEMATIC-LIGHT-1 — cinematic scenes with a light card", () => {
  it("uses one full-page scene layer instead of icon decoration", () => {
    expect(SEASONAL_AUTH_PREVIEWS).toHaveLength(6);
    expect(shell).toContain('data-myfinance-auth-season={season}');
    expect(shell).toContain('className={styles.scene} aria-hidden="true"');
    expect(styles).toContain("background-size: cover;");
    expect(styles).toContain("background-position: center center;");
    expect(styles).not.toContain(".scene::before");
    expect(styles).not.toContain("radial-gradient(");
    expect(styles).not.toContain("lucide-react");
  });

  it("maps every allowed season to one local cinematic WebP scene", () => {
    for (const season of SEASONAL_AUTH_PREVIEWS) {
      expect(styles).toContain(`.shell[data-myfinance-auth-season="${season}"]`);
      expect(styles).toContain(`url("/seasonal-auth/${season}-cinematic.webp")`);
      const photo = resolve(process.cwd(), `public/seasonal-auth/${season}-cinematic.webp`);
      expect(existsSync(photo), season).toBe(true);
      expect(statSync(photo).size, season).toBeGreaterThan(250_000);
      expect(statSync(photo).size, season).toBeLessThan(1_600_000);
      expect(webpSize(readFileSync(photo))).toEqual({ width: 2560, height: 1440 });
    }
    expect(styles).not.toContain("https://");
    expect(styles).not.toContain("http://");
  });

  it("does not draw a white or grey halo anywhere behind the logo", () => {
    expect(styles).not.toContain(".scene::before");
    expect(styles).not.toContain("--spotlight-rgb");
    expect(styles).not.toContain("radial-gradient(");
    expect(styles).not.toContain("ellipse 16rem");
    expect(styles).not.toContain("rgb(var(--seasonal-wash)");
    expect(styles).toContain("background-image: var(--seasonal-scene);");
    expect(styles).toContain("background-size: cover;");
  });

  it("keeps the brand readable using text color and shadow only", () => {
    for (const page of [login, signup, forgot]) {
      expect(page).toContain('<div data-myfinance-auth-brand className="text-center">');
    }
    expect(styles).toContain('.shell:not([data-myfinance-auth-season="off"]) [data-myfinance-auth-brand]');
    expect(styles).toContain('color: #ffffff;');
    expect(styles).toContain('color: #f4f9ff;');
    expect(styles).toContain("text-shadow:");
    expect(styles).not.toMatch(/backdrop-filter|background:\s*rgb\(255 255 255/);
  });

  it("supports dark mode and mobile portrait without muting the artwork excessively", () => {
    expect(styles).toContain(':global(html[data-theme="dark"]) .shell');
    expect(styles).toContain(':global(html[data-theme="dark"]) .scene');
    expect(styles).toContain("opacity: 0.94;");
    expect(styles).toContain('@media (max-width: 767px)');
    expect(styles).toContain("opacity: 0.90;");
  });

  it("still allows turning the whole treatment off", () => {
    expect(shell).toContain('season !== "off"');
    expect(styles).toContain("linear-gradient(180deg, #f4f8ff 0%, #edf5ff 100%)");
  });
});
