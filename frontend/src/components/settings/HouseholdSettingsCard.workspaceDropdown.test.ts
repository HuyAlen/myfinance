import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const card = readFileSync(
  path.join(repoRoot, "src/components/settings/HouseholdSettingsCard.tsx"),
  "utf8",
);

describe("HOUSEHOLD-WORKSPACE-1.2 compact workspace dropdown", () => {
  it("collapses workspace selection into one accessible active-workspace trigger", () => {
    expect(card).toContain("workspaceMenuOpen");
    expect(card).toContain('aria-haspopup="menu"');
    expect(card).toContain("aria-expanded={workspaceMenuOpen}");
    expect(card).toContain("activeWorkspaceLabel");
    expect(card).toContain("activeWorkspaceMeta");
    expect(card).not.toContain('activeWorkspace?.isPersonal ? "Personal" : "Shared Finance"');
  });

  it("uses a mobile bottom sheet and a desktop anchored dropdown from the same control", () => {
    expect(card).toContain("fixed inset-x-3 bottom-3 z-[80]");
    expect(card).toContain("sm:absolute sm:inset-x-0 sm:bottom-auto");
    expect(card).toContain("sm:top-[calc(100%+0.5rem)]");
    expect(card).toContain("mx-auto mb-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden");
  });

  it("marks the active workspace and switches through the existing safe RPC flow", () => {
    expect(card).toContain('role="menuitemradio"');
    expect(card).toContain("aria-checked={active}");
    expect(card).toContain("void handleSwitch(workspace.householdId, label)");
    expect(card).toContain("<CheckCircle2 size={18}");
  });

  it("keeps leave separate from switching and unavailable for personal or owner workspaces", () => {
    expect(card).toContain('const canLeave = !workspace.isPersonal && workspace.role !== "owner";');
    expect(card).toContain("void handleLeave(workspace.householdId, label)");
    expect(card).toContain('aria-label={`Rời ${label}`}');
  });

  it("removes the duplicated Shared Finance badge from the compact selector", () => {
    expect(card).not.toContain("Shared Finance");
    expect(card).not.toContain("ShieldCheck");
  });
});
