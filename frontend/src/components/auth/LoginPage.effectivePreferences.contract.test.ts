import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const src = readFileSync(path.resolve(__dirname, "LoginPage.tsx"), "utf8");

describe("SETTINGS-EFFECTIVE-PREFERENCES-1 after-login routing", () => {
  it("routes authenticated and newly signed-in accounts from one allowlisted resolver", () => {
    expect(src).toContain('router.replace(resolvePostLoginStartPage(user.id))');
    expect(src).toContain('router.replace(resolvePostLoginStartPage(data.user?.id))');
    expect(src).toContain('const { data, error } = await signIn(email, password)');
    expect(src).not.toContain('router.replace("/")');
  });
  it("does not add an auth route or a second user preference cache", () => {
    expect(src).not.toContain('window.localStorage.setItem(');
    expect(src).not.toContain('NEXT_PUBLIC_');
  });
});
