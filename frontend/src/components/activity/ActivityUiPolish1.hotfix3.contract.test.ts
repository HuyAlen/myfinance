import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const page = readFileSync(
  path.join(root, "src/components/activity/ActivityPage.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

const iphone = readFileSync(
  path.join(root, "src/lib/auditUiIphone.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const compact = readFileSync(
  path.join(root, "src/lib/auditUiCompactHierarchy.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

const highVolume = readFileSync(
  path.join(root, "src/lib/auditUiHighVolume.contract.test.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("ACTIVITY-UI-POLISH-1 hotfix v3", () => {
  it("aligns older iPhone typography assertions with the polished actor row", () => {
    expect(iphone).toContain(
      "mt-1 flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-slate-400 sm:text-[11px]",
    );
    expect(iphone).toContain(
      "truncate text-[11px] font-black text-slate-600 sm:text-[12px]",
    );
  });

  it("aligns compact hierarchy with the full-width Activity workspace", () => {
    expect(compact).toContain('data-activity-center="true"');
    expect(compact).toContain('min-h-[76px]');
    expect(compact).toContain("actorRoleLabel");
    expect(compact).not.toContain('expect(activityPage).toContain("max-w-6xl")');
  });

  it("keeps high-volume coverage while accepting the slightly taller row", () => {
    expect(highVolume).toContain('min-h-[76px]');
    expect(highVolume).not.toContain('min-h-[72px]');
  });

  it("keeps runtime Activity polish semantics intact", () => {
    expect(page).toContain('data-activity-center="true"');
    expect(page).toContain('data-activity-desktop-filters="true"');
    expect(page).toContain("const isCurrentActor = event.actor_user_id === user?.id;");
    expect(page).toContain("actorRoleLabel");
    expect(page).toContain('min-h-[76px]');
  });
});
