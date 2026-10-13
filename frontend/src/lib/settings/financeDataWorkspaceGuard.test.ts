import { describe, expect, it } from "vitest";
import { resolveBackupWorkspaceAccess } from "./financeDataWorkspaceGuard";

const id = "11111111-1111-4111-8111-111111111111";
const personal = "22222222-2222-4222-8222-222222222222";
const shared = "33333333-3333-4333-8333-333333333333";
const ownerWorkspace = {
  householdId: personal,
  financeOwnerUserId: id,
  name: "Cá nhân",
  role: "owner" as const,
  isActive: true,
};

describe("SETTINGS-HOUSEHOLD-DATA-SAFETY-1 UX guard", () => {
  it("permits the verified owner of their active workspace", () => {
    expect(resolveBackupWorkspaceAccess(id, ownerWorkspace, personal, false)).toMatchObject({
      allowed: true,
      householdId: personal,
    });
  });
  it.each(["member", "viewer"] as const)("blocks a %s in the shared workspace", (role) => {
    expect(resolveBackupWorkspaceAccess(id, { ...ownerWorkspace, householdId: shared, role, financeOwnerUserId: "another-user" }, shared, false).allowed).toBe(false);
  });
  it("blocks an owner-looking workspace owned by a different account", () => {
    expect(resolveBackupWorkspaceAccess(id, { ...ownerWorkspace, financeOwnerUserId: "another-user" }, personal, false).allowed).toBe(false);
  });
  it("blocks a stale workspace selection", () => {
    expect(resolveBackupWorkspaceAccess(id, ownerWorkspace, shared, false).allowed).toBe(false);
  });
  it("blocks invalid identifiers", () => {
    expect(resolveBackupWorkspaceAccess(id, { ...ownerWorkspace, householdId: "invalid" }, "invalid", false).allowed).toBe(false);
  });
  it("blocks loading, missing auth and local UI mode", () => {
    expect(resolveBackupWorkspaceAccess(id, ownerWorkspace, personal, true).allowed).toBe(false);
    expect(resolveBackupWorkspaceAccess(null, ownerWorkspace, personal, false).allowed).toBe(false);
    expect(resolveBackupWorkspaceAccess("local-ui-user", ownerWorkspace, personal, false).allowed).toBe(false);
  });
});
