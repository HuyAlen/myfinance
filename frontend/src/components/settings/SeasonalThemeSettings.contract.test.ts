import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SeasonalThemeSettingsCard from "./SeasonalThemeSettingsCard";

const fakePreference = vi.hoisted(() => ({
  enabled: true,
  calls: [] as boolean[],
}));

vi.mock("@/src/lib/seasonalThemePreference", () => ({
  useSeasonalThemeEnabled: () => fakePreference.enabled,
  setSeasonalThemeEnabled: (next: boolean) => {
    fakePreference.calls.push(next);
    fakePreference.enabled = next;
  },
  toggleSeasonalThemeEnabled: () => {
    fakePreference.enabled = !fakePreference.enabled;
    fakePreference.calls.push(fakePreference.enabled);
  },
}));

function findSwitch(node: ReactNode): { onClick?: () => void } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findSwitch(child);
      if (match) return match;
    }
    return null;
  }
  if (!isValidElement<{
    role?: string;
    onClick?: () => void;
    children?: ReactNode;
  }>(node)) return null;
  if (node.props.role === "switch") return node.props;
  return findSwitch(node.props.children);
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shell = read("src/components/layout/AppShell.tsx");
const page = read("src/components/settings/SettingsPage.tsx");
const card = read("src/components/settings/SeasonalThemeSettingsCard.tsx");
const workspaceController = read("src/components/layout/SeasonalWorkspaceThemeController.tsx");
const authShell = read("src/components/auth/SeasonalAuthShell.tsx");
const preference = read("src/lib/seasonalThemePreference.ts");
const flyby = read("src/components/layout/SeasonalWorkspaceFlyby.tsx");

