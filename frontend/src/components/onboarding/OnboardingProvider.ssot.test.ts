import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const provider = readFileSync(
  path.resolve(__dirname, "OnboardingProvider.tsx"),
  "utf8",
);
const help = readFileSync(
  path.resolve(__dirname, "../help/HelpPage.tsx"),
  "utf8",
);

/**
 * ONBOARDING-SSOT-1
 *
 * Help and global onboarding must render and mutate one canonical checklist
 * state. `mf-checklist` remains migration input only; it must never become an
 * active second store again.
 */
describe("ONBOARDING-SSOT-1 unified onboarding and Help checklist state", () => {
  it("keeps mf-onboarding-v1 as the only active checklist persistence key", () => {
    expect(provider).toContain('const STORAGE_KEY = "mf-onboarding-v1";');
    expect(provider).toContain(
      'const LEGACY_HELP_CHECKLIST_KEY = "mf-checklist";',
    );
    expect(help).not.toContain('localStorage.getItem("mf-checklist")');
    expect(help).not.toContain('localStorage.setItem("mf-checklist"');
  });

  it("makes Help consume the shared onboarding checklist model and context", () => {
    expect(help).toContain("CHECKLIST_ITEMS,");
    expect(help).toContain("useOnboarding,");
    expect(help).toContain("type ChecklistItemId,");
    expect(help).toContain("} = useOnboarding();");
    expect(help).not.toContain("const CHECKLIST_ITEMS: ChecklistItem[]");
  });

  it("uses the same canonical count and total on Help instead of recounting a second model", () => {
    expect(help).toContain("checklistCount: checkCount");
    expect(help).toContain("checklistTotal,");
    expect(help).toContain("isFullyOnboarded,");
    expect(help).toContain("{checkCount}/{checklistTotal}");
    expect(help).toContain("{isFullyOnboarded ? (");
    expect(help).not.toContain(
      "CHECKLIST_ITEMS.filter((item) => checklist[item.id]).length",
    );
  });

  it("lets Help update canonical onboarding state instead of writing localStorage", () => {
    expect(help).toContain("setChecklistItem,");
    expect(help).toContain("setChecklistItem(id, !checklist[id]);");
    expect(provider).toContain(
      "setChecklistItem: (id: ChecklistItemId, done: boolean) => void;",
    );
  });

  it("migrates only canonical checklist ids and never lets legacy false downgrade canonical true", () => {
    expect(provider).toContain("for (const item of CHECKLIST_ITEMS)");
    expect(provider).toContain(
      "if (legacyChecklist[item.id] !== true) continue;",
    );
    expect(provider).toContain("checklist[item.id] = true;");
    expect(provider).not.toContain("checklist[item.id] = false;");
  });

  it("preserves migrated achievements without replaying historical toasts", () => {
    expect(provider).toContain(
      "const earnedAchievements = new Set(state.earnedAchievements);",
    );
    expect(provider).toContain("earnedAchievements.add(item.achievementId);");
    expect(provider).toContain("pendingAchievement: null,");
  });

  it("removes the legacy Help key only after the canonical migration write succeeds", () => {
    expect(provider).toContain("if (persist(migrated)) {");
    expect(provider).toContain(
      "window.localStorage.removeItem(LEGACY_HELP_CHECKLIST_KEY);",
    );
  });

  it("normalizes stored checklist and achievement shapes instead of trusting arbitrary persisted keys", () => {
    expect(provider).toContain("function normalizeChecklist(value: unknown)");
    expect(provider).toContain("stored[item.id] === true");
    expect(provider).toContain("filter(isAchievementId)");
  });

  it("deduplicates newly earned achievements when a completed item is later toggled", () => {
    expect(provider).toContain("const alreadyEarned = achievement");
    expect(provider).toContain(
      "current.earnedAchievements.includes(achievement.id)",
    );
  });

  it("resets canonical onboarding and clears any stale legacy migration key", () => {
    expect(provider).toContain("const fresh = cloneDefaultState();");
    expect(provider).toContain("persist(fresh);");
    expect(provider).toContain(
      "window.localStorage.removeItem(LEGACY_HELP_CHECKLIST_KEY);",
    );
  });
});