describe("MYFINANCE-SEASONAL-THEME-SETTINGS-PLACEMENT-1 contract", () => {
  it("locates the seasonal switch inside the existing Tùy chỉnh sidebar destination", () => {
    const beginning = page.indexOf('id="settings-preferences"');
    const ending = page.indexOf('id="settings-financial"');
    const between = page.slice(beginning, ending);
    expect(beginning).toBeGreaterThan(-1);
    expect(ending).toBeGreaterThan(beginning);
    expect(page).toContain('{ id: "preferences", label: "Tùy chỉnh", icon: Sliders }');
    expect(page).toContain('onClick={() => scrollTo(s.id)}');
    expect(between).toContain('<SeasonalThemeSettingsCard />');
    expect(between).toContain('title="Tùy chỉnh ứng dụng"');
    expect(between.indexOf('<SeasonalThemeSettingsCard />')).toBeGreaterThan(
      between.indexOf('Sáng, tối hoặc theo giao diện thiết bị'),
    );
    expect(page.match(/<SeasonalThemeSettingsCard \/>/g)).toHaveLength(1);
  });

  it("removes the oversized AppShell settings banner without touching finance layout", () => {
    expect(shell).not.toContain('import SeasonalThemeSettingsCard from');
    expect(shell).not.toContain('<SeasonalThemeSettingsCard />');
    expect(shell).not.toContain('pathname === "/settings"');
    expect(shell).toContain('<SeasonalWorkspaceAmbientMotion area="page" />');
    expect(shell).toContain('<FabSuppressionProvider');
    expect(page).toContain('title="Hồ sơ cá nhân"');
  });

  it("keeps an accessible full-row touch switch independent of dark mode", () => {
    expect(card).toContain('role="switch"');
    expect(card).toContain('aria-checked={enabled}');
    expect(card).toContain('onClick={toggleSeasonalThemeEnabled}');
    expect(card).not.toContain('setSeasonalThemeEnabled(!enabled)');
    expect(card).toContain('data-settings-section="seasonal-theme"');
    expect(card).toContain('className="min-w-0"');
    expect(card).toContain('min-h-16 w-full cursor-pointer touch-manipulation');
    expect(card).toContain('aria-describedby="seasonal-theme-settings-description seasonal-theme-settings-status"');
    expect(card).not.toContain('rounded-3xl border border-slate-200 bg-white');
    expect(page).toContain('onClick={() => setTheme(opt.val)}');
  });

  it("keeps the OFF preference authoritative over season preview", () => {
    expect(workspaceController).toContain('theme === "off" || !readSeasonalThemeEnabled()');
    expect(workspaceController).toContain('root.getAttribute(ATTRIBUTE) !== theme');
    expect(workspaceController).toContain('[pathname, requestedSeason, seasonalEnabled]');
    expect(authShell).toContain('seasonalEnabled ? resolveSeasonalAuthTheme(new Date(), requested) : "off"');
    expect(authShell).toContain('return seasonalEnabled ? season : "off"');
    expect(preference).toContain('root.removeAttribute(WORKSPACE_ATTRIBUTE)');
  });

  it("retains browser persistence and the same ambient-motion OFF behavior", () => {
    expect(preference).toContain('useSyncExternalStore');
    expect(preference).toContain('localStorage.setItem');
    expect(preference).toContain('addEventListener("storage", handleCrossTabChange)');
    expect(flyby).toContain('attributeFilter: [THEME_ATTRIBUTE]');
    expect(flyby).toContain('stopMotion()');
  });

  it("introduces no modal, overlay, DB write or finance-settings auto-save", () => {
    expect(card).not.toMatch(/fetch\(|supabase|<dialog|<form|fixed inset|z-\d+/i);
    expect(card).toContain('type="button"');
    expect(preference).not.toMatch(/supabase|fetch\(|indexedDB|sessionStorage/i);
  });
});


describe("MYFINANCE-SEASONAL-TOGGLE-VISUAL-HOTFIX-1 runtime contract", () => {
  it("renders the knob on the right when enabled and left when disabled", () => {
    fakePreference.enabled = true;
    const on = renderToStaticMarkup(createElement(SeasonalThemeSettingsCard));
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('data-seasonal-theme-state="on"');
    expect(on).toContain('style="transform:translateX(20px)"');
    expect(on).toContain("bg-blue-600");

    fakePreference.enabled = false;
    const off = renderToStaticMarkup(createElement(SeasonalThemeSettingsCard));
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('data-seasonal-theme-state="off"');
    expect(off).toContain('style="transform:translateX(0px)"');
    expect(off).toContain("bg-slate-200");
  });

  it("sends ON and OFF clicks through the atomic preference toggle", () => {
    fakePreference.enabled = true;
    fakePreference.calls = [];
    const turnOff = findSwitch(SeasonalThemeSettingsCard());
    expect(turnOff?.onClick).toBeTypeOf("function");
    turnOff?.onClick?.();
    expect(fakePreference.calls).toEqual([false]);
    expect(fakePreference.enabled).toBe(false);

    const turnOn = findSwitch(SeasonalThemeSettingsCard());
    turnOn?.onClick?.();
    expect(fakePreference.calls).toEqual([false, true]);
    expect(fakePreference.enabled).toBe(true);
  });
});


describe("MYFINANCE-SEASONAL-TOGGLE-TAP-TARGET-1 accessibility and hit-target", () => {
  it("makes the entire label, description, icon and switch one clickable native button", () => {
    fakePreference.enabled = true;
    const html = renderToStaticMarkup(createElement(SeasonalThemeSettingsCard));
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(1);
    const fullRowSwitch = buttons[0];
    expect(fullRowSwitch).toContain('role="switch"');
    expect(fullRowSwitch).toContain('min-h-16 w-full cursor-pointer touch-manipulation');
    expect(fullRowSwitch).toContain('id="seasonal-theme-settings-title"');
    expect(fullRowSwitch).toContain('id="seasonal-theme-settings-description"');
    expect(fullRowSwitch).toContain('pointer-events-none');
    expect(fullRowSwitch).toContain('focus-visible:outline');
    expect(fullRowSwitch).toContain('active:bg-blue-100/60');
    expect(html.indexOf('</button>')).toBeLessThan(html.indexOf('role="status"'));
  });

  it("preserves native button keyboard activation and keeps OFF/ON states aligned", () => {
    fakePreference.enabled = true;
    fakePreference.calls = [];
    const button = findSwitch(SeasonalThemeSettingsCard());
    expect(button?.onClick).toBeTypeOf("function");
    expect(renderToStaticMarkup(createElement(SeasonalThemeSettingsCard))).toContain('aria-checked="true"');
    button?.onClick?.();
    const off = renderToStaticMarkup(createElement(SeasonalThemeSettingsCard));
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('data-seasonal-theme-state="off"');
    expect(off).toContain('style="transform:translateX(0px)"');
    findSwitch(SeasonalThemeSettingsCard())?.onClick?.();
    const on = renderToStaticMarkup(createElement(SeasonalThemeSettingsCard));
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('data-seasonal-theme-state="on"');
    expect(on).toContain('style="transform:translateX(20px)"');
    expect(fakePreference.calls).toEqual([false, true]);
  });
});


describe("MYFINANCE-SEASONAL-TOGGLE-RELIABILITY-1 rapid-input regression", () => {
  it("toggles twice from the SAME onClick closure even before a new React render", () => {
    fakePreference.enabled = true;
    fakePreference.calls = [];
    const originalHandler = findSwitch(SeasonalThemeSettingsCard())?.onClick;
    expect(originalHandler).toBeTypeOf("function");

    // The previous `!enabled` closure produced [false, false] here.
    originalHandler?.();
    originalHandler?.();
    expect(fakePreference.calls).toEqual([false, true]);
    expect(fakePreference.enabled).toBe(true);
  });

  it("avoids stale closure and redundant flyby mutations in the page controller", () => {
    expect(card).toContain('onClick={toggleSeasonalThemeEnabled}');
    expect(preference).toContain('setSeasonalThemeEnabled(!readSeasonalThemeEnabled())');
    expect(preference).toContain('root.getAttribute(WORKSPACE_ATTRIBUTE) !== nextSeason');
    expect(workspaceController).toContain('!readSeasonalThemeEnabled()');
    expect(workspaceController).toContain('if (root.hasAttribute(ATTRIBUTE))');
    expect(workspaceController).toContain('root.getAttribute(ATTRIBUTE) !== theme');
  });
});
